import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

export async function GET() {
  try {
    const categories = await db.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(categories)
  } catch (error) {
    console.error('[Categories GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageProducts) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { name, unitType } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre de la categoría es obligatorio' }, { status: 400 })
    }

    const trimmedName = name.trim()
    const validUnitType = unitType === 'weight' || unitType === 'volume' ? unitType : 'unit'

    // Check if category with same name already exists
    const existing = await db.category.findFirst({
      where: { name: trimmedName },
    })

    if (existing) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }

    const category = await db.category.create({
      data: { name: trimmedName, unitType: validUnitType },
      include: { _count: { select: { products: true } } },
    })

    await logAction({
      action: 'create',
      entity: 'category',
      entityId: category.id,
      details: { summary: `Categoría creada: ${trimmedName}`, name: trimmedName, unitType: validUnitType },
      request,
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('[Categories POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, unitType } = body

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: 'ID y nombre son obligatorios' }, { status: 400 })
    }

    const trimmedName = name.trim()
    const validUnitType = unitType === 'weight' || unitType === 'volume' ? unitType : 'unit'

    // Check if another category with same name exists
    const existing = await db.category.findFirst({
      where: { name: trimmedName, id: { not: id } },
    })

    if (existing) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }

    const category = await db.category.update({
      where: { id },
      data: { name: trimmedName, unitType: validUnitType },
      include: { _count: { select: { products: true } } },
    })

    await logAction({
      action: 'update',
      entity: 'category',
      entityId: id,
      details: { summary: `Categoría actualizada: ${trimmedName}`, name: trimmedName, unitType: validUnitType },
      request,
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error('[Categories PUT] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar categoría' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageProducts) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Check if category has products
    const category = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    })

    if (!category) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    }

    if (category._count.products > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${category._count.products} producto(s) asociado(s)` },
        { status: 409 }
      )
    }

    await db.category.delete({ where: { id } })

    await logAction({
      action: 'delete',
      entity: 'category',
      entityId: id,
      details: { summary: `Categoría eliminada: ${category.name}`, name: category.name },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Categories DELETE] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar categoría' }, { status: 500 })
  }
}
