import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { snapshotAndUpdatePendingInvoices } from '@/lib/update-pending-invoices'

interface PriceItem {
  productId: string
  newPrice: number
  previousPrice: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { percentage, adjustments, branchIds, userId } = body as {
      percentage: number
      adjustments: PriceItem[]
      branchIds?: string[]
      userId?: string
    }

    if (!adjustments || adjustments.length === 0) {
      return NextResponse.json({ error: 'No hay ajustes para aplicar' }, { status: 400 })
    }

    const previousPrices = adjustments.map(item => ({
      productId: item.productId,
      previousPrice: item.previousPrice,
    }))

    // Use first branchId for the adjustment record, or empty if global
    const recordBranchId = branchIds?.[0] || ''

    // Snapshot + update pending invoices for Bs products BEFORE creating record
    const updates = adjustments
      .filter(a => a.previousPrice > 0 && a.newPrice > 0)
      .map(a => ({ productId: a.productId, oldPrice: a.previousPrice, newPrice: a.newPrice }))

    let debtSnapshot = null
    if (updates.length > 0) {
      debtSnapshot = await snapshotAndUpdatePendingInvoices(updates)
    }

    // Create adjustment record with debt snapshot
    const adj = await db.priceAdjustment.create({
      data: {
        branchId: recordBranchId,
        percentage,
        previousPrices,
        previousDebts: debtSnapshot || undefined,
        userId: userId || null,
      },
    })

    // Update Product.price (global sale price) for each product
    for (const item of adjustments) {
      const newPrice = Math.round(item.newPrice * 100) / 100
      await db.product.update({
        where: { id: item.productId },
        data: { price: newPrice },
      })
    }

    return NextResponse.json({ success: true, adjustmentId: adj.id })
  } catch (error) {
    return NextResponse.json({ error: 'Error al ajustar precios' }, { status: 500 })
  }
}
