import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * One-time fix: Create missing CashMovement records for ClientPayments
 * that were made before the fix (they didn't create movements for non-cash methods).
 *
 * Call once with POST, then delete this file.
 */
export async function POST() {
  try {
    // Find all ClientPayments that have a cashRegId
    const clientPayments = await db.clientPayment.findMany({
      where: { cashRegId: { not: null } },
      select: {
        id: true,
        clientId: true,
        userId: true,
        amount: true,
        method: true,
        reference: true,
        cashRegId: true,
        currencyId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (clientPayments.length === 0) {
      return NextResponse.json({ message: 'No hay pagos de clientes con caja registrada', fixed: 0 })
    }

    // Find all existing CashMovements related to client payments
    const allRegIds = [...new Set(clientPayments.map(p => p.cashRegId!))]
    const existingMovements = await db.cashMovement.findMany({
      where: {
        cashRegId: { in: allRegIds },
        concept: { contains: 'Cobro a cliente' },
      },
      select: { cashRegId: true, createdAt: true, amount: true },
    })

    // Build a set of "cashRegId|amount|createdAt" to check which payments already have movements
    const existingKeys = new Set(
      existingMovements.map(m => {
        const ts = Math.round(new Date(m.createdAt).getTime() / 1000)
        return `${m.cashRegId}|${m.amount}|${ts}`
      })
    )

    const toCreate: Array<{
      cashRegId: string
      userId: string
      amount: number
      method: string
      currencyId: string
      clientPaymentId: string
      clientId: string
    }> = []

    for (const cp of clientPayments) {
      const ts = Math.round(new Date(cp.createdAt).getTime() / 1000)
      const key = `${cp.cashRegId}|${cp.amount}|${ts}`
      const key1 = `${cp.cashRegId}|${cp.amount}|${ts - 1}`
      const key2 = `${cp.cashRegId}|${cp.amount}|${ts + 1}`

      if (existingKeys.has(key) || existingKeys.has(key1) || existingKeys.has(key2)) {
        continue
      }

      const effectiveCurrencyId = cp.currencyId || (await db.currency.findFirst({ where: { isBase: true } }))?.id || ''
      if (!effectiveCurrencyId) continue

      toCreate.push({
        cashRegId: cp.cashRegId!,
        userId: cp.userId,
        amount: cp.amount,
        method: cp.method,
        currencyId: effectiveCurrencyId,
        clientPaymentId: cp.id,
        clientId: cp.clientId,
      })
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ message: 'Todos los pagos ya tienen movimientos asociados', fixed: 0 })
    }

    // Batch fetch client names
    const clientIds = [...new Set(toCreate.map(t => t.clientId))]
    const clients = await db.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true },
    })
    const clientMap = new Map(clients.map(c => [c.id, c.name]))

    let fixed = 0
    const regUpdates = new Map<string, number>()

    for (const item of toCreate) {
      const cName = clientMap.get(item.clientId) || 'Cliente'
      await db.cashMovement.create({
        data: {
          cashRegId: item.cashRegId,
          userId: item.userId,
          type: 'entrada',
          amount: item.amount,
          concept: `Cobro a ${cName}`,
          method: item.method,
          currencyId: item.currencyId,
        },
      })
      regUpdates.set(item.cashRegId, (regUpdates.get(item.cashRegId) || 0) + item.amount)
      fixed++
    }

    for (const [cashRegId, totalToAdd] of regUpdates) {
      const reg = await db.cashRegister.findUnique({ where: { id: cashRegId } })
      if (reg) {
        await db.cashRegister.update({
          where: { id: cashRegId },
          data: { currentAmt: Math.round((reg.currentAmt + totalToAdd) * 100) / 100 },
        })
      }
    }

    return NextResponse.json({
      message: `Se crearon ${fixed} movimiento(s) faltante(s)`,
      fixed,
      details: toCreate.map(t => ({
        cashRegId: t.cashRegId,
        amount: t.amount,
        method: t.method,
      })),
    })
  } catch (error) {
    console.error('[fix-client-payments] Error:', error)
    return NextResponse.json({ error: 'Error al corregir pagos' }, { status: 500 })
  }
}