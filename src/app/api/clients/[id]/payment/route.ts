import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { formatCurrency } from '@/lib/currency'
import { getBranchForCashier } from '@/lib/resolve-branch'

interface AppliedDetail {
  receivableId: string
  amountApplied: number
  previousBalance: number
  newBalance: number
}

interface PaymentEntry {
  method: string
  displayAmount: number
  displayCurrencyCode: string
  reference?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params
    const body = await request.json()
    const { userId, cashRegId, currencyId, entries } = body as {
      userId: string
      cashRegId?: string
      currencyId?: string
      entries?: PaymentEntry[]
      // Single payment fields (backward compatible)
      amount?: number
      displayAmount?: number
      displayCurrencyCode?: string
      method?: string
      reference?: string
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    // Build entries array: if hybrid (entries provided), use those; otherwise single entry
    const paymentEntries: PaymentEntry[] = entries?.length
      ? entries
      : body.method
        ? [{
            method: body.method,
            displayAmount: body.displayAmount,
            displayCurrencyCode: body.displayCurrencyCode || '',
            reference: body.reference,
          }]
        : []

    if (paymentEntries.length === 0) {
      return NextResponse.json({ error: 'No se proporcionó método de pago' }, { status: 400 })
    }

    // Validate all entries have positive amounts
    for (const entry of paymentEntries) {
      if (!entry.displayAmount || entry.displayAmount <= 0) {
        return NextResponse.json({ error: 'Todos los montos deben ser mayores a 0' }, { status: 400 })
      }
    }

    // For cashiers, validate cashRegId belongs to their assigned branch
    let effectiveCashRegId = cashRegId || null
    if (effectiveCashRegId && userId) {
      const cashierBranch = await getBranchForCashier(userId)
      if (cashierBranch) {
        const reg = await db.cashRegister.findUnique({ where: { id: effectiveCashRegId }, select: { id: true, branchId: true } })
        if (!reg || reg.branchId !== cashierBranch) {
          effectiveCashRegId = null
        }
      }
    }

    // Get pending receivables with their currency
    const settings = await db.settings.findFirst()
    const exRate = settings?.exchangeRate || 0
    const [refCur, localCur] = await Promise.all([
      settings?.referenceCurrencyId ? db.currency.findUnique({ where: { id: settings.referenceCurrencyId }, select: { code: true } }) : null,
      settings?.baseCurrencyId ? db.currency.findUnique({ where: { id: settings.baseCurrencyId }, select: { code: true } }) : null,
    ])
    const refCode = refCur?.code || 'USD'
    const localCode = localCur?.code || 'VES'

    // Fetch ALL pending receivables once (will be updated progressively)
    const receivables = await db.accountReceivable.findMany({
      where: { clientId, status: { in: ['pendiente', 'parcial'] } },
      include: { currency: { select: { code: true, isBase: true } } },
      orderBy: { id: 'asc' },
    })

    if (receivables.length === 0) {
      return NextResponse.json({ error: 'No hay cuentas pendientes para este cliente' }, { status: 400 })
    }

    // Helper: convert between reference and local currency only
    const convert = (amt: number, fromCode: string, toCode: string): number => {
      if (fromCode === toCode || exRate <= 0) return amt
      if (fromCode === refCode && toCode === localCode) return amt * exRate
      if (fromCode === localCode && toCode === refCode) return amt / exRate
      return amt
    }

    // Validate total in reference currency does not exceed pending balance
    const totalPendingRef = receivables.reduce((s, r) => {
      const rCode = r.currency?.code || refCode
      const balInRef = rCode === refCode ? r.pendingBalance : (exRate > 0 ? r.pendingBalance / exRate : r.pendingBalance)
      return s + balInRef
    }, 0)

    // Check total entries in reference currency
    let totalEntriesInRef = 0
    for (const entry of paymentEntries) {
      const payCode = entry.displayCurrencyCode || refCode
      const amt = entry.displayAmount
      if (payCode === refCode) {
        totalEntriesInRef += amt
      } else if (payCode === localCode && exRate > 0) {
        totalEntriesInRef += amt / exRate
      } else {
        totalEntriesInRef += amt
      }
    }
    if (totalEntriesInRef > totalPendingRef + 0.01) {
      return NextResponse.json({ error: 'El total a pagar supera la deuda pendiente' }, { status: 400 })
    }

    const results = await db.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } })
      const clientName = client?.name || 'Cliente'

      // Reload receivables inside transaction for consistency
      const liveReceivables = await tx.accountReceivable.findMany({
        where: { clientId, status: { in: ['pendiente', 'parcial'] } },
        include: { currency: { select: { code: true, isBase: true } } },
        orderBy: { id: 'asc' },
      })

      const allApplied: AppliedDetail[] = []
      const createdPayments: { method: string; amount: number; currencyCode: string }[] = []

      for (const entry of paymentEntries) {
        const { method, displayAmount, displayCurrencyCode, reference } = entry
        const payCode = displayCurrencyCode || refCode
        let remaining = displayAmount

        // Separate receivables by currency
        const sameCurrency = liveReceivables.filter(r => {
          const rCode = r.currency?.code || refCode
          return rCode === payCode && r.pendingBalance > 0
        })
        const diffCurrency = liveReceivables.filter(r => {
          const rCode = r.currency?.code || refCode
          return rCode !== payCode && r.pendingBalance > 0
        })

        const updated: AppliedDetail[] = []

        // Process same-currency receivables first
        for (const receivable of sameCurrency) {
          if (remaining <= 0.001) break
          const applied = Math.min(remaining, receivable.pendingBalance)
          const newBalance = Math.round((receivable.pendingBalance - applied) * 100) / 100
          const newStatus = newBalance <= 0 ? 'pagada' : 'parcial'
          await tx.accountReceivable.update({
            where: { id: receivable.id },
            data: { pendingBalance: Math.max(0, newBalance), status: newStatus },
          })
          updated.push({
            receivableId: receivable.id,
            amountApplied: Math.round(applied * 100) / 100,
            previousBalance: Math.round(receivable.pendingBalance * 100) / 100,
            newBalance: Math.max(0, newBalance),
          })
          remaining = Math.round((remaining - applied) * 100) / 100
        }

        // Process different-currency receivables
        for (const receivable of diffCurrency) {
          if (remaining <= 0.001) break
          const recvCode = receivable.currency?.code || refCode
          const recvInDisplay = Math.round(convert(receivable.pendingBalance, recvCode, payCode) * 100) / 100
          const appliedInDisplay = Math.min(remaining, recvInDisplay)
          const appliedInRecv = Math.round(convert(appliedInDisplay, payCode, recvCode) * 100) / 100
          const previousBalance = receivable.pendingBalance
          const newBalance = Math.round((receivable.pendingBalance - appliedInRecv) * 100) / 100
          const newStatus = newBalance <= 0 ? 'pagada' : 'parcial'
          await tx.accountReceivable.update({
            where: { id: receivable.id },
            data: { pendingBalance: Math.max(0, newBalance), status: newStatus },
          })
          updated.push({
            receivableId: receivable.id,
            amountApplied: Math.round(appliedInRecv * 100) / 100,
            previousBalance: Math.round(previousBalance * 100) / 100,
            newBalance: Math.max(0, newBalance),
          })
          remaining = Math.round((remaining - appliedInDisplay) * 100) / 100
        }

        // Absorb residual on last touched receivable
        if (updated.length > 0) {
          const lastDetail = updated[updated.length - 1]
          if (lastDetail.newBalance > 0) {
            const coverage = lastDetail.previousBalance > 0 ? lastDetail.amountApplied / lastDetail.previousBalance : 0
            if (coverage >= 0.99) {
              const lastRecv = liveReceivables.find(r => r.id === lastDetail.receivableId)
              if (lastRecv) {
                const residual = lastDetail.newBalance
                await tx.accountReceivable.update({
                  where: { id: lastRecv.id },
                  data: { pendingBalance: 0, status: 'pagada' },
                })
                lastDetail.newBalance = 0
                lastDetail.amountApplied = Math.round((lastDetail.amountApplied + residual) * 100) / 100
              }
            }
          }
        }

        // Create cash movement for this entry (only if method is cash)
        if (effectiveCashRegId) {
          let movCurrencyId = currencyId || ''
          if (displayCurrencyCode) {
            const displayCur = await tx.currency.findFirst({ where: { code: displayCurrencyCode } })
            if (displayCur) movCurrencyId = displayCur.id
          }
          if (movCurrencyId) {
            const amt = Math.round(displayAmount * 100) / 100
            await tx.cashMovement.create({
              data: {
                cashRegId: effectiveCashRegId,
                userId,
                type: 'entrada',
                amount: amt,
                concept: `Cobro a ${clientName}`,
                method,
                currencyId: movCurrencyId,
              },
            })
            // Update cash register current amount
            const reg = await tx.cashRegister.findUnique({ where: { id: effectiveCashRegId } })
            if (reg) {
              let amtForRegister = amt
              if (displayCurrencyCode) {
                const baseCur = await tx.currency.findFirst({ where: { isBase: true } })
                if (baseCur && baseCur.code !== displayCurrencyCode && settings?.exchangeRate) {
                  amtForRegister = Math.round(amt * settings.exchangeRate * 100) / 100
                }
              }
              await tx.cashRegister.update({
                where: { id: effectiveCashRegId },
                data: { currentAmt: Math.round((reg.currentAmt + amtForRegister) * 100) / 100 },
              })
            }
          }
        }

        // Create ClientPayment record for this entry
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
            cashRegId: effectiveCashRegId || null,
            currencyId: effectiveCurrencyId,
            appliedDetails: JSON.stringify(updated),
          },
        })

        allApplied.push(...updated)
        createdPayments.push({ method, amount: Math.round(displayAmount * 100) / 100, currencyCode: displayCurrencyCode })
      }

      return { applied: allApplied, payments: createdPayments }
    })

    const totalDisplay = paymentEntries.map(e => {
      const sym = e.displayCurrencyCode === localCode ? 'Bs.' : `${refCode} `
      return `${sym}${formatCurrency(e.displayAmount, e.displayCurrencyCode)}`
    }).join(' + ')

    return NextResponse.json({
      message: `Pago de ${totalDisplay} registrado exitosamente`,
      applied: results.applied,
      payments: results.payments,
    })
  } catch (error) {
    console.error('[Client Payment] Error:', error)
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 })
  }
}
