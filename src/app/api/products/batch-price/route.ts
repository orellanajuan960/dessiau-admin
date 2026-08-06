import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

interface PriceItem {
  branchId: string
  productId: string
  newPrice: number
  previousPrice: number
  hadInventory: boolean
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

    // Group by branch
    const byBranch = new Map<string, PriceItem[]>()
    for (const item of adjustments) {
      const list = byBranch.get(item.branchId) || []
      list.push(item)
      byBranch.set(item.branchId, list)
    }

    const adjustmentIds: string[] = []

    for (const [branchId, items] of byBranch) {
      const previousPrices = items.map(item => ({
        productId: item.productId,
        previousPrice: item.previousPrice,
        hadInventory: item.hadInventory,
      }))

      await db.$transaction(async (tx) => {
        // Create adjustment record
        const adj = await tx.priceAdjustment.create({
          data: {
            branchId,
            percentage,
            previousPrices,
            userId: userId || null,
          },
        })
        adjustmentIds.push(adj.id)

        // Update each product inventory price
        for (const item of items) {
          const newPrice = Math.round(item.newPrice * 100) / 100

          if (item.hadInventory) {
            // Update existing inventory
            await tx.inventory.updateMany({
              where: { productId: item.productId, branchId },
              data: { price: newPrice },
            })
          } else {
            // Create inventory with the new price (stock 0, minStock 0)
            const existing = await tx.inventory.findUnique({
              where: { productId_branchId: { productId: item.productId, branchId } },
            })
            if (existing) {
              await tx.inventory.update({
                where: { id: existing.id },
                data: { price: newPrice },
              })
            } else {
              await tx.inventory.create({
                data: {
                  productId: item.productId,
                  branchId,
                  stock: 0,
                  minStock: 0,
                  price: newPrice,
                },
              })
            }
          }
        }
      })
    }

    return NextResponse.json({ success: true, adjustmentIds })
  } catch (error) {
    return NextResponse.json({ error: 'Error al ajustar precios' }, { status: 500 })
  }
}
