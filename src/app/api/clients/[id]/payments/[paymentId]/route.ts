import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
      include: { currency: { select: { code: true } } },
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
        // Get settings for currency conversion
        const settings = await tx.settings.findFirst()
        const exRate = settings?.exchangeRate || 0
        // Look up currency codes from IDs
        const [refCur, localCur] = await Promise.all([
          settings?.referenceCurrencyId ? tx.currency.findUnique({ where: { id: settings.referenceCurrencyId }, select: { code: true } }) : null,
          settings?.baseCurrencyId ? tx.currency.findUnique({ where: { id: settings.baseCurrencyId }, select: { code: true } }) : null,
        ])
        const refCode = refCur?.code || 'USD'
        const localCode = localCur?.code || 'VES'
        const payCode = payment.currency?.code || refCode

        const convert = (amt: number, fromCode: string, toCode: string): number => {
          if (fromCode === toCode || exRate <= 0) return amt
          if (fromCode === refCode && toCode === localCode) return amt * exRate
          if (fromCode === localCode && toCode === refCode) return amt / exRate
          return amt
        }

        // Restore the payment amount across the client's receivables (FIFO reverse)
        const receivables = await tx.accountReceivable.findMany({
          where: { clientId, status: { in: ['parcial', 'pagada'] } },
          include: { currency: { select: { code: true } } },
          orderBy: { id: 'desc' }, // Reverse order (last paid → first to reverse)
        })

        let remaining = payment.amount // in payment's currency
        for (const recv of receivables) {
          if (remaining <= 0) break

          const recvCode = recv.currency?.code || refCode

          // How much was paid on this receivable in receivable's currency
          const paidOnThis = Math.round((recv.amount - recv.pendingBalance) * 100) / 100
          if (paidOnThis <= 0) continue

          // Convert paidOnThis to payment's currency to compare
          const paidInPayCurrency = Math.round(convert(paidOnThis, recvCode, payCode) * 100) / 100
          const toRestoreInPayCurrency = Math.min(remaining, paidInPayCurrency)
          // Convert back to receivable's currency
          const toRestore = Math.round(convert(toRestoreInPayCurrency, payCode, recvCode) * 100) / 100

          const restoredBalance = Math.round((recv.pendingBalance + toRestore) * 100) / 100
          const newStatus = restoredBalance >= recv.amount ? 'pendiente' : 'parcial'

          await tx.accountReceivable.update({
            where: { id: recv.id },
            data: {
              pendingBalance: restoredBalance,
              status: newStatus,
            },
          })

          remaining = Math.round((remaining - toRestoreInPayCurrency) * 100) / 100
        }
      }

      // Remove the cash movement if it was created for this payment
      if (payment.cashRegId) {
        // Find the matching movement: same register, user, type, method, amount, and concept pattern
        const client = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } })
        const clientName = client?.name || ''

        const movement = await tx.cashMovement.findFirst({
          where: {
            cashRegId: payment.cashRegId,
            userId: payment.userId,
            type: 'entrada',
            amount: payment.amount,
            method: payment.method,
            concept: { contains: clientName ? `Cobro a ${clientName}` : 'Cobro a' },
          },
          orderBy: { createdAt: 'desc' },
        })

        if (movement) {
          const settings = await tx.settings.findFirst()
          // Reverse the register currentAmt: convert movement amount to base currency if needed
          let amtToSubtract = movement.amount
          const movCode = movement.currencyId ? (await tx.currency.findUnique({ where: { id: movement.currencyId }, select: { code: true } }))?.code : null
          const baseCur = await tx.currency.findFirst({ where: { isBase: true } })
          if (movCode && baseCur && movCode !== baseCur.code && settings?.exchangeRate) {
            amtToSubtract = Math.round(movement.amount * settings.exchangeRate * 100) / 100
          }

          const reg = await tx.cashRegister.findUnique({ where: { id: payment.cashRegId } })
          if (reg) {
            await tx.cashRegister.update({
              where: { id: payment.cashRegId },
              data: { currentAmt: Math.round((reg.currentAmt - amtToSubtract) * 100) / 100 },
            })
          }
          await tx.cashMovement.delete({ where: { id: movement.id } })
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