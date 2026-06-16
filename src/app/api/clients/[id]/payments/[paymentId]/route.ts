import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

interface AppliedDetail {
  receivableId: string
  amountApplied: number
  previousBalance: number
  newBalance: number
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id: clientId, paymentId } = await params

    // Fetch the payment record
    const payment = await db.clientPayment.findUnique({
      where: { id: paymentId },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
    }

    if (payment.clientId !== clientId) {
      return NextResponse.json({ error: 'Este pago no pertenece a este cliente' }, { status: 400 })
    }

    let appliedDetails: AppliedDetail[] = []
    let hasDetails = false
    try {
      appliedDetails = JSON.parse(payment.appliedDetails || '[]')
      if (appliedDetails.length > 0) hasDetails = true
    } catch {
      // Corrupt JSON — proceed without details, do best-effort reverse
    }

    await db.$transaction(async (tx) => {
      if (hasDetails) {
        // ── Exact reverse: we know which receivables were affected ──
        for (const detail of appliedDetails) {
          const receivable = await tx.accountReceivable.findUnique({
            where: { id: detail.receivableId },
          })

          if (!receivable) {
            console.warn(`[Delete ClientPayment] Receivable ${detail.receivableId} not found, skipping`)
            continue
          }

          const restoredBalance = Math.round((receivable.pendingBalance + detail.amountApplied) * 100) / 100
          const originalAmount = Math.round((detail.amountApplied + detail.newBalance) * 100) / 100
          const newStatus = restoredBalance >= originalAmount ? 'pendiente' : 'parcial'

          await tx.accountReceivable.update({
            where: { id: detail.receivableId },
            data: {
              pendingBalance: restoredBalance,
              status: newStatus,
            },
          })
        }
      } else {
        // ── Best-effort reverse: no details stored (migrated record) ──
        // Restore the payment amount across the client's receivables (FIFO reverse)
        const receivables = await tx.accountReceivable.findMany({
          where: { clientId, status: { in: ['parcial', 'pagada'] } },
          orderBy: { id: 'desc' }, // Reverse order (last paid → first to reverse)
        })

        let remaining = payment.amount
        for (const recv of receivables) {
          if (remaining <= 0) break

          // How much was paid on this receivable? (original - pending)
          const paidOnThis = Math.round((recv.amount - recv.pendingBalance) * 100) / 100
          if (paidOnThis <= 0) continue

          // The amount we can reverse is min(remaining, what was paid)
          const toRestore = Math.min(remaining, paidOnThis)
          const restoredBalance = Math.round((recv.pendingBalance + toRestore) * 100) / 100
          const newStatus = restoredBalance >= recv.amount ? 'pendiente' : 'parcial'

          await tx.accountReceivable.update({
            where: { id: recv.id },
            data: {
              pendingBalance: restoredBalance,
              status: newStatus,
            },
          })

          remaining = Math.round((remaining - toRestore) * 100) / 100
        }
      }

      // Remove the cash movement if it was created for this payment
      if (payment.cashRegId) {
        const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
        const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))

        if (cashCodes.has(payment.method)) {
          const movement = await tx.cashMovement.findFirst({
            where: {
              cashRegId: payment.cashRegId,
              userId: payment.userId,
              type: 'entrada',
              amount: payment.amount,
              concept: { contains: `ID: ${clientId}` },
            },
            orderBy: { createdAt: 'desc' },
          })

          if (movement) {
            const reg = await tx.cashRegister.findUnique({ where: { id: payment.cashRegId } })
            if (reg) {
              await tx.cashRegister.update({
                where: { id: payment.cashRegId },
                data: { currentAmt: Math.round((reg.currentAmt - payment.amount) * 100) / 100 },
              })
            }
            await tx.cashMovement.delete({ where: { id: movement.id } })
          }
        }
      }

      // Delete the payment record
      await tx.clientPayment.delete({ where: { id: paymentId } })
    })

    return NextResponse.json({ message: 'Cobro eliminado correctamente. Saldos restaurados.' })
  } catch (error) {
    console.error('[Delete ClientPayment] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar cobro' }, { status: 500 })
  }
}