import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// ── Default payment method templates ──────────────────────────────

const DEFAULT_METHODS = [
  { code: 'divisas', name: 'Divisas', icon: 'Banknote', needsReference: false, isLocalCurrency: false, isCash: false, isCredit: false, sortOrder: 0, countries: 'ALL', isDefault: true },
  { code: 'efectivo', name: 'Efectivo', icon: 'Banknote', needsReference: false, isLocalCurrency: true, isCash: true, isCredit: false, sortOrder: 1, countries: 'ALL', isDefault: true },
  { code: 'pago_movil', name: 'Pago Móvil', icon: 'Smartphone', needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 2, countries: 'VE', isDefault: true },
  { code: 'tarjeta', name: 'Tarjeta', icon: 'CreditCard', needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 3, countries: 'ALL', isDefault: true },
  { code: 'transferencia', name: 'Transferencia', icon: 'ArrowLeftRight', needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 4, countries: 'ALL', isDefault: true },
  { code: 'credito', name: 'Crédito', icon: 'Clock', needsReference: false, isLocalCurrency: false, isCash: false, isCredit: true, sortOrder: 5, countries: 'ALL', isDefault: true },
]

// Track if migration was already attempted this process
let _migrated = false

/** Add isDefault column if missing (backward compat with existing tables) */
async function ensureIsDefaultColumn() {
  if (_migrated) return
  _migrated = true
  try {
    // Try a query that uses the column — if it fails, add it
    await db.$queryRawUnsafe(`SELECT "isDefault" FROM "PaymentMethod" LIMIT 0`)
  } catch {
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "PaymentMethod" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false`
      )
      // Mark existing rows as default methods
      const defaultCodes = ['divisas', 'efectivo', 'pago_movil', 'tarjeta', 'transferencia', 'credito']
      await db.$executeRawUnsafe(
        `UPDATE "PaymentMethod" SET "isDefault" = true WHERE "code" = ANY($1)`,
        defaultCodes
      )
      console.log('[PaymentMethod] Migration: added isDefault column')
    } catch (e) {
      console.error('[PaymentMethod] Migration failed:', e)
    }
  }
}

// GET /api/payment-methods?country=VE
export async function GET(request: Request) {
  try {
    await ensureIsDefaultColumn()
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country') || undefined

    let methods = await db.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })

    if (methods.length === 0) {
      await seedDefaults(country)
      methods = await db.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    }

    const filtered = methods.filter(m => {
      if (m.countries === 'ALL') return true
      return m.countries.split(',').includes(country || 'VE')
    })

    return NextResponse.json(filtered)
  } catch (error) {
    console.error('[GET /api/payment-methods]', error)
    return NextResponse.json([], { status: 200 })
  }
}

// PUT /api/payment-methods
export async function PUT(request: Request) {
  try {
    await ensureIsDefaultColumn()
    const body = await request.json()
    const { id, enabled, name, needsReference, sortOrder } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const data: Prisma.PaymentMethodUpdateInput = {}
    if (enabled !== undefined) data.enabled = enabled
    if (name !== undefined) data.name = name
    if (needsReference !== undefined) data.needsReference = needsReference
    if (sortOrder !== undefined) data.sortOrder = sortOrder

    const updated = await db.paymentMethod.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('[PUT /api/payment-methods]', error)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}

// POST /api/payment-methods
export async function POST(request: Request) {
  try {
    await ensureIsDefaultColumn()
    const body = await request.json()
    const { code, name, icon, needsReference, isLocalCurrency, isCash, isCredit, countries } = body

    if (!code || !name) {
      return NextResponse.json({ error: 'code y name son obligatorios' }, { status: 400 })
    }

    const existing = await db.paymentMethod.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un método con ese código' }, { status: 409 })
    }

    const created = await db.paymentMethod.create({
      data: {
        code,
        name,
        icon: icon || 'CircleDollarSign',
        enabled: true,
        needsReference: needsReference || false,
        isLocalCurrency: isLocalCurrency || false,
        isCash: isCash || false,
        isCredit: isCredit || false,
        sortOrder: 99,
        countries: countries || 'ALL',
        isDefault: false,
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/payment-methods]', error)
    return NextResponse.json({ error: 'Error al crear' }, { status: 500 })
  }
}

// DELETE /api/payment-methods?id=xxx
export async function DELETE(request: Request) {
  try {
    await ensureIsDefaultColumn()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const method = await db.paymentMethod.findUnique({ where: { id } })
    if (method?.isDefault) {
      return NextResponse.json({ error: 'No se pueden eliminar los métodos de pago del sistema' }, { status: 403 })
    }

    await db.paymentMethod.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/payment-methods]', error)
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}

// ── Helpers ────────────────────────────────────────────────────────

async function seedDefaults(country?: string) {
  for (const m of DEFAULT_METHODS) {
    const existing = await db.paymentMethod.findUnique({ where: { code: m.code } })
    if (existing) continue
    const availableForCountry = m.countries === 'ALL' || m.countries.split(',').includes(country || 'VE')
    await db.paymentMethod.create({
      data: {
        code: m.code,
        name: m.name,
        icon: m.icon,
        enabled: availableForCountry,
        needsReference: m.needsReference,
        isLocalCurrency: m.isLocalCurrency,
        isCash: m.isCash,
        isCredit: m.isCredit,
        sortOrder: m.sortOrder,
        countries: m.countries,
        isDefault: true,
      },
    })
  }
}