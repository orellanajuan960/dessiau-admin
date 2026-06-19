import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const branchId = await resolveBranchId(request)

    const where: Record<string, unknown> = { branchId, deletedAt: null }
    if (category) where.category = category
    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    const expenses = await db.expense.findMany({
      where,
      include: {
        currency: true,
        user: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })
    return NextResponse.json(expenses)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener gastos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageExpenses) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()

    // Server-side validation
    if (!body.currencyId || typeof body.currencyId !== 'string' || body.currencyId.trim() === '') {
      return NextResponse.json({ error: 'currencyId es requerido' }, { status: 400 })
    }
    if (!body.userId || typeof body.userId !== 'string' || body.userId.trim() === '') {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }
    if (!body.category || typeof body.category !== 'string' || body.category.trim() === '') {
      return NextResponse.json({ error: 'La categoría es requerida' }, { status: 400 })
    }
    if (!body.description || typeof body.description !== 'string' || body.description.trim() === '') {
      return NextResponse.json({ error: 'La descripción es requerida' }, { status: 400 })
    }
    if (typeof body.amount !== 'number' || isNaN(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser un número mayor a cero' }, { status: 400 })
    }

    const branchId = body.branchId || await resolveBranchId()
    const expense = await db.expense.create({
      data: {
        branchId,
        category: body.category.trim(),
        description: body.description.trim(),
        amount: body.amount,
        currencyId: body.currencyId.trim(),
        userId: body.userId.trim(),
      },
      include: { currency: true, user: { select: { name: true } } },
    })
    await logAction({ action: 'create', entity: 'expense', entityId: expense.id, details: { description: body.description, amount: body.amount }, request })
    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear gasto' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageExpenses) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Soft delete
    await db.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    await logAction({ action: 'delete', entity: 'expense', entityId: id, request })

    return NextResponse.json({ message: 'Gasto eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar gasto' }, { status: 500 })
  }
}
