import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)
    const { searchParams } = new URL(request.url)
    const yearFilter = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null
    const search = searchParams.get('search')?.trim().toLowerCase() || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const tz = await getUserTz()

    // Build the where clause for sale lines
    const saleWhere: Record<string, unknown> = {
      status: 'completada',
      branchId,
    }
    if (yearFilter) {
      const start = new Date(Date.UTC(yearFilter, 0, 1))
      const end = new Date(Date.UTC(yearFilter, 11, 31, 23, 59, 59, 999))
      saleWhere.date = { gte: start, lte: end }
    }

    // Get all sale lines with product info
    const saleLines = await db.saleLine.findMany({
      where: {
        sale: saleWhere,
        ...(search ? { product: { name: { contains: search, mode: 'insensitive' } } } : {}),
      },
      include: {
        product: { select: { id: true, name: true, active: true } },
        sale: { select: { id: true, date: true, branchId: true } },
      },
      orderBy: { sale: { date: 'desc' } },
    })

    // Get the earliest sale date for year range
    const firstSale = await db.sale.findFirst({
      where: { status: 'completada', branchId },
      orderBy: { date: 'asc' },
      select: { date: true },
    })
    const lastSale = await db.sale.findFirst({
      where: { status: 'completada', branchId },
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    // Determine available years
    const years: number[] = []
    if (firstSale && lastSale) {
      const startY = parseInt(firstSale.date.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric' }))
      const endY = parseInt(lastSale.date.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric' }))
      for (let y = startY; y <= endY; y++) years.push(y)
    } else {
      years.push(new Date().getFullYear())
    }

    // Group by product + year + month
    // Key: "productId|currencyCode|year|month"
    const grouped: Record<string, {
      productId: string
      productName: string
      productActive: boolean
      year: number
      month: number
      monthName: string
      currencyCode: string
      quantity: number
      revenue: number
      cost: number
      profit: number
    }> = {}

    for (const line of saleLines) {
      if (!line.product) continue

      // Get month/year in user's timezone
      const saleDate = line.sale.date
      const dateStr = saleDate.toLocaleDateString('en-US', { timeZone: tz })
      const [m, , y] = dateStr.split('/').map(Number)
      const month = m
      const year = y

      const code = line.currencyCode || ''
      const key = `${line.productId}|${code}|${year}|${month}`

      if (!grouped[key]) {
        grouped[key] = {
          productId: line.productId,
          productName: line.product.name,
          productActive: line.product.active,
          year,
          month,
          monthName: MONTH_NAMES[month - 1],
          currencyCode: code,
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        }
      }

      grouped[key].quantity += line.quantity
      grouped[key].revenue += line.lineTotal
      grouped[key].cost += (line.unitCost || 0) * line.quantity
      grouped[key].profit += line.lineProfit || 0
    }

    // Convert to array and sort by revenue desc
    let rows = Object.values(grouped).map(r => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      cost: Math.round(r.cost * 100) / 100,
      profit: Math.round(r.profit * 100) / 100,
    }))

    // Sort: by date desc (year desc, month desc), then by revenue desc
    rows.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      if (a.month !== b.month) return b.month - a.month
      return b.revenue - a.revenue
    })

    // Pagination
    const total = rows.length
    const totalPages = Math.ceil(total / limit)
    const paginatedRows = rows.slice((page - 1) * limit, page * limit)

    // Summary totals
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const totalCost = rows.reduce((s, r) => s + r.cost, 0)
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0)
    const totalQty = rows.reduce((s, r) => s + r.quantity, 0)
    const uniqueProducts = new Set(rows.map(r => r.productId)).size

    return NextResponse.json({
      rows: paginatedRows,
      pagination: { page, limit, total, totalPages },
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalQty,
        uniqueProducts,
      },
      years,
    })
  } catch (error) {
    console.error('[Product Monthly Report] Error:', error)
    return NextResponse.json({ error: 'Error al generar reporte' }, { status: 500 })
  }
}
