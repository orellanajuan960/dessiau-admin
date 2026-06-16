import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * One-time migration: recover old client payments from CashMovement records.
 *
 * Before the ClientPayment table existed, cobros were only recorded as:
 *   - AccountReceivable.pendingBalance update
 *   - CashMovement (if cash method, with concept "Cobro a cliente (ID: xxx)")
 *
 * This endpoint finds those CashMovement records, matches them to clients,
 * and creates ClientPayment records so they appear in the "Pagos Realizados" list.
 *
 * It also looks at AccountReceivable records where amount != pendingBalance
 * (meaning a non-cash payment was made but no CashMovement exists).
 *
 * SAFE: skips any movement that already has a matching ClientPayment.
 */
export async function POST() {
  try {
    const results = {
      fromCashMovements: 0,
      fromReceivables: 0,
      skipped: 0,
      errors: [] as string[],
    }

    // Get the base currency for default currencyId
    const baseCurrency = await db.currency.findFirst({ where: { isBase: true } })

    // ── 1. Recover from CashMovement records ──
    const movements = await db.cashMovement.findMany({
      where: {
        type: 'entrada',
        concept: { contains: 'Cobro a cliente (ID:' },
      },
      orderBy: { createdAt: 'asc' },
    })

    for (const mov of movements) {
      // Extract clientId from concept: "Cobro a cliente (ID: clxxxx)"
      const match = mov.concept.match(/\(ID:\s*([a-zA-Z0-9]+)\)/)
      if (!match) {
        results.skipped++
        continue
      }

      const clientId = match[1]

      // Check if a ClientPayment already exists for this movement
      const existing = await db.clientPayment.findFirst({
        where: {
          clientId,
          userId: mov.userId,
          amount: mov.amount,
          cashRegId: mov.cashRegId,
        },
      })
      if (existing) {
        results.skipped++
        continue
      }

      // Find which receivables were active for this client around that time
      // We'll link to receivables that had status changed (parcial or pagada)
      // Since we don't have exact history, we'll store minimal info
      try {
        await db.clientPayment.create({
          data: {
            clientId,
            userId: mov.userId,
            amount: mov.amount,
            method: 'efectivo', // CashMovement = cash
            reference: null,
            cashRegId: mov.cashRegId,
            currencyId: mov.currencyId || baseCurrency?.id || '',
            appliedDetails: JSON.stringify([]), // No detailed breakdown available
            createdAt: mov.createdAt, // Preserve original date
          },
        })
        results.fromCashMovements++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.errors.push(`Movement ${mov.id}: ${msg}`)
      }
    }

    // ── 2. Recover from AccountReceivable records (non-cash payments) ──
    // Find receivables where some amount was paid but no CashMovement exists
    // These would be transfers, mobile payments, etc.
    const paidReceivables = await db.accountReceivable.findMany({
      where: {
        status: { in: ['parcial', 'pagada'] },
      },
      include: {
        client: true,
      },
    })

    // Get all client IDs that already have payments recovered
    const clientsWithRecoveredPayments = new Set(
      (await db.clientPayment.findMany({
        select: { clientId: true },
        distinct: ['clientId'],
      })).map(p => p.clientId)
    )

    // For each client with paid receivables but no recovered payments,
    // check if they had non-cash payments (no CashMovement)
    for (const recv of paidReceivables) {
      if (clientsWithRecoveredPayments.has(recv.clientId)) {
        continue // Already recovered from CashMovement
      }

      const paidAmount = Math.round((recv.amount - recv.pendingBalance) * 100) / 100
      if (paidAmount <= 0) continue

      // Check if there's a CashMovement for this client (if so, skip - already handled)
      const hasMovement = await db.cashMovement.findFirst({
        where: {
          type: 'entrada',
          concept: { contains: `ID: ${recv.clientId}` },
        },
      })
      if (hasMovement) continue

      // Check if we already created a payment for this receivable
      const existing = await db.clientPayment.findFirst({
        where: {
          clientId: recv.clientId,
          amount: paidAmount,
        },
      })
      if (existing) {
        results.skipped++
        continue
      }

      try {
        await db.clientPayment.create({
          data: {
            clientId: recv.clientId,
            userId: '', // Unknown for old records
            amount: paidAmount,
            method: 'transferencia', // Best guess for non-cash
            reference: null,
            cashRegId: null,
            currencyId: recv.currencyId || baseCurrency?.id || '',
            appliedDetails: JSON.stringify([]),
            createdAt: new Date(), // Can't determine exact date
          },
        })
        results.fromReceivables++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.errors.push(`Receivable ${recv.id}: ${msg}`)
      }
    }

    return NextResponse.json({
      message: 'Migracion completada',
      ...results,
      total: results.fromCashMovements + results.fromReceivables,
    })
  } catch (error) {
    console.error('[Migrate Payments] Error:', error)
    return NextResponse.json({ error: 'Error en migracion' }, { status: 500 })
  }
}