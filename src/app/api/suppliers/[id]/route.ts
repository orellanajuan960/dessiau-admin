import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

const RIF_REGEX = /^[JVEG]-\d{8,9}-\d$/

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true, payables: true, payments: true },
        },
        payables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: {
            id: true,
            amount: true,
            pendingBalance: true,
            dueDate: true,
            status: true,
          },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    return NextResponse.json(supplier)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener proveedor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageSuppliers) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { name, rif, phone, email, address } = body

    // Validate name
    const trimmedName = name ? String(name).trim() : ''
    if (!trimmedName) {
      return NextResponse.json({ error: 'El nombre del proveedor es obligatorio' }, { status: 400 })
    }
    if (trimmedName.length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 })
    }

    // Validate RIF
    const trimmedRif = rif !== undefined ? String(rif).trim() : undefined
    if (trimmedRif && trimmedRif.length > 0) {
      if (!RIF_REGEX.test(trimmedRif)) {
        return NextResponse.json({ error: 'Formato de RIF inválido. Ejemplo: J-00000000-0' }, { status: 400 })
      }
      // Check RIF uniqueness (exclude current supplier)
      const existing = await db.supplier.findFirst({ where: { rif: trimmedRif, id: { not: id } } })
      if (existing) {
        return NextResponse.json({ error: 'Ya existe un proveedor con ese RIF' }, { status: 400 })
      }
    }

    // Validate phone: if provided, must have at least 7 digits
    const trimmedPhone = phone !== undefined ? String(phone).trim() : undefined
    if (trimmedPhone && trimmedPhone.length > 0) {
      const digitsOnly = trimmedPhone.replace(/\D/g, '')
      if (digitsOnly.length < 7) {
        return NextResponse.json({ error: 'El teléfono debe tener al menos 7 dígitos' }, { status: 400 })
      }
    }

    // Validate email: if provided, must contain @ and .
    const trimmedEmail = email !== undefined ? String(email).trim() : undefined
    if (trimmedEmail && trimmedEmail.length > 0) {
      if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
        return NextResponse.json({ error: 'Formato de email inválido' }, { status: 400 })
      }
    }

    // Validate address: if provided, min 3 chars
    const trimmedAddress = address !== undefined ? String(address).trim() : undefined
    if (trimmedAddress && trimmedAddress.length > 0 && trimmedAddress.length < 3) {
      return NextResponse.json({ error: 'La dirección debe tener al menos 3 caracteres' }, { status: 400 })
    }

    const supplier = await db.supplier.update({
      where: { id },
      data: {
        name: trimmedName,
        rif: trimmedRif && trimmedRif.length > 0 ? trimmedRif : null,
        phone: trimmedPhone !== undefined ? (trimmedPhone.length > 0 ? trimmedPhone : null) : undefined,
        email: trimmedEmail !== undefined ? (trimmedEmail.length > 0 ? trimmedEmail : null) : undefined,
        address: trimmedAddress !== undefined ? (trimmedAddress.length > 0 ? trimmedAddress : null) : undefined,
      },
    })

    return NextResponse.json(supplier)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 })
  }
}
