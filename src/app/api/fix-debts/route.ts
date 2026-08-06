import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * Fix script v2: For each pending/parcial receivable,
 * recalculate amount from SaleLines matching its currency,
 * and adjust pendingBalance proportionally.
 */
export async function POST() {
  try {
    // 1. Get currency info
    const currencies = await db.currency.findMany({ select: { id: true, code: true, isBase: true } })
    const currencyMap = new Map(currencies.map(c => [c.id, c.code]))

    // 2. Find ALL AccountReceivables with pending/parcial status
    const receivables = await db.accountReceivable.findMany({
      where: { status: { in: ['pendiente', 'parcial'] } },
    })

    if (receivables.length === 0) {
      return NextResponse.json({ message: 'No hay deudas pendientes', fixed: false })
    }

    let recsFixed = 0
    let salesFixed = 0
    const details: string[] = []

    // 3. Process each receivable
    for (const rec of receivables) {
      const recCode = rec.currencyId ? currencyMap.get(rec.currencyId) : ''

      // Get ALL sale lines for this sale (not just the ones matching currency)
      const allLines = await db.saleLine.findMany({
        where: { saleId: rec.saleId },
        include: { product: { select: { currencyId: true } } },
      })

      // Filter lines matching this receivable's currency
      const matchingLines = allLines.filter(l => {
        const lineCode = l.product?.currencyId ? currencyMap.get(l.product.currencyId) : l.currencyCode
        if (recCode && lineCode) return recCode === lineCode
        return !recCode && !lineCode // both unknown = match
      })

      // Calculate the correct amount from matching lines
      const correctAmount = Math.round(matchingLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100

      if (correctAmount === rec.amount) continue

      // Adjust pendingBalance proportionally
      let newPendingBalance = rec.pendingBalance
      if (rec.amount > 0) {
        const ratio = correctAmount / rec.amount
        newPendingBalance = Math.round(rec.pendingBalance * ratio * 100) / 100
      }

      const client = await db.client.findUnique({ where: { id: rec.clientId }, select: { name: true } })

      await db.accountReceivable.update({
        where: { id: rec.id },
        data: {
          amount: correctAmount,
          pendingBalance: newPendingBalance > 0 ? newPendingBalance : 0,
        },
      })

      recsFixed++
      details.push(
        (client?.name || '?') + ': ' + recCode + ' ' +
        rec.amount.toFixed(2) + ' -> ' + correctAmount.toFixed(2) +
        ' (pendiente: ' + rec.pendingBalance.toFixed(2) + ' -> ' + newPendingBalance.toFixed(2) + ')'
      )
    }

    // 4. Recalculate sale totals
    const affectedSaleIds = new Set(receivables.map(r => r.saleId))
    for (const saleId of affectedSaleIds) {
      const lines = await db.saleLine.findMany({ where: { saleId } })
      const newTotal = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100
      const sale = await db.sale.findUnique({ where: { id: saleId }, select: { total: true } })
      if (sale && sale.total !== newTotal) {
        await db.sale.update({ where: { id: saleId }, data: { total: newTotal } })
        salesFixed++
      }
    }

    return NextResponse.json({
      message: recsFixed > 0 ? 'Corrección aplicada' : 'Los montos ya son correctos',
      fixed: recsFixed > 0,
      receivablesFixed: recsFixed,
      salesUpdated: salesFixed,
      details,
    })
  } catch (error) {
    console.error('[fix-debts] Error:', error)
    return NextResponse.json({ error: 'Error: ' + String(error) }, { status: 500 })
  }
}
