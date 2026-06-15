import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

const RIF_REGEX = /^[JVEG]-\d{8,9}-\d$/

export async function GET() {
  try {
    const suppliers = await db.supplier.findMany({
      where: { deletedAt: null },
      include: {
        payables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: { dueDate: true, pendingBalance: true },
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute derived fields
    const enriched = suppliers.map(s => {
      const nextDue = s.payables.find(p => p.dueDate)?.dueDate || null
      const totalDebt = s.payables.reduce((sum, p) => sum + p.pendingBalance, 0)
      return {
        id: s.id,
        name: s.name,
        rif: s.rif,
        phone: s.phone,
        email: s.email,
        address: s.address,
        balance: Math.round(totalDebt * 100) / 100,
        nextDueDate: nextDue,
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageSuppliers) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { name, rif, phone, email, address } = body

    const trimmedName = (name || '').trim()
    if (!trimmedName) {
      return NextResponse.json({ error: 'El nombre del proveedor es obligatorio' }, { status: 400 })
    }
    if (trimmedName.length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 })
    }

    const trimmedRif = (rif || '').trim()
    if (trimmedRif) {
      if (!RIF_REGEX.test(trimmedRif)) {
        return NextResponse.json({ error: 'Formato de RIF inválido. Ejemplo: J-00000000-0' }, { status: 400 })
      }
      const existing = await db.supplier.findUnique({ where: { rif: trimmedRif } })
      if (existing) {
        return NextResponse.json({ error: 'Ya existe un proveedor con ese RIF' }, { status: 400 })
      }
    }

    // Validate phone: if provided, must have at least 7 digits
    const trimmedPhone = (phone || '').trim()
    if (trimmedPhone) {
      const digitsOnly = trimmedPhone.replace(/\D/g, '')
      if (digitsOnly.length < 7) {
        return NextResponse.json({ error: 'El teléfono debe tener al menos 7 dígitos' }, { status: 400 })
      }
    }

    // Validate email: if provided, must contain @ and .
    const trimmedEmail = (email || '').trim()
    if (trimmedEmail) {
      if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
        return NextResponse.json({ error: 'Formato de email inválido' }, { status: 400 })
      }
    }

    // Validate address: if provided, min 3 chars
    const trimmedAddress = (address || '').trim()
    if (trimmedAddress && trimmedAddress.length < 3) {
      return NextResponse.json({ error: 'La dirección debe tener al menos 3 caracteres' }, { status: 400 })
    }

    const supplier = await db.supplier.create({
      data: {
        name: trimmedName,
        rif: trimmedRif || null,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        address: trimmedAddress || null,
      },
    })
    await logAction({ action: 'create', entity: 'supplier', entityId: supplier.id, details: { name: trimmedName }, request })

    return NextResponse.json({ ...supplier, nextDueDate: null })
  } catch (error) {
    console.error('[Suppliers POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Soft delete
    await db.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    await logAction({ action: 'delete', entity: 'supplier', entityId: id, request })

    return NextResponse.json({ message: 'Proveedor eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar proveedor' }, { status: 500 })
  }
}
