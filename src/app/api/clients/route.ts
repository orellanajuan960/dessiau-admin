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

    // Get settings for currency conversion
    const settings = await db.settings.findFirst()
    const exRate = settings?.exchangeRate || 0
    const [refCur, localCur] = await Promise.all([
      settings?.referenceCurrencyId ? db.currency.findUnique({ where: { id: settings.referenceCurrencyId }, select: { code: true } }) : null,
      settings?.baseCurrencyId ? db.currency.findUnique({ where: { id: settings.baseCurrencyId }, select: { code: true } }) : null,
    ])
    const refCode = refCur?.code || 'USD'
    const localCode = localCur?.code || 'VES'

    // Compute pending balance per currency for each client
    const clientsWithBalance = clients.map(client => {
      const balanceByCurrency: Record<string, number> = {}

      for (const r of client.receivables) {
        if (r.pendingBalance <= 0) continue

        const recvCode = r.currency?.code || ''
        const lines = (r as any).sale?.lines || []

        // Check if ANY sale line matches the receivable's currency
        const hasMatchingLine = lines.some(
          (l: { currencyCode?: string; product?: { currency?: { code: string } } }) =>
            l.currencyCode === recvCode || (l as any).product?.currency?.code === recvCode
        )

        if (hasMatchingLine) {
          // Receivable is stored in a currency that matches its products (new format)
          // Use pendingBalance directly — no conversion needed
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        } else if (recvCode === refCode && exRate > 0) {
          // Old format: receivable stored in USD but products are in VES
          // Convert the USD amount back to VES
          const inLocal = Math.round(r.pendingBalance * exRate * 100) / 100
          balanceByCurrency[localCode] = (balanceByCurrency[localCode] || 0) + inLocal
        } else if (recvCode) {
          // Fallback: use the receivable's own currency
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        } else {
          // No currency info at all — default to base currency
          balanceByCurrency[localCode] = (balanceByCurrency[localCode] || 0) + r.pendingBalance
        }
      }

      // Round each currency balance
      for (const code of Object.keys(balanceByCurrency)) {
        balanceByCurrency[code] = Math.round(balanceByCurrency[code] * 100) / 100
      }

      // Compute a single pendingBalance total in local currency for backward compat
      let totalPending = 0
      for (const [code, amt] of Object.entries(balanceByCurrency)) {
        if (amt <= 0) continue
        if (code === localCode) {
          totalPending += amt
        } else if (code === refCode && exRate > 0) {
          totalPending += amt * exRate
        } else {
          totalPending += amt
        }
      }

      return {
        ...client,
        pendingBalance: Math.round(totalPending * 100) / 100,
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
