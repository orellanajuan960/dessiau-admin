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
    const tz = await getUserTz()

    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    let startDate: Date
    let endDate: Date
    let rangeLabel: string

    if (fromParam && toParam) {
      // Use custom date range
      startDate = startOfDayInTz(tz, new Date(fromParam + 'T12:00:00'))
      endDate = endOfDayInTz(tz, new Date(toParam + 'T12:00:00'))
      const fmtD = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
      const fmtDYear = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })
      // If range spans different years, show year in label
      if (startDate.getFullYear() !== endDate.getFullYear()) {
        rangeLabel = `${fmtDYear(startDate)} – ${fmtDYear(endDate)}`
      } else {
        rangeLabel = `${fmtD(startDate)} – ${fmtD(endDate)} ${endDate.getFullYear()}`
      }
    } else {
      // Default: current month
      const { year, month } = datePartsInTz(tz)
      const daysInMonth = new Date(year, month, 0).getDate()
      startDate = startOfDayInTz(tz, new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
      endDate = endOfDayInTz(tz, new Date(Date.UTC(year, month - 1, daysInMonth, 12, 0, 0)))
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-VE', { month: 'long' })
      rangeLabel = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`
    }

    // Calculate total days in range
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Decide grouping: daily for <=60 days, weekly for 61-180, monthly for >180
    let groupBy = 1
    if (totalDays > 180) groupBy = 30
    else if (totalDays > 60) groupBy = 7

    // Fetch all completed sales in the range
    const sales = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: { payments: true },
    })

    // Build grouped data
    const data: Array<{ day: number; label: string; total: number; count: number }> = []

    for (let i = 0; i < totalDays; i += groupBy) {
      const dStart = new Date(startDate.getTime() + i * 24 * 3600 * 1000)
      const dEnd = new Date(startDate.getTime() + (i + groupBy) * 24 * 3600 * 1000)
      if (dEnd > endDate) dEnd.setTime(endDate.getTime() + 1)

      let total = 0
      let count = 0
      for (const sale of sales) {
        if (sale.date >= dStart && sale.date < dEnd) {
          const cashTotal = sale.payments.reduce((s, p) => s + (p.method === 'credito' ? 0 : p.amount), 0)
          total += cashTotal
          count += 1
        }
      }

      let label: string
      if (groupBy === 30) {
        label = dStart.toLocaleDateString('es-VE', { month: 'short' })
      } else if (groupBy === 7) {
        label = `${dStart.getDate()}/${dStart.getMonth() + 1}`
      } else {
        label = `${dStart.getDate()}`
      }

      data.push({
        day: i + 1,
        label,
        total: Math.round(total * 100) / 100,
        count,
      })
    }

    const totalRange = data.reduce((s, d) => s + d.total, 0)
    const totalCount = data.reduce((s, d) => s + d.count, 0)

    return NextResponse.json({
      rangeLabel,
      days: data,
      totalRange: Math.round(totalRange * 100) / 100,
      totalCount,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ventas diarias' }, { status: 500 })
  }
}
