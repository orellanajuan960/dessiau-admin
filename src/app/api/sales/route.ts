import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId, branchFromBody } from '@/lib/resolve-branch'
import { formatCurrency } from '@/lib/currency'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'
import { convertToRefCurrency } from '@/lib/currency-conversion'
import { getCurrencyForCountry } from '@/lib/country-currency'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit
    const branchId = await resolveBranchId(request)

    const where: Record<string, unknown> = { branchId }
    if (status) where.status = status
    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          payments: { include: { currency: true } },
          lines: { include: { product: { select: { id: true, name: true } } } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      db.sale.count({ where }),
    ])

    return NextResponse.json({
      data: sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ventas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, cashRegId, userId, lines, payments } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }
    if (!lines || lines.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos una línea de venta' }, { status: 400 })
    }

    const branchId = branchFromBody(body) || await resolveBranchId()
    const ivaEnabled = body.ivaEnabled === true
    const ivaRate = Number(body.ivaRate) || 0

    const settings = await db.settings.findFirst()
    const refCurrency = await db.currency.findFirst({ where: { code: settings?.referenceCurrency || 'USD' } })

    // SERVER-SIDE STOCK VALIDATION (race condition protection)
    const productIds = lines.map((l: { productId: string }) => l.productId)
    const inventories = await db.inventory.findMany({
      where: {
        productId: { in: productIds },
        branchId,
      },
    })
    const inventoryMap = new Map(inventories.map((inv) => [inv.productId, inv]))

    const insufficientStock: string[] = []
    for (const line of lines) {
      const qty = Math.round(line.quantity * 10000) / 10000
      const inv = inventoryMap.get(line.productId)
      const availableStock = inv?.stock || 0
      if (qty > availableStock) {
        const product = await db.product.findUnique({ where: { id: line.productId }, select: { name: true } })
        insufficientStock.push(`"${product?.name || line.productId}": solicitado ${qty}, disponible ${availableStock}`)
      }
    }

    if (insufficientStock.length > 0) {
      return NextResponse.json({
        error: `Stock insuficiente: ${insufficientStock.join('; ')}`,
      }, { status: 400 })
    }

    // Fetch product costAvg and currency for each line
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, costAvg: true, price: true, currencyId: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Fetch currency codes for products
    const currencyIds = [...new Set(products.map((p) => p.currencyId).filter(Boolean))]
    const currencies = currencyIds.length > 0
      ? await db.currency.findMany({ where: { id: { in: currencyIds } }, select: { id: true, code: true } })
      : []
    const currencyMap = new Map(currencies.map((c) => [c.id, c.code]))

    // Determine local and reference currency for conversion
    const country = settings?.country || 'VE'
    const localInfo = getCurrencyForCountry(country)
    const localCode = localInfo?.code || ''
    const refCode = settings?.referenceCurrency || 'USD'
    const exRate = settings?.exchangeRate || 0
    const eurRate = settings?.eurRate || 0
    const usdRate = settings?.usdRate || 0
    const multiCurrency = settings?.multiCurrencyEnabled === true

    // Calculate totals — convert each line to reference currency before summing
    let total = 0
    const saleLinesData = lines.map((line: { productId: string; quantity: number; unitPrice: number }) => {
      const product = productMap.get(line.productId)
      const unitCost = product?.costAvg || 0
      const unitPrice = line.unitPrice || product?.price || 0
      const qty = Math.round(line.quantity * 10000) / 10000 // Fix floating-point precision
      const lineTotal = qty * unitPrice
      const lineProfit = qty * (unitPrice - unitCost)
      const currencyCode = product?.currencyId ? (currencyMap.get(product.currencyId) || '') : ''

      // Convert lineTotal to reference currency for the sale total
      let lineTotalInRef = lineTotal
      if (multiCurrency && exRate > 0) {
        lineTotalInRef = convertToRefCurrency(
          lineTotal, currencyCode, refCode, localCode, exRate, eurRate, usdRate,
        )
      }
      total += lineTotalInRef

      return {
        productId: line.productId,
        quantity: qty,
        unitPrice,
        unitCost,
        lineTotal: Math.round(lineTotal * 100) / 100,
        lineProfit: Math.round(lineProfit * 100) / 100,
        currencyCode,
      }
    })

    total = Math.round(total * 100) / 100

    // Add IVA to total if enabled
    let ivaAmount = 0
    if (ivaEnabled && ivaRate > 0) {
      ivaAmount = Math.round(total * (ivaRate / 100) * 100) / 100
      total = Math.round((total + ivaAmount) * 100) / 100
    }

    // Create sale with lines and payments in a transaction
    const sale = await db.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          clientId: clientId || null,
          cashRegId: cashRegId || null,
          userId,
          branchId,
          total,
          status: 'completada',
          currencyId: refCurrency?.id || '',
          lines: { create: saleLinesData },
          payments: {
            create: payments.map((p: { method: string; amount: number; currencyId: string; reference?: string }) => ({
              method: p.method,
              amount: p.amount,
              currencyId: p.currencyId,
              reference: p.reference || null,
            })),
          },
        },
        include: {
          lines: { include: { product: { select: { id: true, name: true } } } },
          payments: { include: { currency: true } },
          client: { select: { id: true, name: true } },
        },
      })

      // Deduct inventory stock for each product
      for (const line of lines) {
        const qty = Math.round(line.quantity * 10000) / 10000
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId } },
        })
        if (inventory) {
          const newStock = Math.round((inventory.stock - qty) * 10000) / 10000
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: newStock },
          })
        }
      }

      // Low stock notification to admin users — ONE notification per admin summarizing all low stock
      const notifiedUsers = await tx.user.findMany({
        where: { role: { in: ['admin', 'gerente'] }, active: true },
        select: { id: true },
      })

      // Collect unique low-stock products
      const lowStockProducts: string[] = []
      for (const line of lines) {
        const inv = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId } },
          include: { product: { select: { name: true } } },
        })
        if (inv && inv.minStock > 0 && inv.stock <= inv.minStock) {
          const msg = `"${inv.product.name}" tiene ${inv.stock} uds (mín: ${inv.minStock})`
          if (!lowStockProducts.includes(msg)) {
            lowStockProducts.push(msg)
          }
        }
      }

      // Create one notification per admin with all low-stock products
      if (lowStockProducts.length > 0) {
        for (const manager of notifiedUsers) {
          await tx.notification.create({
            data: {
              userId: manager.id,
              title: `Stock Bajo (${lowStockProducts.length} producto${lowStockProducts.length > 1 ? 's' : ''})`,
              message: lowStockProducts.join('. ') + '. Reposición necesaria.',
              type: 'warning',
            },
          })
        }
      }

      // Determine payment method types from DB
      const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
      const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))
      const creditCodes = new Set(pmList.filter(m => m.isCredit).map(m => m.code))

      // Update cash register currentAmt for cash + non-credit payments (transfer, card, etc.)
      // Credit does NOT add to currentAmt since no money enters the register
      if (cashRegId) {
        const nonCreditPayments = payments.filter((p: { method: string }) => !creditCodes.has(p.method))
        const nonCreditTotal = nonCreditPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
        if (nonCreditTotal > 0) {
          const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
          if (reg) {
            await tx.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((reg.currentAmt + nonCreditTotal) * 100) / 100 },
            })
          }
        }
      }

      // Handle credit sale - create account receivable
      const creditPayments = payments.filter((p: { method: string }) => creditCodes.has(p.method))
      for (const cp of creditPayments) {
        if (clientId) {
          // Round to 2 decimals so amount and pendingBalance always match exactly
          const roundedAmount = Math.round(cp.amount * 100) / 100
          await tx.accountReceivable.create({
            data: {
              clientId,
              saleId: newSale.id,
              amount: roundedAmount,
              pendingBalance: roundedAmount,
              status: 'pendiente',
              currencyId: cp.currencyId || refCurrency?.id || '',
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
        }
      }

      return newSale
    })

    return NextResponse.json(sale, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear venta' }, { status: 500 })
  }
}
