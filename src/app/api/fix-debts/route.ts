import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * Fix script: compares each pending SaleLine's unitPrice with the
 * product's current price, and recalculates debts to match.
 */
export async function POST() {
  try {
    // 1. Get base currency
    const baseCurrency = await db.currency.findFirst({ where: { isBase: true }, select: { id: true, code: true } })
    const baseCurrencyId = baseCurrency?.id

    // 2. Find all SaleLines in sales with pending/parcial receivables
    const saleLines = await db.saleLine.findMany({
      where: {
        sale: {
          status: { not: 'anulada' },
          receivables: {
            some: { status: { in: ['pendiente', 'parcial'] } },
          },
        },
      },
      include: {
        product: {
          select: { id: true, name: true, price: true, currencyId: true, currency: { select: { code: true, isBase: true } } },
        },
        sale: {
          include: {
            receivables: {
              where: { status: { in: ['pendiente', 'parcial'] } },
            },
          },
        },
      },
    })

    if (saleLines.length === 0) {
      return NextResponse.json({ message: 'No hay deudas pendientes', fixed: false })
    }

    // 3. Build product price map
    const productPriceMap = new Map(saleLines.map(l => [l.productId, l.product.price]))

    // 4. Get currency info
    const currencyIds = [...new Set(saleLines.map(l => l.product.currencyId).filter(Boolean))]
    const currencies = currencyIds.length > 0
      ? await db.currency.findMany({ where: { id: { in: currencyIds } }, select: { id: true, code: true } })
      : []
    const currencyCodeMap = new Map(currencies.map(c => [c.id, c.code]))

    // 5. Group by saleId
    const bySale = new Map<string, typeof saleLines>()
    for (const line of saleLines) {
      const list = bySale.get(line.saleId) || []
      list.push(line)
      bySale.set(line.saleId, list)
    }

    let linesFixed = 0
    let recsFixed = 0
    let salesFixed = 0
    const details: string[] = []

    // 6. For each sale, compare line prices with product prices and fix
    for (const [saleId, lines] of bySale) {
      const receivables = lines[0].sale.receivables
      if (receivables.length === 0) continue

      // Snapshot current receivable amounts
      const recSnapshots = new Map(receivables.map(r => [r.id, { amount: r.amount, pendingBalance: r.pendingBalance }]))

      let saleChanged = false

      // Fix each SaleLine where unitPrice differs from product.price
      for (const line of lines) {
        const currentProductPrice = productPriceMap.get(line.productId)
        if (!currentProductPrice || currentProductPrice <= 0) continue
        if (line.unitPrice === currentProductPrice) continue

        const oldUnitPrice = line.unitPrice
        const oldLineTotal = line.lineTotal
        const newUnitPrice = currentProductPrice
        const newLineTotal = Math.round(newUnitPrice * line.quantity * 100) / 100
        const newLineProfit = Math.round(line.quantity * (newUnitPrice - line.unitCost) * 100) / 100

        await db.saleLine.update({
          where: { id: line.id },
          data: {
            unitPrice: newUnitPrice,
            lineTotal: newLineTotal,
            lineProfit: newLineProfit,
          },
        })
        linesFixed++
        saleChanged = true
        details.push(
          line.product.name + ': ' +
          oldUnitPrice.toFixed(2) + ' -> ' + newUnitPrice.toFixed(2) +
          ' (' + line.product.currency?.code + ')'
        )
      }

      if (!saleChanged) continue

      // Recalculate each receivable based on the difference
      for (const rec of receivables) {
        const snap = recSnapshots.get(rec.id)!
        const recCode = rec.currencyId ? currencyCodeMap.get(rec.currencyId) : ''

        // Calculate total change for lines matching this receivable's currency
        let totalChange = 0
        for (const line of lines) {
          const lineCode = currencyCodeMap.get(line.product.currencyId) || line.currencyCode
          if (recCode && lineCode && recCode !== lineCode) continue

          const currentProductPrice = productPriceMap.get(line.productId)
          if (!currentProductPrice) continue

          // The line was updated to product.price * quantity
          // The old value was line.unitPrice (before fix) * quantity... but we already updated it
          // So we calculate: what the lineTotal should be now vs what it was
          const correctLineTotal = Math.round(currentProductPrice * line.quantity * 100) / 100
          // We need the DIFFERENCE from the ORIGINAL line total before our update
        }

        // Better approach: calculate from the receivable's sale lines directly
        const currentLines = await db.saleLine.findMany({ where: { saleId } })
        let newSaleTotal = 0
        let recLineTotal = 0
        for (const cl of currentLines) {
          const clCode = currencyCodeMap.get(cl.product?.currencyId as any || '') || cl.currencyCode
          newSaleTotal += cl.lineTotal
          if (recCode && clCode && recCode === clCode) {
            recLineTotal += cl.lineTotal
          } else if (!recCode || !clCode) {
            recLineTotal += cl.lineTotal
          }
        }
        newSaleTotal = Math.round(newSaleTotal * 100) / 100
        recLineTotal = Math.round(recLineTotal * 100) / 100

        // The amount should be recLineTotal, and pendingBalance adjusted by the same difference
        const diff = recLineTotal - snap.amount
        const newAmount = recLineTotal
        const newPending = Math.round((snap.pendingBalance + diff) * 100) / 100

        if (newAmount !== snap.amount || newPending !== snap.pendingBalance) {
          await db.accountReceivable.update({
            where: { id: rec.id },
            data: {
              amount: newAmount,
              pendingBalance: newPending > 0 ? newPending : 0,
            },
          })
          recsFixed++
        }
      }

      // Recalculate sale total
      const allLines = await db.saleLine.findMany({ where: { saleId } })
      const newTotal = Math.round(allLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100
      await db.sale.update({
        where: { id: saleId },
        data: { total: newTotal },
      })
      salesFixed++
    }

    return NextResponse.json({
      message: linesFixed > 0 ? 'Corrección aplicada' : 'Los montos ya coinciden, nada que corregir',
      fixed: linesFixed > 0,
      saleLinesFixed: linesFixed,
      receivablesRecalculated: recsFixed,
      salesUpdated: salesFixed,
      details,
    })
  } catch (error) {
    console.error('[fix-debts] Error:', error)
    return NextResponse.json({ error: 'Error: ' + String(error) }, { status: 500 })
  }
}
