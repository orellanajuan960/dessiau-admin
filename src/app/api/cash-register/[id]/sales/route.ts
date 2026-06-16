import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify the cash register exists
    const register = await db.cashRegister.findUnique({
      where: { id },
    })

    if (!register) {
      return NextResponse.json(
        { error: 'Caja no encontrada' },
        { status: 404 }
      )
    }

    // Get payment methods from DB (with fallback) to determine cash/credit flags
    const paymentMethodDefs = await getPaymentMethodsFromDB()

    function getMethodDef(code: string) {
      return (
        paymentMethodDefs.find((m) => m.code === code) ??
        FALLBACK_METHODS.find((m) => m.code === code) ?? null
      )
    }

    // Fetch all completed sales for this register with full relations
    const sales = await db.sale.findMany({
      where: {
        cashRegId: id,
        status: 'completada',
      },
      orderBy: { date: 'desc' },
      include: {
        client: true,
        user: true,
        lines: {
          include: {
            product: {
              select: {
                name: true,
                currency: {
                  select: { code: true },
                },
              },
            },
          },
        },
        payments: {
          include: {
            currency: {
              select: { code: true },
            },
          },
        },
      },
    })

    // ---------------------------------------------------------------
    // 1) Build methodBreakdown – aggregate by (method, currency)
    // ---------------------------------------------------------------
    const methodMap = new Map<
      string, // key = "method|currencyCode"
      { method: string; methodName: string; isCredit: boolean; currencyCode: string; count: Set<string>; total: number }
    >()

    for (const sale of sales) {
      for (const payment of sale.payments) {
        const def = getMethodDef(payment.method)
        const methodName = def?.name ?? payment.method
        const isCredit = def?.isCredit ?? false
        const currencyCode = payment.currency?.code ?? ''

        const key = `${payment.method}|${currencyCode}`
        if (!methodMap.has(key)) {
          methodMap.set(key, {
            method: payment.method,
            methodName,
            isCredit,
            currencyCode,
            count: new Set<string>(),
            total: 0,
          })
        }

        const entry = methodMap.get(key)!
        entry.count.add(sale.id)
        entry.total += payment.amount
      }
    }

    const methodBreakdown = Array.from(methodMap.entries()).map(
      ([, data]) => ({
        method: data.method,
        methodName: data.methodName,
        isCredit: data.isCredit,
        currencyCode: data.currencyCode,
        count: data.count.size,
        total: roundTwo(data.total),
      })
    )

    // ---------------------------------------------------------------
    // 2) Build creditSales detail – with actual credit amount & currency
    // ---------------------------------------------------------------
    const creditSales: Array<{
      saleId: string
      saleDate: string
      saleNumber: string
      clientName: string
      saleTotal: number
      creditAmount: number
      creditAmountByCurrency: Record<string, number>
      pendingBalance: number
      currencyCode: string
      products: Array<{ name: string; quantity: number; lineTotal: number; currencyCode: string }>
    }> = []

    const creditSaleIds: string[] = []

    for (const sale of sales) {
      const creditPayments = sale.payments.filter((p) => {
        const def = getMethodDef(p.method)
        return def?.isCredit ?? false
      })

      if (creditPayments.length === 0) continue

      creditSaleIds.push(sale.id)

      const creditPaymentAmount = roundTwo(creditPayments.reduce((s, p) => s + p.amount, 0))

      // Build products with their original currency
      const productCurrencies = new Set<string>()
      const amountByCurrency: Record<string, number> = {}
      const products = sale.lines.map((l) => {
        const code = l.currencyCode || l.product?.currency?.code || ''
        if (code) productCurrencies.add(code)
        amountByCurrency[code] = (amountByCurrency[code] || 0) + l.lineTotal
        return {
          name: l.product?.name ?? 'Producto eliminado',
          quantity: l.quantity,
          lineTotal: roundTwo(l.lineTotal),
          currencyCode: code,
        }
      })

      // For single-currency credit sales, show amount in product currency
      // creditAmountByCurrency stores the sum of product lineTotals per currency
      const creditAmountByCurrency: Record<string, number> = {}
      for (const [code, amt] of Object.entries(amountByCurrency)) {
        creditAmountByCurrency[code] = roundTwo(amt)
      }

      const derivedCurrencies = [...productCurrencies].filter(Boolean)
      const currencyCode = derivedCurrencies.length === 1
        ? derivedCurrencies[0]
        : ''

      creditSales.push({
        saleId: sale.id,
        saleDate: sale.date.toISOString(),
        saleNumber: sale.number ?? '',
        clientName: sale.client?.name ?? 'Consumidor final',
        saleTotal: roundTwo(sale.total),
        creditAmount: roundTwo(creditPaymentAmount),
        creditAmountByCurrency,
        pendingBalance: creditPaymentAmount, // default; updated below
        currencyCode,
        products,
      })
    }

    // Batch-fetch account receivables for credit sales
    if (creditSaleIds.length > 0) {
      const receivables = await db.accountReceivable.findMany({
        where: {
          saleId: { in: creditSaleIds },
        },
        select: {
          saleId: true,
          pendingBalance: true,
        },
      })

      const receivableMap = new Map<string, number>()
      for (const r of receivables) {
        receivableMap.set(r.saleId, r.pendingBalance)
      }

      for (const cs of creditSales) {
        if (receivableMap.has(cs.saleId)) {
          cs.pendingBalance = roundTwo(receivableMap.get(cs.saleId)!)
        }
      }
    }

    // ---------------------------------------------------------------
    // 3) Build full sales list (exclude credit-only sales — they appear in creditSales)
    // ---------------------------------------------------------------
    const salesList = sales
      .filter((sale) => {
        // Exclude sales where ALL payments are credit methods
        const allCredit = sale.payments.every((p) => {
          const def = getMethodDef(p.method)
          return def?.isCredit ?? false
        })
        return !allCredit
      })
      .map((sale) => ({
      id: sale.id,
      date: sale.date.toISOString(),
      number: sale.number ?? '',
      total: roundTwo(sale.total),
      status: sale.status,
      clientName: sale.client?.name ?? 'Consumidor final',
      userName: sale.user?.name ?? '',
      payments: sale.payments.map((p) => ({
        method: p.method,
        amount: roundTwo(p.amount),
        currencyCode: p.currency?.code ?? '',
      })),
      products: sale.lines.map((l) => ({
        name: l.product?.name ?? 'Producto eliminado',
        quantity: l.quantity,
        lineTotal: roundTwo(l.lineTotal),
        // Use SaleLine.currencyCode first (set at sale time), fallback to product's current currency
        currencyCode: l.currencyCode || l.product?.currency?.code || '',
      })),
    }))

    // ---------------------------------------------------------------
    // 4) Compute totals (all non-credit)
    // ---------------------------------------------------------------
    let totalSales = 0
    let totalCash = 0
    let totalCredit = 0
    let totalOther = 0

    for (const sale of sales) {
      totalSales += sale.total

      for (const payment of sale.payments) {
        const def = getMethodDef(payment.method)
        const isCash = def?.isCash ?? false
        const isCredit = def?.isCredit ?? false

        if (isCash) {
          totalCash += payment.amount
        } else if (isCredit) {
          totalCredit += payment.amount
        } else {
          totalOther += payment.amount
        }
      }
    }

    // ---------------------------------------------------------------
    // 5) Fetch manual movements (entrada/salida) for the register
    // ---------------------------------------------------------------
    const movements = await db.cashMovement.findMany({
      where: {
        cashRegId: id,
        type: { in: ['entrada', 'salida'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
      },
    })

    // Get method names for display
    const methodDefs = await getPaymentMethodsFromDB()

    const manualMovements = movements.map(m => {
      const methodDef = methodDefs.find(d => d.code === m.method)
        ?? FALLBACK_METHODS.find(d => d.code === m.method)
      return {
        id: m.id,
        type: m.type,
        amount: roundTwo(m.amount),
        concept: m.concept,
        method: m.method || '',
        methodName: methodDef?.name || m.method || 'Sin especificar',
        currencyCode: m.currency?.code || '',
        userName: m.user?.name || '',
        createdAt: m.createdAt.toISOString(),
      }
    })

    return NextResponse.json({
      methodBreakdown,
      creditSales,
      sales: salesList,
      totalSales: roundTwo(totalSales),
      totalCash: roundTwo(totalCash),
      totalCredit: roundTwo(totalCredit),
      totalOther: roundTwo(totalOther),
      movements: manualMovements,
    })
  } catch (error) {
    console.error('[cash-register][id][sales] GET error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}