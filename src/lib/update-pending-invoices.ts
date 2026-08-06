import { db } from '@/lib/db'

interface PendingInvoiceUpdate {
  productId: string
  oldPrice: number
  newPrice: number
}

interface DebtSnapshot {
  saleLines: Array<{ id: string; unitPrice: number; lineTotal: number; lineProfit: number }>
  receivables: Array<{ id: string; amount: number; pendingBalance: number }>
  sales: Array<{ id: string; total: number }>
}

/**
 * Update pending invoice SaleLines/Receivables for Bs products ONLY.
 * Returns a snapshot of all modified records so they can be reverted later.
 *
 * Called OUTSIDE $transaction to avoid Turbopack minification bug.
 */
export async function snapshotAndUpdatePendingInvoices(
  updates: PendingInvoiceUpdate[]
): Promise<DebtSnapshot | null> {
  try {
    const productIds = updates.map(u => u.productId)
    const priceMap = new Map(updates.map(u => [u.productId, { oldPrice: u.oldPrice, newPrice: u.newPrice }]))

    // Find all SaleLines for these products in non-voided sales with pending receivables
    const saleLines = await db.saleLine.findMany({
      where: {
        productId: { in: productIds },
        sale: {
          status: { not: 'anulada' },
          receivables: {
            some: { status: { in: ['pendiente', 'parcial'] } },
          },
        },
      },
      include: {
        product: { select: { currencyId: true } },
        sale: {
          include: {
            receivables: {
              where: { status: { in: ['pendiente', 'parcial'] } },
            },
          },
        },
      },
    })

    if (saleLines.length === 0) return null

    // Get currency info to identify base (local) currency
    const currencyIds = [...new Set(saleLines.map(l => l.product.currencyId).filter(Boolean))]
    const currencies = currencyIds.length > 0
      ? await db.currency.findMany({ where: { id: { in: currencyIds } }, select: { id: true, code: true, isBase: true } })
      : []
    const currencyCodeMap = new Map(currencies.map(c => [c.id, c.code]))
    const baseCurrencyId = currencies.find(c => c.isBase)?.id

    // Group by saleId — only include lines whose product is in base currency (Bs)
    const bySale = new Map<string, typeof saleLines>()
    for (const line of saleLines) {
      // Skip USD (non-base) product lines — only adjust Bs amounts
      if (baseCurrencyId && line.product.currencyId !== baseCurrencyId) continue
      const list = bySale.get(line.saleId) || []
      list.push(line)
      bySale.set(line.saleId, list)
    }

    if (bySale.size === 0) return null

    // Collect all IDs we will modify to build the snapshot
    const affectedLineIds = new Set<string>()
    const affectedRecIds = new Set<string>()
    const affectedSaleIds = new Set<string>()
    for (const [, lines] of bySale) {
      for (const line of lines) affectedLineIds.add(line.id)
      for (const rec of lines[0].sale.receivables) affectedRecIds.add(rec.id)
      affectedSaleIds.add(lines[0].saleId)
    }

    // Build snapshot BEFORE any modifications
    const snapshot: DebtSnapshot = {
      saleLines: [],
      receivables: [],
      sales: [],
    }

    const existingLines = await db.saleLine.findMany({
      where: { id: { in: [...affectedLineIds] } },
      select: { id: true, unitPrice: true, lineTotal: true, lineProfit: true },
    })
    snapshot.saleLines = existingLines.map(l => ({
      id: l.id, unitPrice: l.unitPrice, lineTotal: l.lineTotal, lineProfit: l.lineProfit,
    }))

    const existingRecs = await db.accountReceivable.findMany({
      where: { id: { in: [...affectedRecIds] } },
      select: { id: true, amount: true, pendingBalance: true },
    })
    snapshot.receivables = existingRecs.map(r => ({
      id: r.id, amount: r.amount, pendingBalance: r.pendingBalance,
    }))

    const existingSales = await db.sale.findMany({
      where: { id: { in: [...affectedSaleIds] } },
      select: { id: true, total: true },
    })
    snapshot.sales = existingSales.map(s => ({ id: s.id, total: s.total }))

    // Now apply the updates
    for (const [saleId, lines] of bySale) {
      const sale = lines[0].sale
      const receivables = sale.receivables
      if (receivables.length === 0) continue

      // Update each affected SaleLine
      for (const line of lines) {
        const priceInfo = priceMap.get(line.productId)
        if (!priceInfo || priceInfo.oldPrice <= 0 || line.unitPrice <= 0) continue

        const ratio = priceInfo.newPrice / priceInfo.oldPrice
        if (ratio === 1) continue

        const newUnitPrice = Math.round(priceInfo.newPrice * 100) / 100
        const newLineTotal = Math.round(line.lineTotal * ratio * 100) / 100
        const newLineProfit = Math.round(line.quantity * (newUnitPrice - line.unitCost) * 100) / 100

        await db.saleLine.update({
          where: { id: line.id },
          data: {
            unitPrice: newUnitPrice,
            lineTotal: newLineTotal,
            lineProfit: newLineProfit,
          },
        })
      }

      // For each receivable, calculate increase from Bs lines
      for (const rec of receivables) {
        if (rec.pendingBalance <= 0) continue

        let totalIncrease = 0
        for (const line of lines) {
          const priceInfo = priceMap.get(line.productId)
          if (!priceInfo || priceInfo.oldPrice <= 0 || line.unitPrice <= 0) continue

          // Match line currency to receivable currency
          const lineCurrencyCode = currencyCodeMap.get(line.product.currencyId) || line.currencyCode
          if (rec.currencyId && lineCurrencyCode) {
            const recCode = currencyCodeMap.get(rec.currencyId)
            if (recCode && lineCurrencyCode !== recCode) continue
          }

          const ratio = priceInfo.newPrice / priceInfo.oldPrice
          const increase = Math.round(line.lineTotal * (ratio - 1) * 100) / 100
          totalIncrease += increase
        }

        if (totalIncrease <= 0) continue

        const newPendingBalance = Math.round((rec.pendingBalance + totalIncrease) * 100) / 100
        await db.accountReceivable.update({
          where: { id: rec.id },
          data: {
            amount: Math.round((rec.amount + totalIncrease) * 100) / 100,
            pendingBalance: newPendingBalance,
          },
        })
      }

      // Recalculate sale total
      const allLines = await db.saleLine.findMany({ where: { saleId } })
      const newSaleTotal = Math.round(allLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100
      await db.sale.update({
        where: { id: saleId },
        data: { total: newSaleTotal },
      })
    }

    return snapshot
  } catch (_e) {
    console.error('[snapshotAndUpdatePendingInvoices] Error:', _e)
    return null
  }
}

/**
 * Restore debts from a previously saved snapshot.
 */
export async function revertPendingInvoices(snapshot: DebtSnapshot) {
  try {
    // Restore SaleLines
    for (const sl of snapshot.saleLines) {
      await db.saleLine.update({
        where: { id: sl.id },
        data: {
          unitPrice: sl.unitPrice,
          lineTotal: sl.lineTotal,
          lineProfit: sl.lineProfit,
        },
      })
    }

    // Restore AccountReceivables
    for (const rec of snapshot.receivables) {
      await db.accountReceivable.update({
        where: { id: rec.id },
        data: {
          amount: rec.amount,
          pendingBalance: rec.pendingBalance,
        },
      })
    }

    // Restore Sale totals
    for (const s of snapshot.sales) {
      await db.sale.update({
        where: { id: s.id },
        data: { total: s.total },
      })
    }
  } catch (_e) {
    console.error('[revertPendingInvoices] Error:', _e)
  }
}
