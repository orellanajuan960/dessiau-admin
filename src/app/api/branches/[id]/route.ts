import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAdmin } from '@/lib/require-auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  try {
    const { id } = await params
    const body = await request.json()
    const { name, address, phone, active } = body

    const branch = await db.branch.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    })

    const changes: string[] = []
    if (name !== undefined) changes.push(`nombre: ${name.trim()}`)
    if (active !== undefined) changes.push(`estado: ${active ? 'activa' : 'inactiva'}`)
    logAction({
      action: 'update',
      entity: 'branch',
      entityId: id,
      details: { summary: `Sucursal actualizada: ${changes.join(', ') || 'sin cambios'}` },
      request,
    })

    return NextResponse.json(branch)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar sucursal' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  try {
    const { id } = await params
    const branch = await db.branch.findUnique({ where: { id } })
    if (!branch) {
      return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })
    }
    if (branch.isMain) {
      return NextResponse.json({ error: 'No se puede eliminar la sucursal principal' }, { status: 400 })
    }
    await db.branch.delete({ where: { id } })

    logAction({
      action: 'delete',
      entity: 'branch',
      entityId: id,
      details: { summary: `Sucursal eliminada: ${branch.name}` },
      request: _request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar sucursal' }, { status: 500 })
  }
}
