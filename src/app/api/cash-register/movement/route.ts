import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { formatCurrency } from '@/lib/currency'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashRegId, type, amount, concept, currencyId, userId } = body

    const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
    if (!register || register.status === 'cerrada') {
      return NextResponse.json({ error: 'Caja no encontrada o cerrada' }, { status: 400 })
    }

    const movement = await db.$transaction(async (tx) => {
      const newAmt = type === 'entrada'
        ? register.currentAmt + amount
        : register.currentAmt - amount

      await tx.cashRegister.update({
        where: { id: cashRegId },
        data: { currentAmt: newAmt },
      })

      return tx.cashMovement.create({
        data: { cashRegId, type, amount, concept, currencyId, userId },
        include: { user: { select: { id: true, name: true } }, currency: true },
      })
    })

    await logAction({
      action: type === 'entrada' ? 'cash_entry' : 'cash_exit',
      entity: 'cash_register',
      entityId: cashRegId,
      details: { summary: `Movimiento ${type}: ${formatCurrency(amount)} - ${concept || 'Sin concepto'}`, type, amount, concept },
      request,
    })

    return NextResponse.json(movement, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al registrar movimiento' }, { status: 500 })
  }
}
