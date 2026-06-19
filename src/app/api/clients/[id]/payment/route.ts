import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { formatCurrency } from '@/lib/currency'

interface AppliedDetail {
  receivableId: string
  amountApplied: number
  previousBalance: number
  newBalance: number
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params
    const body = await request.json()
    const { amount, displayAmount, displayCurrencyCode, method, reference, cashRegId, userId, currencyId } = body

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
    // Allow small tolerance for exchange-rate rounding differences (e.g. rate changed since receivable was created)
    const TOLERANCE = 0.10
    if (amount > totalPending + TOLERANCE) {
      return NextResponse.json({ error: `El monto excede el total pendiente (${formatCurrency(totalPending, currencyCode)})` }, { status: 400 })
    }

    // Distribute payment across receivables (FIFO)
    let remaining = amount
    const results = await db.$transaction(async (tx) => {
      const updated: AppliedDetail[] = []
      let cashMovementId: string | null = null

      // Fetch client name for the movement concept
      const client = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } })
      const clientName = client?.name || 'Cliente'

      for (const receivable of receivables) {
        if (remaining <= 0) break

        const applied = Math.min(remaining, receivable.pendingBalance)
        const previousBalance = receivable.pendingBalance
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
          previousBalance: Math.round(previousBalance * 100) / 100,
          newBalance,
        })

        remaining = Math.round((remaining - applied) * 100) / 100
      }

      // Absorb small residual from exchange-rate rounding differences.
      // When the user pays the full balance computed from balanceByCurrency (using the current rate),
      // but receivables were stored with a different rate, a tiny remainder may be left.
      // Standard accounting practice: absorb it into the last touched receivable.
      if (remaining > 0 && remaining <= 0.10 && updated.length > 0 && amount >= totalPending * 0.995) {
        const lastIdx = updated.length - 1
        const lastDetail = updated[lastIdx]
        const lastReceivable = receivables.find(r => r.id === lastDetail.receivableId)
        if (lastReceivable) {
          const absorbedNewBalance = 0
          await tx.accountReceivable.update({
            where: { id: lastReceivable.id },
            data: { pendingBalance: absorbedNewBalance, status: 'pagada' },
          })
          lastDetail.newBalance = absorbedNewBalance
          lastDetail.amountApplied = Math.round((lastDetail.amountApplied + remaining) * 100) / 100
          remaining = 0
        }
      }

      // Create cash movement for ALL payment methods (to show in breakdown + update box total)
      if (cashRegId) {
        // Use displayAmount (what user actually paid) and displayCurrencyCode for correct currency
        const displayAmt = displayAmount || amount
        let movCurrencyId = currencyId
        if (displayCurrencyCode) {
          const displayCur = await tx.currency.findFirst({ where: { code: displayCurrencyCode } })
          if (displayCur) movCurrencyId = displayCur.id
        }
        if (movCurrencyId) {
          const movement = await tx.cashMovement.create({
            data: {
              cashRegId,
              userId,
              type: 'entrada',
              amount: Math.round(displayAmt * 100) / 100,
              concept: `Cobro a ${clientName}`,
              method,
              currencyId: movCurrencyId,
            },
          })
          cashMovementId = movement.id

          // Update cash register current amount — convert to base currency if needed
          const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
          if (reg) {
            let amtForRegister = displayAmt
            // If the movement currency is not the base currency, convert using exchange rate
            if (displayCurrencyCode) {
              const baseCur = await tx.currency.findFirst({ where: { isBase: true } })
              if (baseCur && baseCur.code !== displayCurrencyCode && settings?.exchangeRate) {
                amtForRegister = Math.round(displayAmt * settings.exchangeRate * 100) / 100
              }
            }
            await tx.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((reg.currentAmt + amtForRegister) * 100) / 100 },
            })
          }
        }
      }

      // Create ClientPayment record for traceability (reversible)
      // Resolve the display currency ID for correct symbol display
      let effectiveCurrencyId = currencyId || ''
      if (displayCurrencyCode) {
        const displayCurrency = await tx.currency.findFirst({ where: { code: displayCurrencyCode } })
        if (displayCurrency) effectiveCurrencyId = displayCurrency.id
      }

      await tx.clientPayment.create({
        data: {
          clientId,
          userId,
          amount: Math.round((displayAmount || amount) * 100) / 100,
          method,
          reference: reference || null,
          cashRegId: cashRegId || null,
          currencyId: effectiveCurrencyId,
          appliedDetails: JSON.stringify(updated),
        },
      })

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