import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
        cashReg: { select: { id: true, openingDate: true } },
        lines: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
        payments: { include: { currency: true } },
        receivables: true,
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    return NextResponse.json(sale)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener venta' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { clientId } = body

    const sale = await db.sale.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        clientId: true,
        status: true,
        lines: { select: { productId: true, quantity: true } },
        receivables: { select: { id: true } },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    if (sale.status === 'anulada') {
      return NextResponse.json({ error: 'La venta ya fue anulada' }, { status: 400 })
    }

    // Check if there are client payments linked to this sale's receivables
    // appliedDetails is a JSON string, so we check with raw query
    if (sale.receivables.length > 0) {
      const recvIds = sale.receivables.map(r => r.id)
      // Build OR conditions for each receivableId in the JSON string
      const conditions = recvIds.map((_, i) => `"appliedDetails"::text ILIKE '%\"receivableId\":\"%'`).join(' OR ')
      // Simpler: check if any payment references these receivable IDs
      const payments = await db.clientPayment.findMany({
        where: { clientId: sale.clientId },
        select: { id: true, appliedDetails: true },
      })
      const hasPayments = payments.some(p => {
        try {
          const details: Array<{ receivableId: string }> = JSON.parse(p.appliedDetails)
          return details.some(d => recvIds.includes(d.receivableId))
        } catch {
          return false
        }
      })
      if (hasPayments) {
        return NextResponse.json(
          { error: 'No se puede eliminar este crédito porque ya tiene cobros asociados. Elimine los cobros primero.' },
          { status: 400 }
        )
      }
    }

    const updatedSale = await db.$transaction(async (tx) => {
      // Restore inventory
      for (const line of sale.lines) {
        const qty = Math.round(line.quantity * 10000) / 10000
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId: sale.branchId } },
        })
        if (inventory) {
          const newStock = Math.round((inventory.stock + qty) * 10000) / 10000
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: newStock },
          })
        }
      }

      // Delete account receivables linked to this sale
      if (sale.receivables.length > 0) {
        await tx.accountReceivable.deleteMany({
          where: { saleId: id },
        })
      }

      // Mark sale as annulled
      return tx.sale.update({
        where: { id },
        data: { status: 'anulada' },
      })
    })

    return NextResponse.json(updatedSale)
  } catch (error) {
    return NextResponse.json({ error: 'Error al anular venta' }, { status: 500 })
  }
}