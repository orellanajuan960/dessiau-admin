import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'

const MAX_INITIAL_AMOUNT = 500000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, initialAmt, branchId, name } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    // Fix 1: Validate max initial amount
    if (initialAmt !== undefined && initialAmt !== null && initialAmt > MAX_INITIAL_AMOUNT) {
      return NextResponse.json({ error: `El monto inicial no puede superar $${MAX_INITIAL_AMOUNT.toLocaleString('es-VE')}` }, { status: 400 })
    }

    const effectiveBranchId = body.branchId || await resolveBranchId()

    // Fix 6: Check if this user already has an open register
    const existingOpen = await db.cashRegister.findFirst({
      where: { userId, status: 'abierta' },
    })
    if (existingOpen) {
      return NextResponse.json(
        { error: `Este cajero ya tiene una caja abierta: "${existingOpen.name || 'Sin nombre'}" (abierta el ${new Date(existingOpen.openingDate).toLocaleDateString('es-VE')})` },
        { status: 400 }
      )
    }

    const register = await db.cashRegister.create({
      data: {
        name: name?.trim() || null,
        userId,
        branchId: effectiveBranchId,
        initialAmt: initialAmt || 0,
        currentAmt: initialAmt || 0,
        status: 'abierta',
      },
      include: { user: { select: { id: true, name: true } } },
    })

    await logAction({
      action: 'open_cash',
      entity: 'cash_register',
      entityId: register.id,
      details: { summary: `Caja abierta: $${(initialAmt || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, initialAmount: initialAmt || 0, name: name?.trim() || 'Sin nombre' },
      request,
    })

    return NextResponse.json(register, { status: 201 })
  } catch (error) {
    console.error('Error al abrir caja:', error)
    return NextResponse.json({ error: 'Error al abrir caja' }, { status: 500 })
  }
}
