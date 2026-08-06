import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { updatePendingInvoices } from '@/lib/update-pending-invoices'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { adjustmentId } = body as { adjustmentId: string }

    if (!adjustmentId) {
      return NextResponse.json({ error: 'adjustmentId es requerido' }, { status: 400 })
    }

    const adjustment = await db.priceAdjustment.findUnique({
      where: { id: adjustmentId },
    })

    if (!adjustment) {
      return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 })
    }

    const previousPrices = adjustment.previousPrices as Array<{
      productId: string
      previousPrice: number
    }>

    // Restore Product.price for each product
    const revertUpdates: Array<{ productId: string; oldPrice: number; newPrice: number }> = []
    for (const entry of previousPrices) {
      const restorePrice = Math.round(entry.previousPrice * 100) / 100
      const product = await db.product.findUnique({
        where: { id: entry.productId },
        select: { price: true, currency: { select: { isBase: true } } },
      })
      if (product) {
        revertUpdates.push({
          productId: entry.productId,
          oldPrice: product.price,
          newPrice: restorePrice,
        })
      }
      await db.product.update({
        where: { id: entry.productId },
        data: { price: restorePrice },
      })
    }

    // Also restore Inventory.price for the branch that was adjusted
    const branchId = adjustment.branchId
    if (branchId) {
      for (const entry of previousPrices) {
        const restorePrice = Math.round(entry.previousPrice * 100) / 100
        const existing = await db.inventory.findUnique({
          where: { productId_branchId: { productId: entry.productId, branchId } },
        })
        if (existing) {
          await db.inventory.update({
            where: { id: existing.id },
            data: { price: restorePrice },
          })
        }
      }
    }

    // Delete the adjustment record
    await db.priceAdjustment.delete({ where: { id: adjustmentId } })

    // Update pending invoices for reverted USD products (fire-and-forget)
    if (revertUpdates.length > 0) {
      updatePendingInvoices(revertUpdates).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al revertir ajuste' }, { status: 500 })
  }
}
