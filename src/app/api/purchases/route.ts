import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId, branchFromBody } from '@/lib/resolve-branch'
import { notifyUser } from '@/lib/notify'
import { logStockChange } from '@/lib/stock-history'

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)

    const purchases = await db.purchase.findMany({
      where: { branchId },
      include: {
        supplier: { select: { id: true, name: true, rif: true } },
        currency: true,
        lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })
    return NextResponse.json(purchases)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener compras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { supplierId, lines, currencyId, paidUpfront } = body

    if (!supplierId || !lines || lines.length === 0 || !currencyId) {
      return NextResponse.json({ error: 'supplierId, currencyId y lines son requeridos' }, { status: 400 })
    }

    const branchId = branchFromBody(body) || await resolveBranchId()
    const isPaidUpfront = paidUpfront === true

    let total = 0
    const purchaseLinesData = lines.map((line: { productId: string; quantity: number; unitCost: number }) => {
      const subtotal = line.quantity * line.unitCost
      total += subtotal
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        subtotal: Math.round(subtotal * 100) / 100,
      }
    })

    total = Math.round(total * 100) / 100

    // Determine purchase status and paidAmount
    const purchaseStatus = isPaidUpfront ? 'pagada' : 'recibida'
    const paidAmt = isPaidUpfront ? total : 0

    const purchase = await db.$transaction(async (tx) => {
      const newPurchase = await tx.purchase.create({
        data: {
          supplierId,
          branchId,
          total,
          paidAmount: paidAmt,
          status: purchaseStatus,
          currencyId,
          paidUpfront: isPaidUpfront,
          lines: { create: purchaseLinesData },
        },
        include: {
          lines: { include: { product: { select: { id: true, name: true } } } },
          supplier: { select: { id: true, name: true } },
          currency: true,
        },
      })

      const purchaseId = newPurchase.id

      // Update inventory and recalculate average cost
      for (const line of lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId } },
        })
        const product = await tx.product.findUnique({ where: { id: line.productId } })

        if (product) {
          const oldStock = inventory?.stock || 0
          const newStock = oldStock + line.quantity
          const wasLowStock = inventory ? (oldStock <= inventory.minStock && inventory.minStock > 0) : false
          const newCostAvg = oldStock > 0
            ? (product.costAvg * oldStock + line.unitCost * line.quantity) / newStock
            : line.unitCost

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { stock: newStock },
            })
          } else {
            await tx.inventory.create({
              data: {
                productId: line.productId,
                branchId,
                stock: line.quantity,
                minStock: 0,
              },
            })
          }
          await tx.stockHistory.create({
            data: {
              productId: line.productId,
              branchId,
              previousStock: oldStock,
              newStock: Math.round(newStock * 10000) / 10000,
              change: Math.round(line.quantity * 10000) / 10000,
              source: 'purchase',
              sourceId: purchaseId,
              details: 'Compra recibida',
              userId: auth.userId,
            },
          })

          await tx.product.update({
            where: { id: line.productId },
            data: { costAvg: Math.round(newCostAvg * 1000) / 1000 },
          })

          // Notify admin if stock was replenished from low stock
          if (wasLowStock && newStock > (inventory?.minStock || 0)) {
            const adminUsers = await tx.user.findMany({
              where: { role: 'admin', active: true },
              select: { id: true },
            })
            for (const admin of adminUsers) {
              await notifyUser(admin.id, {
                title: 'Stock Reposicionado',
                message: `"${product.name}" fue reposicionado a ${newStock} unidades (min: ${inventory?.minStock || 0}).`,
                type: 'success',
              })
            }
          }
        }
      }

      // No longer auto-creating AccountPayable or updating supplier.balance
      // The Purchase itself tracks payment via paidAmount and status

      return newPurchase
    })

    return NextResponse.json(purchase, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear compra' }, { status: 500 })
  }
}
