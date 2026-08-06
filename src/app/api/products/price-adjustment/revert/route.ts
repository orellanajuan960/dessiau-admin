import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { revertPendingInvoices } from '@/lib/update-pending-invoices'

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

    // Restore debts from snapshot if available
    if (adjustment.previousDebts) {
      await revertPendingInvoices(adjustment.previousDebts as any)
    }

    // Restore Product.price for each product
    for (const entry of previousPrices) {
      const restorePrice = Math.round(entry.previousPrice * 100) / 100
      await db.product.update({
        where: { id: entry.productId },
        data: { price: restorePrice },
      })
    }

    // Delete the adjustment record
    await db.priceAdjustment.delete({ where: { id: adjustmentId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al revertir ajuste' }, { status: 500 })
  }
}
