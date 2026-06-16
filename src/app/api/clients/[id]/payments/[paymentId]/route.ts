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
    try {
      appliedDetails = JSON.parse(payment.appliedDetails || '[]')
    } catch {
      // If appliedDetails is corrupt but amount > 0, we can still try a best-effort reverse
      if (payment.amount > 0) {
        return NextResponse.json({
          error: 'Datos de pago corruptos. Este cobro fue registrado antes del sistema de trazabilidad. Contacta soporte para revertirlo manualmente.',
        }, { status: 400 })
      }
    }

    await db.$transaction(async (tx) => {
      // 1. Reverse each receivable balance
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

      // 2. Remove the cash movement if it was created for this payment
      if (payment.cashRegId) {
        const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
        const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))

        if (cashCodes.has(payment.method)) {
          // Find the cash movement for this payment
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
            // Reverse cash register amount
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

      // 3. Delete the payment record
      await tx.clientPayment.delete({ where: { id: paymentId } })
    })

    return NextResponse.json({ message: 'Cobro eliminado correctamente. Saldos restaurados.' })
  } catch (error) {
    console.error('[Delete ClientPayment] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar cobro' }, { status: 500 })
  }
}