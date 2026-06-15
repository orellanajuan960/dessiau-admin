import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAdmin } from '@/lib/require-auth'

// GET /api/role-permissions - Get current role permissions
export async function GET() {
  try {
    const settings = await db.settings.findFirst()
    if (!settings) {
      return NextResponse.json({ permissions: {} })
    }

    // If no custom permissions saved, return empty (frontend will use defaults)
    const permissions = settings.rolePermissions || {}
    return NextResponse.json({ permissions })
  } catch (error) {
    console.error('[Role Permissions GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener permisos' }, { status: 500 })
  }
}

// PUT /api/role-permissions - Save custom role permissions
export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  try {
    const body = await request.json()
    const { permissions } = body

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'Permisos inválidos' }, { status: 400 })
    }

    const settings = await db.settings.findFirst()
    if (!settings) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
    }

    await db.settings.update({
      where: { id: settings.id },
      data: { rolePermissions: permissions },
    })

    const rolesModified = Object.keys(permissions)
    logAction({
      action: 'update',
      entity: 'settings',
      entityId: settings.id,
      details: { summary: `Permisos de roles actualizados: ${rolesModified.join(', ')}`, rolesModified },
      request: request as any,
    })

    return NextResponse.json({ success: true, permissions })
  } catch (error) {
    console.error('[Role Permissions PUT] Error:', error)
    return NextResponse.json({ error: 'Error al guardar permisos' }, { status: 500 })
  }
}
