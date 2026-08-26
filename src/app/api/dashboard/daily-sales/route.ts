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

function datePartsInTz(tz: string) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { timeZone: tz })
  const [m, day, y] = dateStr.split('/').map(Number)
  return { year: y, month: m, day }
}

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)
    const { searchParams } = new URL(request.url)
    // Optional: pass year & month to get a specific month (default: current)
    const tz = await getUserTz()
    let { year, month } = datePartsInTz(tz)

    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    if (yearParam) year = parseInt(yearParam)
    if (monthParam) month = parseInt(monthParam)

    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = startOfDayInTz(tz, new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
    const monthEnd = endOfDayInTz(tz, new Date(Date.UTC(year, month - 1, daysInMonth, 12, 0, 0)))

    // Fetch all completed sales in the month
    const sales = await db.sale.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, status: 'completada', branchId },
      include: { payments: true },
    })

    // Group by day
    const dailyTotals: Record<number, { total: number; count: number }> = {}
    for (let d = 1; d <= daysInMonth; d++) {
      dailyTotals[d] = { total: 0, count: 0 }
    }

    for (const sale of sales) {
      // Get the day in user's timezone
      const saleDateStr = sale.date.toLocaleDateString('en-US', { timeZone: tz })
      const parts = saleDateStr.split('/').map(Number)
      const saleMonth = parts[0]
      const saleDay = parts[1]
      if (saleMonth !== month) continue

      // Sum non-credit payments
      const cashTotal = sale.payments.reduce((s, p) => s + (p.method === 'credito' ? 0 : p.amount), 0)
      if (dailyTotals[saleDay]) {
        dailyTotals[saleDay].total += cashTotal
        dailyTotals[saleDay].count += 1
      }
    }

    const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-VE', { month: 'long' })

    const data = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const d = dailyTotals[day]
      return {
        day,
        label: `${day}`,
        total: Math.round(d.total * 100) / 100,
        count: d.count,
      }
    })

    const totalMonth = data.reduce((s, d) => s + d.total, 0)
    const totalCount = data.reduce((s, d) => s + d.count, 0)

    return NextResponse.json({
      year,
      month,
      monthLabel: monthName.charAt(0).toUpperCase() + monthName.slice(1),
      days: data,
      totalMonth: Math.round(totalMonth * 100) / 100,
      totalCount,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ventas diarias' }, { status: 500 })
  }
}
