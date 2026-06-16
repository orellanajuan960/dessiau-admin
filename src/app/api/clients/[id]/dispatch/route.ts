import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params
    const body = await request.json()
    const { lines, userId, branchId: bodyBranchId } = body

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos un producto' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const client = await db.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const branchId = bodyBranchId || await resolveBranchId()

    const result = await db.$transaction(async (tx) => {
      let totalAmount = 0
      const saleLinesData: Array<{ productId: string; quantity: number; unitPrice: number; unitCost: number; lineTotal: number; lineProfit: number; currencyCode: string }> = []

      for (const line of lines) {
        const product = await tx.product.findUnique({
          where: { id: line.productId },
          include: { inventories: { where: { branchId } }, currency: { select: { code: true } } },
        })

        if (!product) {
          throw new Error(`Producto no encontrado: ${line.productId}`)
        }

        const inventory = product.inventories[0]
        const unitPrice = line.unitPrice || product.price
        const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100

        if (inventory && line.quantity > inventory.stock) {
          throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${inventory.stock}, Solicitado: ${line.quantity}`)
        }

        // Deduct stock
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { decrement: line.quantity } },
          })
        }

        totalAmount += lineTotal
        saleLinesData.push({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice,
          unitCost: product.costAvg,
          lineTotal,
          lineProfit: Math.round((unitPrice - product.costAvg) * line.quantity * 100) / 100,
          currencyCode: product.currency?.code || '',
        })
      }

      totalAmount = Math.round(totalAmount * 100) / 100

      // Create the sale
      const sale = await tx.sale.create({
        data: {
          clientId,
          userId,
          branchId,
          total: totalAmount,
          status: 'completada',
          lines: {
            create: saleLinesData,
          },
        },
        include: {
          lines: { include: { product: { select: { name: true } } } },
        },
      })

      // Create AccountReceivable (credit - 30 day due)
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30)

      await tx.accountReceivable.create({
        data: {
          clientId,
          saleId: sale.id,
          amount: totalAmount,
          pendingBalance: totalAmount,
          dueDate,
          status: 'pendiente',
        },
      })

      return sale
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error al registrar despacho'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
