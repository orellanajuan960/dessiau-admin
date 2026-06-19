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

        const lines = (r as any).sale?.lines || []
        // Determine the sale lines' currency
        const firstLineCode = lines.length > 0
          ? (lines[0].currencyCode || (lines[0] as any).product?.currency?.code || '')
          : ''
        const recvCode = r.currency?.code || ''

        // Case 1: Receivable currency matches sale lines currency (new format)
        // e.g. both VES — use pendingBalance directly
        if (recvCode && firstLineCode && recvCode === firstLineCode) {
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        }
        // Case 2: Receivable in USD but lines in VES (old format)
        // Convert pendingBalance from USD to VES
        else if (recvCode === refCode && firstLineCode === localCode && exRate > 0) {
          const inLocal = Math.round(r.pendingBalance * exRate * 100) / 100
          balanceByCurrency[localCode] = (balanceByCurrency[localCode] || 0) + inLocal
        }
        // Case 3: Receivable in VES but lines in USD
        else if (recvCode === localCode && firstLineCode === refCode && exRate > 0) {
          balanceByCurrency[localCode] = (balanceByCurrency[localCode] || 0) + r.pendingBalance
        }
        // Case 4: No lines or unknown currencies — use receivable's currency if available
        else if (recvCode) {
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        }
        // Case 5: No currency info at all — default to base currency
        else if (firstLineCode) {
          balanceByCurrency[firstLineCode] = (balanceByCurrency[firstLineCode] || 0) + r.pendingBalance
        } else {
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
