import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { logAction } from '@/lib/audit-log'
import { requireManageUsers } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role') || ''

    const where: Record<string, unknown> = {
      deletedAt: null,
    }
    if (role) where.role = role

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(users)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireManageUsers()
  if ('status' in auth) return auth

  try {
    const body = await request.json()
    const { name, email, password, role, branchId } = body

    if (!name || !email) {
      return NextResponse.json({ error: 'Nombre y email son requeridos' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 })
    }

    // Hash password before storing
    const hashedPassword = password ? await hashPassword(password) : await hashPassword('changeme')

    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || 'cajero',
        active: true,
        branchId: branchId || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    })
    await logAction({ action: 'create', entity: 'user', entityId: user.id, details: { name, email, role: role || 'cajero' }, request })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireManageUsers()
  if ('status' in auth) return auth

  try {
    const body = await request.json()
    const { id, name, email, role, active, password, branchId } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (role !== undefined) data.role = role
    if (active !== undefined) data.active = active
    if (branchId !== undefined) data.branchId = branchId || null
    if (password) data.password = await hashPassword(password)

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    })
    await logAction({ action: 'update', entity: 'user', entityId: id, details: { name, role }, request })

    return NextResponse.json(user)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManageUsers()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Soft delete
    await db.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    await logAction({ action: 'delete', entity: 'user', entityId: id, request })

    return NextResponse.json({ message: 'Usuario eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar usuario' }, { status: 500 })
  }
}
