import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { updatePendingInvoices } from '@/lib/update-pending-invoices'

interface PriceItem {
  productId: string
  newPrice: number
  previousPrice: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { percentage, adjustments, userId } = body as {
      percentage: number
      adjustments: PriceItem[]
      userId?: string
    }

    if (!adjustments || adjustments.length === 0) {
      return NextResponse.json({ error: 'No hay ajustes para aplicar' }, { status: 400 })
    }

    const previousPrices = adjustments.map(item => ({
      productId: item.productId,
      previousPrice: item.previousPrice,
    }))

    // Create adjustment record for revert capability
    const adj = await db.priceAdjustment.create({
      data: {
        branchId: '', // global, not per-branch
        percentage,
        previousPrices,
        userId: userId || null,
      },
    })

    // Update Product.price for each product
    for (const item of adjustments) {
      const newPrice = Math.round(item.newPrice * 100) / 100
      await db.product.update({
        where: { id: item.productId },
        data: { price: newPrice },
      })
    }

    // Update pending invoices for USD products (fire-and-forget)
    const usdUpdates = adjustments.filter(a => {
      // We'll check currency inside updatePendingInvoices, but we can
      // pass all and let the function filter
      return a.previousPrice > 0 && a.newPrice > 0
    }).map(a => ({
      productId: a.productId,
      oldPrice: a.previousPrice,
      newPrice: a.newPrice,
    }))

    if (usdUpdates.length > 0) {
      updatePendingInvoices(usdUpdates).catch(() => {})
    }

    return NextResponse.json({ success: true, adjustmentId: adj.id })
  } catch (error) {
    return NextResponse.json({ error: 'Error al ajustar precios' }, { status: 500 })
  }
}
