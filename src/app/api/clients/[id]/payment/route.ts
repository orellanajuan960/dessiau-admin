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

    if (!displayAmount || displayAmount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    // Get pending receivables with their currency
    const settings = await db.settings.findFirst()
    const exRate = settings?.exchangeRate || 0
    // Look up currency codes from IDs
    const [refCur, localCur] = await Promise.all([
      settings?.referenceCurrencyId ? db.currency.findUnique({ where: { id: settings.referenceCurrencyId }, select: { code: true } }) : null,
      settings?.baseCurrencyId ? db.currency.findUnique({ where: { id: settings.baseCurrencyId }, select: { code: true } }) : null,
    ])
    const refCode = refCur?.code || 'USD'
    const localCode = localCur?.code || 'VES'

    const receivables = await db.accountReceivable.findMany({
      where: {
        clientId,
        status: { in: ['pendiente', 'parcial'] },
      },
      include: { currency: { select: { code: true, isBase: true } } },
      orderBy: { id: 'asc' },
    })

    if (receivables.length === 0) {
      return NextResponse.json({ error: 'No hay cuentas pendientes para este cliente' }, { status: 400 })
    }

    // Helper: convert between reference and local currency only
    // NEVER converts local→ref→local. Only ref↔local one-way.
    const convert = (amt: number, fromCode: string, toCode: string): number => {
      if (fromCode === toCode || exRate <= 0) return amt
      // ref → local: multiply by rate
      if (fromCode === refCode && toCode === localCode) return amt * exRate
      // local → ref: divide by rate
      if (fromCode === localCode && toCode === refCode) return amt / exRate
      // Same currency family, no conversion needed
      return amt
    }

    const results = await db.$transaction(async (tx) => {
      const updated: AppliedDetail[] = []

      // Fetch client name
      const client = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } })
      const clientName = client?.name || 'Cliente'

      // Track remaining in display currency
      let remaining = displayAmount // what user is paying, in display currency
      const payCode = displayCurrencyCode || refCode

      // Separate receivables by currency to handle same-currency ones first (no conversion)
      const sameCurrency: typeof receivables = []
      const diffCurrency: typeof receivables = []
      for (const r of receivables) {
        const rCode = r.currency?.code || refCode
        if (rCode === payCode) {
          sameCurrency.push(r)
        } else {
          diffCurrency.push(r)
        }
      }

      // Process same-currency receivables first (NO conversion needed — exact amounts)
      for (const receivable of sameCurrency) {
        if (remaining <= 0) break

        const applied = Math.min(remaining, receivable.pendingBalance)
        const newBalance = Math.round((receivable.pendingBalance - applied) * 100) / 100
        const newStatus = newBalance <= 0 ? 'pagada' : 'parcial'

        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            pendingBalance: Math.max(0, newBalance),
            status: newStatus,
          },
        })

        updated.push({
          receivableId: receivable.id,
          amountApplied: Math.round(applied * 100) / 100,
          previousBalance: Math.round(receivable.pendingBalance * 100) / 100,
          newBalance: Math.max(0, newBalance),
        })

        remaining = Math.round((remaining - applied) * 100) / 100
      }

      // Process different-currency receivables (one-way conversion only)
      for (const receivable of diffCurrency) {
        if (remaining <= 0) break

        const recvCode = receivable.currency?.code || refCode

        // Convert receivable balance to display currency (one-way: USD→Bs or Bs→USD)
        const recvInDisplay = Math.round(convert(receivable.pendingBalance, recvCode, payCode) * 100) / 100

        const appliedInDisplay = Math.min(remaining, recvInDisplay)

        // Convert applied back to receivable's currency (one-way)
        const appliedInRecv = Math.round(convert(appliedInDisplay, payCode, recvCode) * 100) / 100

        const previousBalance = receivable.pendingBalance
        const newBalance = Math.round((receivable.pendingBalance - appliedInRecv) * 100) / 100
        const newStatus = newBalance <= 0 ? 'pagada' : 'parcial'

        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            pendingBalance: Math.max(0, newBalance),
            status: newStatus,
          },
        })

        updated.push({
          receivableId: receivable.id,
          amountApplied: Math.round(appliedInRecv * 100) / 100,
          previousBalance: Math.round(previousBalance * 100) / 100,
          newBalance: Math.max(0, newBalance),
        })

        remaining = Math.round((remaining - appliedInDisplay) * 100) / 100
      }

      // Absorb residual on the last touched receivable
      // If the user paid enough to cover 99%+ of that receivable, zero it out
      // This handles rounding from currency conversion
      if (updated.length > 0) {
        const lastDetail = updated[updated.length - 1]
        if (lastDetail.newBalance > 0) {
          const lastReceivable = receivables.find(r => r.id === lastDetail.receivableId)
          if (lastReceivable) {
            const coverage = lastDetail.previousBalance > 0
              ? lastDetail.amountApplied / lastDetail.previousBalance
              : 0
            // If 99%+ was paid, absorb the rounding residual
            if (coverage >= 0.99) {
              const residual = lastDetail.newBalance
              await tx.accountReceivable.update({
                where: { id: lastReceivable.id },
                data: { pendingBalance: 0, status: 'pagada' },
              })
              lastDetail.newBalance = 0
              lastDetail.amountApplied = Math.round((lastDetail.amountApplied + residual) * 100) / 100
            }
          }
        }
      }

      // Create cash movement
      if (cashRegId) {
        const displayAmt = displayAmount
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

          // Update cash register current amount — convert to base currency if needed
          const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
          if (reg) {
            let amtForRegister = displayAmt
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

      // Create ClientPayment record
      let effectiveCurrencyId = currencyId || ''
      if (displayCurrencyCode) {
        const displayCurrency = await tx.currency.findFirst({ where: { code: displayCurrencyCode } })
        if (displayCurrency) effectiveCurrencyId = displayCurrency.id
      }

      await tx.clientPayment.create({
        data: {
          clientId,
          userId,
          amount: Math.round(displayAmount * 100) / 100,
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
      message: `Pago de ${formatCurrency(displayAmount, displayCurrencyCode)} registrado exitosamente`,
      applied: results,
    })
  } catch (error) {
    console.error('[Client Payment] Error:', error)
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 })
  }
}