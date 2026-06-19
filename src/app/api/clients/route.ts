import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPhone(phone: string): boolean {
  // Allow optional + prefix, then at least 7 digits
  return /^\+?\d{7,}$/.test(phone.replace(/[\s\-()]/g, ''))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    const where: Record<string, unknown> = {}
    if (!includeDeleted) {
      where.deletedAt = null
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const clients = await db.client.findMany({
      where,
      include: {
        _count: { select: { sales: true } },
        receivables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: {
            amount: true,
            pendingBalance: true,
            currencyId: true,
            currency: { select: { code: true } },
            sale: {
              select: {
                lines: {
                  select: {
                    currencyCode: true,
                    lineTotal: true,
                    product: { select: { currencyId: true, currency: { select: { code: true } } } } },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute pending balance per currency for each client
    const clientsWithBalance = clients.map(client => {
      const balanceByCurrency: Record<string, number> = {}
      let totalPendingInRef = 0

      for (const r of client.receivables) {
        const recvCode = r.currency?.code || ''
        const lines = (r as any).sale?.lines || []
        if (lines.length === 0) {
          if (recvCode) balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
          continue
        }

        // Check if receivable's currency matches the sale lines' currency (new format)
        const lineCodes = [...new Set(lines.map((l: { currencyCode?: string }) => l.currencyCode).filter(Boolean))]

        if (lineCodes.length === 1 && lineCodes[0] === recvCode) {
          // New format: receivable stored in original currency — use directly, no conversion
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        } else {
          // Old format or mixed: derive from sale lines using ratio
          const lineTotalsByCurrency: Record<string, number> = {}
          for (const line of lines) {
            const code = line.currencyCode || (line as any).product?.currency?.code || ''
            if (!code) continue
            lineTotalsByCurrency[code] = (lineTotalsByCurrency[code] || 0) + (line.lineTotal || 0)
          }
          const ratio = r.amount > 0 ? Math.min(r.pendingBalance / r.amount, 1) : 1
          for (const [code, lineTotal] of Object.entries(lineTotalsByCurrency)) {
            balanceByCurrency[code] = (balanceByCurrency[code] || 0) + Math.round(lineTotal * ratio * 100) / 100
          }
        }
      }

      // Round each currency balance
      for (const code of Object.keys(balanceByCurrency)) {
        balanceByCurrency[code] = Math.round(balanceByCurrency[code] * 100) / 100
      }
      return {
        ...client,
        pendingBalance: Math.round(totalPendingInRef * 100) / 100,
        balanceByCurrency,
      }
    })

    return NextResponse.json(clientsWithBalance)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const name = (body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (name.length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 })
    }

    const phone = body.phone ? body.phone.trim() : null
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ error: 'El teléfono debe tener al menos 7 dígitos' }, { status: 400 })
    }

    const email = body.email ? body.email.trim() : null
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: 'El formato del email no es válido' }, { status: 400 })
    }

    const address = body.address ? body.address.trim() : null
    if (address && address.length < 3) {
      return NextResponse.json({ error: 'La dirección debe tener al menos 3 caracteres' }, { status: 400 })
    }

    const note = body.note ? body.note.trim() : null

    const client = await db.client.create({
      data: {
        name,
        phone,
        email,
        address,
        note,
      },
    })
    await logAction({ action: 'create', entity: 'client', entityId: client.id, details: { name }, request })
    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Verify client exists
    const existing = await db.client.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Handle reactivation
    if (body.reactivate) {
      const client = await db.client.update({
        where: { id },
        data: { deletedAt: null },
      })
      return NextResponse.json(client)
    }

    const name = (body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (name.length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 })
    }

    const phone = body.phone ? body.phone.trim() : null
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ error: 'El teléfono debe tener al menos 7 dígitos' }, { status: 400 })
    }

    const email = body.email ? body.email.trim() : null
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: 'El formato del email no es válido' }, { status: 400 })
    }

    const address = body.address ? body.address.trim() : null
    if (address && address.length < 3) {
      return NextResponse.json({ error: 'La dirección debe tener al menos 3 caracteres' }, { status: 400 })
    }

    const note = body.note ? body.note.trim() : null

    const client = await db.client.update({
      where: { id },
      data: {
        name,
        phone,
        email,
        address,
        note,
      },
    })
    await logAction({ action: 'update', entity: 'client', entityId: id, details: { name }, request })

    return NextResponse.json(client)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Soft delete
    await db.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    await logAction({ action: 'delete', entity: 'client', entityId: id, request })

    return NextResponse.json({ message: 'Cliente eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 })
  }
}
