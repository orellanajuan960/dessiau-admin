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
              select: { name: true },
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
    // 1) Build methodBreakdown – aggregate by payment method
    // ---------------------------------------------------------------
    const methodMap = new Map<
      string,
      { methodName: string; isCredit: boolean; count: Set<string>; total: number }
    >()

    for (const sale of sales) {
      // Track which methods were used in this sale to count unique sales per method
      const methodsInSale = new Set<string>()

      for (const payment of sale.payments) {
        methodsInSale.add(payment.method)

        const def = getMethodDef(payment.method)
        const methodName = def?.name ?? payment.method
        const isCredit = def?.isCredit ?? false

        if (!methodMap.has(payment.method)) {
          methodMap.set(payment.method, {
            methodName,
            isCredit,
            count: new Set<string>(),
            total: 0,
          })
        }

        const entry = methodMap.get(payment.method)!
        entry.count.add(sale.id)
        entry.total += payment.amount
      }

      // Edge-case: a sale with zero payments still counts once for its
      // implicit method. We skip this because a completed sale should
      // always have at least one payment.
    }

    const methodBreakdown = Array.from(methodMap.entries()).map(
      ([method, data]) => ({
        method,
        methodName: data.methodName,
        isCredit: data.isCredit,
        count: data.count.size,
        total: roundTwo(data.total),
      })
    )

    // ---------------------------------------------------------------
    // 2) Build creditSales detail
    // ---------------------------------------------------------------
    const creditSales: Array<{
      saleId: string
      saleDate: string
      saleNumber: string
      clientName: string
      total: number
      pendingBalance: number
      products: Array<{ name: string; quantity: number; lineTotal: number }>
    }> = []

    // Collect IDs of credit sales so we can batch-fetch receivables
    const creditSaleIds: string[] = []

    for (const sale of sales) {
      const hasCredit = sale.payments.some((p) => {
        const def = getMethodDef(p.method)
        return def?.isCredit ?? false
      })

      if (!hasCredit) continue

      creditSaleIds.push(sale.id)

      creditSales.push({
        saleId: sale.id,
        saleDate: sale.date.toISOString(),
        saleNumber: sale.number ?? '',
        clientName: sale.client?.name ?? 'Consumidor final',
        total: roundTwo(sale.total),
        pendingBalance: roundTwo(sale.total), // default; updated below
        products: sale.lines.map((l) => ({
          name: l.product?.name ?? 'Producto eliminado',
          quantity: l.quantity,
          lineTotal: roundTwo(l.lineTotal),
        })),
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
    // 3) Build full sales list
    // ---------------------------------------------------------------
    const salesList = sales.map((sale) => ({
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
      })),
    }))

    // ---------------------------------------------------------------
    // 4) Compute totals
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

    return NextResponse.json({
      methodBreakdown,
      creditSales,
      sales: salesList,
      totalSales: roundTwo(totalSales),
      totalCash: roundTwo(totalCash),
      totalCredit: roundTwo(totalCredit),
      totalOther: roundTwo(totalOther),
    })
  } catch (error) {
    console.error('[cash-register][id][sales] GET error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}