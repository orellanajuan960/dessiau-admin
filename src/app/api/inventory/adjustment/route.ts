import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, type, quantity, reason, userId } = body
    const branchId = body.branchId || await resolveBranchId()

    const adjustment = await db.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { productId_branchId: { productId, branchId } },
      })
      if (!inv) {
        throw new Error('Inventario no encontrado')
      }

      const prevStock = inv.stock
      const newStock = Math.round((prevStock - quantity) * 10000) / 10000
      await tx.inventory.update({
        where: { id: inv.id },
        data: { stock: { decrement: quantity } },
      })

      const adj = await tx.inventoryAdjustment.create({
        data: { productId, branchId, type, quantity, reason, userId },
        include: { product: true },
      })

      return adj
    })

    return NextResponse.json(adjustment, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear ajuste de inventario' }, { status: 500 })
  }
}