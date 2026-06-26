import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params
    const body = await request.json()
    const { lines, userId, branchId: bodyBranchId } = body

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos un producto' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const client = await db.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const branchId = bodyBranchId || await resolveBranchId()

    // Get base currency from settings
    const settings = await db.settings.findFirst()
    const baseCurrency = settings?.baseCurrencyId
      ? await db.currency.findUnique({ where: { id: settings.baseCurrencyId } })
      : null

    const result = await db.$transaction(async (tx) => {
      let totalAmount = 0
      const saleLinesData: Array<{ productId: string; quantity: number; unitPrice: number; unitCost: number; lineTotal: number; lineProfit: number; currencyCode: string; currencyId: string }> = []
      // Track totals by currency for separate receivables
      const totalsByCurrency: Record<string, number> = {}

      for (const line of lines) {
        const product = await tx.product.findUnique({
          where: { id: line.productId },
          include: { inventories: { where: { branchId } }, currency: { select: { id: true, code: true } } },
        })

        if (!product) {
          throw new Error(`Producto no encontrado: ${line.productId}`)
        }

        const inventory = product.inventories[0]
        const unitPrice = line.unitPrice || product.price
        const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100
        const curCode = product.currency?.code || ''
        const curId = product.currency?.id || baseCurrency?.id || ''

        if (inventory && line.quantity > inventory.stock) {
          throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${inventory.stock}, Solicitado: ${line.quantity}`)
        }

        // Deduct stock
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { decrement: line.quantity } },
          })
        }

        totalAmount += lineTotal
        saleLinesData.push({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice,
          unitCost: product.costAvg,
          lineTotal,
          lineProfit: Math.round((unitPrice - product.costAvg) * line.quantity * 100) / 100,
          currencyCode: curCode,
          currencyId: curId,
        })

        // Accumulate by currency
        if (curId) {
          totalsByCurrency[curId] = (totalsByCurrency[curId] || 0) + lineTotal
        }
      }

      totalAmount = Math.round(totalAmount * 100) / 100

      // Create the sale with currencyId
      const sale = await tx.sale.create({
        data: {
          clientId,
          userId,
          branchId,
          total: totalAmount,
          status: 'completada',
          currencyId: baseCurrency?.id || '',
          lines: {
            create: saleLinesData,
          },
        },
        include: {
          lines: { include: { product: { select: { name: true } } } },
        },
      })

      // Create separate AccountReceivables per currency
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30)

      for (const [curId, lineTotal] of Object.entries(totalsByCurrency)) {
        const rounded = Math.round(lineTotal * 100) / 100
        await tx.accountReceivable.create({
          data: {
            clientId,
            saleId: sale.id,
            amount: rounded,
            pendingBalance: rounded,
            dueDate,
            status: 'pendiente',
            currencyId: curId,
          },
        })
      }

      return sale
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error al registrar despacho'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
