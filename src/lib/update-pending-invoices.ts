import { db } from '@/lib/db'

interface PendingInvoiceUpdate {
  productId: string
  oldPrice: number
  newPrice: number
}

/**
 * When a USD product price changes (individual edit), update pending
 * invoice SaleLines and AccountReceivables for credit sales.
 *
 * Strategy (per user requirement):
 * - The price increase ratio applies proportionally to each line.
 *   e.g. product $10 -> $12 (20% up), a line with $100 total becomes $120.
 * - The receivable's pendingBalance gets the same proportional increase.
 * - If the receivable is 'parcial', the increase applies to the remaining balance.
 *
 * Called OUTSIDE $transaction to avoid Turbopack minification bug.
 */
export async function updatePendingInvoices(updates: PendingInvoiceUpdate[]) {
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

    if (saleLines.length === 0) return

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

      // For each receivable, calculate increase from lines matching its currency
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
  } catch (_e) {
    console.error('[updatePendingInvoices] Error:', _e)
  }
}
