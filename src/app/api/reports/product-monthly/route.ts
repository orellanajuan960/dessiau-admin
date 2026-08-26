import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

const COUNTRY_TZ: Record<string, string> = {
  VE: 'America/Caracas', CO: 'America/Bogota', CL: 'America/Santiago',
  PE: 'America/Lima', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires',
  EC: 'America/Guayaquil', PA: 'America/Panama', PY: 'America/Asuncion',
  UY: 'America/Montevideo', DO: 'America/Santo_Domingo', GT: 'America/Guatemala',
  ES: 'Europe/Madrid', US: 'America/New_York',
}

async function getUserTz(): Promise<string> {
  try {
    const settings = await db.settings.findFirst({ select: { country: true } })
    return COUNTRY_TZ[settings?.country || ''] || 'America/Caracas'
  } catch { return 'America/Caracas' }
}

function startOfDayInTz(tz: string, date?: Date): Date {
  const d = date || new Date()
  const dateStr = d.toLocaleDateString('en-US', { timeZone: tz })
  const [m, day, y] = dateStr.split('/').map(Number)
  const ref = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
  const utcStr = ref.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = ref.toLocaleString('en-US', { timeZone: tz })
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime()
  return new Date(ref.getTime() - 12 * 3600 * 1000 - offsetMs)
}

function endOfDayInTz(tz: string, date?: Date): Date {
  const start = startOfDayInTz(tz, date)
  return new Date(start.getTime() + 24 * 3600 * 1000 - 1)
}

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim().toLowerCase() || ''
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const tz = await getUserTz()

    // Build date filter
    const saleWhere: Record<string, unknown> = {
      status: 'completada',
      branchId,
    }

    if (fromParam && toParam) {
      const startDate = startOfDayInTz(tz, new Date(fromParam + 'T12:00:00'))
      const endDate = endOfDayInTz(tz, new Date(toParam + 'T12:00:00'))
      saleWhere.date = { gte: startDate, lte: endDate }
    }

    // Get all sale lines in the range
    const saleLines = await db.saleLine.findMany({
      where: {
        sale: saleWhere,
        ...(search ? { product: { name: { contains: search, mode: 'insensitive' } } } : {}),
      },
      include: {
        product: { select: { id: true, name: true, active: true } },
      },
    })

    // Group by product — sum quantities
    const grouped: Record<string, { productId: string; productName: string; productActive: boolean; quantity: number }> = {}

    for (const line of saleLines) {
      if (!line.product) continue
      const pid = line.productId
      if (!grouped[pid]) {
        grouped[pid] = {
          productId: pid,
          productName: line.product.name,
          productActive: line.product.active,
          quantity: 0,
        }
      }
      grouped[pid].quantity += line.quantity
    }

    // Convert to array, sort by quantity desc
    const rows = Object.values(grouped)
      .map(r => ({
        productId: r.productId,
        productName: r.productName,
        productActive: r.productActive,
        quantity: Math.round(r.quantity * 100) / 100,
      }))
      .sort((a, b) => b.quantity - a.quantity)

    const totalQty = rows.reduce((s, r) => s + r.quantity, 0)
    const uniqueProducts = rows.length

    return NextResponse.json({ rows, totalQty, uniqueProducts })
  } catch (error) {
    console.error('[Product Report] Error:', error)
    return NextResponse.json({ error: 'Error al generar reporte' }, { status: 500 })
  }
}
