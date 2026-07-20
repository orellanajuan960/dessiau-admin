import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'
import { logStockChange } from '@/lib/stock-history'

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

/**
 * POST /api/sales/[id] — Anular venta (POS)
 * Sets status to 'anulada' and restores inventory.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sale = await db.sale.findUnique({
      where: { id },
      include: { lines: true, payments: true, receivables: true },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    if (sale.status === 'anulada') {
      return NextResponse.json({ error: 'La venta ya fue anulada' }, { status: 400 })
    }

    const updatedSale = await db.$transaction(async (tx) => {
      // Restore inventory
      for (const line of sale.lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId: sale.branchId } },
        })
        if (inventory) {
          const prevStock = inventory.stock
          const newStock = Math.round((prevStock + line.quantity) * 10000) / 10000
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { increment: line.quantity } },
          })
          try {
            await tx.stockHistory.create({
              data: {
                productId: line.productId,
                branchId: sale.branchId,
                previousStock: prevStock,
                newStock,
                change: Math.round(line.quantity * 10000) / 10000,
                source: 'void_sale',
                sourceId: id,
                details: 'Anulacion de venta',
                userId: userId || null,
              },
            })
          } catch (_e) { /* non-critical */ }
        }
      }

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

/**
 * DELETE /api/sales/[id] — Eliminar venta de credito (despacho)
 * Full reversal: restore inventory + delete receivables + delete sale.
 * Only allowed if no ClientPayments have been applied to the receivables.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { userId } = body

    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        lines: { include: { product: { select: { name: true } } } },
        payments: true,
        receivables: true,
        client: { select: { id: true, name: true } },
        branch: { select: { name: true } },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    if (sale.status === 'anulada') {
      return NextResponse.json({ error: 'La venta ya fue anulada' }, { status: 400 })
    }

    // Must be a credit sale (has receivables)
    if (sale.receivables.length === 0) {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar ventas a credito' },
        { status: 400 }
      )
    }

    const receivableIds = new Set(sale.receivables.map(r => r.id))

    // Check if any ClientPayment has applied amounts to these receivables
    const clientPayments = await db.clientPayment.findMany({
      where: { clientId: sale.clientId! },
    })

    const paymentsApplied = clientPayments.filter(cp => {
      try {
        const details: Array<{ receivableId: string }> = JSON.parse(cp.appliedDetails)
        return details.some(d => receivableIds.has(d.receivableId))
      } catch {
        return false
      }
    })

    if (paymentsApplied.length > 0) {
      return NextResponse.json(
        {
          error: 'No se puede eliminar: esta venta tiene cobros asociados. Elimine los cobros primero.',
          hasPayments: true,
        },
        { status: 400 }
      )
    }

    // Also check: if the sale has non-credit SalePayments (cash, transfer, etc.)
    // that updated the cash register, we need to reverse those too
    const hasNonCreditPayments = sale.payments.length > 0

    await db.$transaction(async (tx) => {
      // 1. Restore inventory
      for (const line of sale.lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId: sale.branchId } },
        })
        if (inventory) {
          const prevStock = inventory.stock
          const newStock = Math.round((prevStock + line.quantity) * 10000) / 10000
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { increment: line.quantity } },
          })
          try {
            await tx.stockHistory.create({
              data: {
                productId: line.productId,
                branchId: sale.branchId,
                previousStock: prevStock,
                newStock,
                change: Math.round(line.quantity * 10000) / 10000,
                source: 'credit_sale_deleted',
                sourceId: id,
                details: 'Eliminacion de venta de credito',
                userId: userId || null,
              },
            })
          } catch (_e) { /* non-critical */ }
        }
      }

      // 2. Reverse cash register if there were non-credit payments
      if (hasNonCreditPayments && sale.cashRegId) {
        const nonCreditTotal = sale.payments.reduce((sum, p) => sum + p.amount, 0)
        if (nonCreditTotal > 0) {
          const reg = await tx.cashRegister.findUnique({ where: { id: sale.cashRegId } })
          if (reg && reg.status === 'abierta') {
            // Create a reversal movement
            await tx.cashMovement.create({
              data: {
                cashRegId: sale.cashRegId,
                userId: userId || sale.userId,
                type: 'salida',
                amount: nonCreditTotal,
                concept: `Anulacion venta ${sale.id.slice(0, 8)} - ${sale.client?.name || 'Cliente'}`,
                method: 'reversion',
                currencyId: sale.currencyId,
              },
            })
            // Reduce the register's current amount
            await tx.cashRegister.update({
              where: { id: sale.cashRegId },
              data: { currentAmt: Math.max(0, Math.round((reg.currentAmt - nonCreditTotal) * 100) / 100) },
            })
          }
        }
      }

      // 3. Delete AccountReceivables
      for (const rec of sale.receivables) {
        await tx.accountReceivable.delete({ where: { id: rec.id } })
      }

      // 4. Delete the sale (cascades to SaleLines and SalePayments)
      await tx.sale.delete({ where: { id } })
    })

    // Audit log
    await logAction({
      action: 'delete',
      entity: 'sale',
      entityId: id,
      details: {
        summary: `Venta de credito eliminada - ${sale.client?.name || 'Cliente'} - ${sale.lines.map(l => l.product.name).join(', ')}`,
        total: sale.total,
        receivableCount: sale.receivables.length,
        lineCount: sale.lines.length,
      },
      request,
    })

    return NextResponse.json({ success: true, message: 'Venta de credito eliminada correctamente' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error al eliminar venta'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}