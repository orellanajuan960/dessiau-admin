import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
      hadInventory: boolean
    }>

    const branchId = adjustment.branchId

    await db.$transaction(async (tx) => {
      for (const entry of previousPrices) {
        const restorePrice = Math.round(entry.previousPrice * 100) / 100

        if (entry.hadInventory) {
          await tx.inventory.updateMany({
            where: { productId: entry.productId, branchId },
            data: { price: restorePrice },
          })
        } else {
          // Was created by the adjustment — set price back to 0
          await tx.inventory.updateMany({
            where: { productId: entry.productId, branchId },
            data: { price: 0 },
          })
        }
      }

      // Delete the adjustment record
      await tx.priceAdjustment.delete({ where: { id: adjustmentId } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al revertir ajuste' }, { status: 500 })
  }
}
