import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { formatCurrency } from '@/lib/currency'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params
    const body = await request.json()
    const { amount, method, reference, cashRegId, userId, currencyId } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    // Get pending receivables for this client
    const settings = await db.settings.findFirst()
    const currencyCode = settings?.referenceCurrency || null

    const receivables = await db.accountReceivable.findMany({
      where: {
        clientId,
        status: { in: ['pendiente', 'parcial'] },
      },
      orderBy: { id: 'asc' },
    })

    if (receivables.length === 0) {
      return NextResponse.json({ error: 'No hay cuentas pendientes para este cliente' }, { status: 400 })
    }

    const totalPending = receivables.reduce((sum, r) => sum + r.pendingBalance, 0)
    if (amount > totalPending) {
      return NextResponse.json({ error: `El monto excede el total pendiente (${formatCurrency(totalPending, currencyCode)})` }, { status: 400 })
    }

    // Distribute payment across receivables (FIFO)
    let remaining = amount
    const results = await db.$transaction(async (tx) => {
      const updated: Array<{ receivableId: string; amountApplied: number; newBalance: number }> = []

      for (const receivable of receivables) {
        if (remaining <= 0) break

        const applied = Math.min(remaining, receivable.pendingBalance)
        const newBalance = Math.round((receivable.pendingBalance - applied) * 100) / 100
        const newStatus = newBalance <= 0 ? 'pagada' : 'parcial'

        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            pendingBalance: newBalance,
            status: newStatus,
          },
        })

        updated.push({
          receivableId: receivable.id,
          amountApplied: Math.round(applied * 100) / 100,
          newBalance,
        })

        remaining = Math.round((remaining - applied) * 100) / 100
      }

      // Create cash movement if cash register is open and method is cash
      const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
      const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))
      if (cashRegId && cashCodes.has(method)) {
        const effectiveCurrencyId = currencyId || (await tx.currency.findFirst({ where: { isBase: true } }))?.id
        if (effectiveCurrencyId) {
          await tx.cashMovement.create({
            data: {
              cashRegId,
              userId,
              type: 'entrada',
              amount,
              concept: `Cobro a cliente (ID: ${clientId})`,
              currencyId: effectiveCurrencyId,
            },
          })

          // Update cash register current amount
          const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
          if (reg) {
            await tx.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((reg.currentAmt + amount) * 100) / 100 },
            })
          }
        }
      }

      return updated
    })

    return NextResponse.json({
      message: `Pago de ${formatCurrency(amount, currencyCode)} registrado exitosamente`,
      applied: results,
    })
  } catch (error) {
    console.error('[Client Payment] Error:', error)
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 })
  }
}
