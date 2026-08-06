import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * One-time fix script: reverses incorrect debt increases from old % adjustments.
 *
 * For each PriceAdjustment record (that has no previousDebts snapshot),
 * this reverses the proportional increase on ALL SaleLines and AccountReceivables
 * that were affected — bringing debts back to their original state.
 *
 * Then deletes those old PriceAdjustment records.
 */
export async function POST() {
  try {
    // 1. Find all PriceAdjustment records that lack a debt snapshot (old format)
    const adjustments = await db.priceAdjustment.findMany({
      where: { previousDebts: null },
      orderBy: { createdAt: 'asc' },
    })

    if (adjustments.length === 0) {
      return NextResponse.json({ message: 'No hay ajustes antiguos por corregir', fixed: false })
    }

    // 2. Get base currency ID
    const baseCurrency = await db.currency.findFirst({ where: { isBase: true }, select: { id: true } })
    const baseCurrencyId = baseCurrency?.id

    // 3. Build a map: productId -> cumulative reverse ratio
    //    If multiple adjustments affected the same product, ratios compound
    const productReverseRatios = new Map<string, number>()
    const allProductIds = new Set<string>()

    for (const adj of adjustments) {
      const prices = adj.previousPrices as Array<{ productId: string; previousPrice: number }>
      const ratio = 1 / (1 + adj.percentage / 100)

      for (const p of prices) {
        allProductIds.add(p.productId)
        const current = productReverseRatios.get(p.productId) || 1
        productReverseRatios.set(p.productId, current * ratio)
      }
    }

    if (allProductIds.size === 0) {
      return NextResponse.json({ message: 'Ajustes sin productos', fixed: false })
    }

    // 4. Find all SaleLines for these products in pending/parcial sales
    const saleLines = await db.saleLine.findMany({
      where: {
        productId: { in: [...allProductIds] },
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

    if (saleLines.length === 0) {
      return NextResponse.json({
        message: 'No se encontraron líneas de venta con deudas pendientes para estos productos',
        fixed: false,
      })
    }

    // 5. Get currency info
    const currencyIds = [...new Set(saleLines.map(l => l.product.currencyId).filter(Boolean))]
    const currencies = currencyIds.length > 0
      ? await db.currency.findMany({ where: { id: { in: currencyIds } }, select: { id: true, code: true, isBase: true } })
      : []
    const currencyCodeMap = new Map(currencies.map(c => [c.id, c.code]))

    // 6. Group by saleId
    const bySale = new Map<string, typeof saleLines>()
    for (const line of saleLines) {
      const list = bySale.get(line.saleId) || []
      list.push(line)
      bySale.set(line.saleId, list)
    }

    let linesFixed = 0
    let recsFixed = 0
    let salesFixed = 0

    // 7. Reverse each sale's lines and recalculate receivables
    for (const [saleId, lines] of bySale) {
      const receivables = lines[0].sale.receivables

      // Snapshot current receivable amounts before changes
      const recSnapshots = new Map(receivables.map(r => [r.id, { amount: r.amount, pendingBalance: r.pendingBalance }]))

      // Reverse each SaleLine
      for (const line of lines) {
        const reverseRatio = productReverseRatios.get(line.productId)
        if (!reverseRatio || reverseRatio === 1) continue

        const isUsdLine = baseCurrencyId ? line.product.currencyId !== baseCurrencyId : false
        // Reverse both Bs and USD lines for a clean reset

        const newUnitPrice = Math.round(line.unitPrice * reverseRatio * 100) / 100
        const newLineTotal = Math.round(line.lineTotal * reverseRatio * 100) / 100
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
      }

      // Recalculate each receivable's pendingBalance from its sale lines
      for (const rec of receivables) {
        const snap = recSnapshots.get(rec.id)!

        // Calculate total increase that was applied, now reversed
        let totalReversed = 0
        for (const line of lines) {
          const reverseRatio = productReverseRatios.get(line.productId)
          if (!reverseRatio || reverseRatio === 1) continue

          const lineCurrencyCode = currencyCodeMap.get(line.product.currencyId) || line.currencyCode
          if (rec.currencyId && lineCurrencyCode) {
            const recCode = currencyCodeMap.get(rec.currencyId)
            if (recCode && lineCurrencyCode !== recCode) continue
          }

          const decrease = Math.round(line.lineTotal * (1 - reverseRatio) * 100) / 100
          totalReversed += decrease
        }

        if (totalReversed === 0) continue

        const newAmount = Math.round((snap.amount - totalReversed) * 100) / 100
        const newPending = Math.round((snap.pendingBalance - totalReversed) * 100) / 100

        await db.accountReceivable.update({
          where: { id: rec.id },
          data: {
            amount: newAmount > 0 ? newAmount : 0,
            pendingBalance: newPending > 0 ? newPending : 0,
          },
        })
        recsFixed++
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

    // 8. Delete the old PriceAdjustment records (they've been fully reversed)
    const deletedCount = await db.priceAdjustment.deleteMany({
      where: { previousDebts: null },
    })

    return NextResponse.json({
      message: 'Corrección aplicada exitosamente',
      fixed: true,
      adjustmentsProcessed: adjustments.length,
      productsAffected: allProductIds.size,
      saleLinesReversed: linesFixed,
      receivablesReversed: recsFixed,
      salesUpdated: salesFixed,
      adjustmentRecordsDeleted: deletedCount.count,
    })
  } catch (error) {
    console.error('[fix-debts] Error:', error)
    return NextResponse.json({ error: 'Error al corregir deudas' }, { status: 500 })
  }
}
