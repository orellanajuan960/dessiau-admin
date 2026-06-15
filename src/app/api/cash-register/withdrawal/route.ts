import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { formatCurrency } from '@/lib/currency'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashRegId, amount, userId, concept, currencyId } = body

    if (!cashRegId || !amount || !userId || !currencyId) {
      return NextResponse.json({ error: 'cashRegId, amount, userId y currencyId son requeridos' }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
    }

    const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
    if (!register || register.status === 'cerrada') {
      return NextResponse.json({ error: 'Caja no encontrada o cerrada' }, { status: 400 })
    }

    if (amount > register.currentAmt) {
      return NextResponse.json({ error: 'Monto insuficiente en la caja' }, { status: 400 })
    }

    const movement = await db.$transaction(async (tx) => {
      const newAmt = register.currentAmt - amount

      await tx.cashRegister.update({
        where: { id: cashRegId },
        data: { currentAmt: newAmt },
      })

      return tx.cashMovement.create({
        data: {
          cashRegId,
          type: 'retiro_excedente',
          amount,
          concept: concept || 'Retiro de excedente',
          currencyId,
          userId,
        },
        include: {
          user: { select: { id: true, name: true } },
          currency: true,
        },
      })
    })

    await logAction({
      action: 'cash_withdrawal',
      entity: 'cash_register',
      entityId: cashRegId,
      details: { summary: `Retiro de excedente: ${formatCurrency(amount)}`, amount, concept: concept || 'Retiro de excedente' },
      request,
    })

    return NextResponse.json(movement, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al registrar retiro de excedente' }, { status: 500 })
  }
}
