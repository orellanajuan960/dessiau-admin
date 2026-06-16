import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

// Timezone-aware date helpers
const COUNTRY_TZ: Record<string, string> = {
  VE: 'America/Caracas',
  CO: 'America/Bogota',
  CL: 'America/Santiago',
  PE: 'America/Lima',
  MX: 'America/Mexico_City',
  AR: 'America/Argentina/Buenos_Aires',
  EC: 'America/Guayaquil',
  PA: 'America/Panama',
  PY: 'America/Asuncion',
  UY: 'America/Montevideo',
  DO: 'America/Santo_Domingo',
  GT: 'America/Guatemala',
  ES: 'Europe/Madrid',
  US: 'America/New_York',
}

/** Get the user's timezone string */
async function getUserTz(): Promise<string> {
  try {
    const settings = await db.settings.findFirst({ select: { country: true } })
    return COUNTRY_TZ[settings?.country || ''] || 'America/Caracas'
  } catch {
    return 'America/Caracas'
  }
}

/** Get start-of-day in the user's timezone as a UTC Date */
function startOfDayInTz(tz: string, date?: Date): Date {
  const d = date || new Date()
  // Get the date parts in the user's timezone
  const dateStr = d.toLocaleDateString('en-US', { timeZone: tz })
  const [m, day, y] = dateStr.split('/').map(Number)
  // Reference point: noon UTC on that date (avoids DST edge cases)
  const ref = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
  // Compute offset: how TZ formats ref vs UTC
  const utcStr = ref.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = ref.toLocaleString('en-US', { timeZone: tz })
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime()
  // Midnight in TZ = ref - 12h - offset
  return new Date(ref.getTime() - 12 * 3600 * 1000 - offsetMs)
}

/** Get end-of-day in the user's timezone as a UTC Date (23:59:59.999) */
function endOfDayInTz(tz: string, date?: Date): Date {
  const start = startOfDayInTz(tz, date)
  return new Date(start.getTime() + 24 * 3600 * 1000 - 1)
}

/** Get the user's current date parts in their timezone */
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
    const period = searchParams.get('period') || 'month'

    const tz = await getUserTz()
    const { year, month, day } = datePartsInTz(tz)

    // Today boundaries in user's timezone (as UTC dates)
    const todayStart = startOfDayInTz(tz)
    const todayEnd = endOfDayInTz(tz)

    // Calculate date range based on period
    let startDate: Date
    let endDate: Date
    let chartDays: number
    let chartLabel: string

    switch (period) {
      case 'today':
        startDate = todayStart
        endDate = todayEnd
        chartDays = 1
        chartLabel = 'Hoy'
        break
      case 'week': {
        // Last 7 days including today (today - 6 days to today)
        startDate = startOfDayInTz(tz, new Date(Date.UTC(year, month - 1, day - 6, 12, 0, 0)))
        endDate = todayEnd
        chartDays = 7
        chartLabel = '7 días'
        break
      }
      case 'year': {
        // Full year: Jan 1 to Dec 31
        startDate = startOfDayInTz(tz, new Date(Date.UTC(year, 0, 1, 12, 0, 0)))
        endDate = endOfDayInTz(tz, new Date(Date.UTC(year, 11, 31, 12, 0, 0)))
        chartDays = 12
        chartLabel = `${year}`
        break
      }
      case 'month':
      default: {
        // Full month: 1st to last day
        const daysInMonth = new Date(year, month, 0).getDate()
        startDate = startOfDayInTz(tz, new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
        endDate = endOfDayInTz(tz, new Date(Date.UTC(year, month - 1, daysInMonth, 12, 0, 0)))
        chartDays = daysInMonth
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-VE', { month: 'long' })
        chartLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)
        break
      }
    }

    // Custom date range overrides period
    const customFrom = searchParams.get('from')
    const customTo = searchParams.get('to')
    let isCustom = false
    if (customFrom) {
      startDate = new Date(customFrom + 'T00:00:00')
      isCustom = true
    }
    if (customTo) {
      endDate = new Date(customTo + 'T23:59:59')
      isCustom = true
    }
    if (isCustom) {
      const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
      chartLabel = `${fmt(startDate)} – ${fmt(endDate)}`
      chartDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      chartDays = Math.min(chartDays, 365)
    }

    // Sales in period
    const salesPeriod = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: { lines: { include: { product: { select: { name: true, currencyId: true } } } }, payments: { include: { currency: { select: { code: true, symbol: true } } } }, currency: { select: { code: true, symbol: true } } },
    })

    // Expenses in period
    const expensesPeriod = await db.expense.findMany({ where: { date: { gte: startDate, lte: endDate }, branchId, deletedAt: null } })

    // Adjustments in period (losses)
    const adjustmentsPeriod = await db.inventoryAdjustment.findMany({
      where: { createdAt: { gte: startDate, lte: endDate }, branchId },
      include: { product: true },
    })

    // Sales today (always for KPI — uses timezone-aware boundaries)
    const salesToday = await db.sale.findMany({
      where: { date: { gte: todayStart, lte: todayEnd }, status: 'completada', branchId },
    })
    const expensesToday = await db.expense.findMany({ where: { date: { gte: todayStart, lte: todayEnd }, branchId, deletedAt: null } })

    // Sales this month (always for KPI)
    const monthStartDate = startOfDayInTz(tz, new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
    const monthEndDate = endOfDayInTz(tz, new Date(Date.UTC(year, month - 1, new Date(year, month, 0).getDate(), 12, 0, 0)))
    const salesMonth = await db.sale.findMany({
      where: { date: { gte: monthStartDate, lte: monthEndDate }, status: 'completada', branchId },
      include: { lines: { include: { product: { select: { name: true } } } } },
    })
    const expensesMonth = await db.expense.findMany({ where: { date: { gte: monthStartDate, lte: monthEndDate }, branchId, deletedAt: null } })

    // Build a map of product currency codes for the period (from SaleLine.currencyCode)
    const productCurrencyMap = new Map<string, string>()
    salesPeriod.forEach(sale => {
      sale.lines.forEach(line => {
        if (line.productId && !productCurrencyMap.has(line.productId)) {
          productCurrencyMap.set(line.productId, line.currencyCode || '')
        }
      })
    })

    // Calculate KPIs
    const ingresosHoy = salesToday.reduce((s, sale) => s + sale.total, 0)
    const gastosHoy = expensesToday.reduce((s, e) => s + e.amount, 0)
    const ingresosMes = salesMonth.reduce((s, sale) => s + sale.total, 0)
    const gastosMes = expensesMonth.reduce((s, e) => s + e.amount, 0)

    const costoVentasMes = salesMonth.reduce((s, sale) =>
      s + sale.lines.reduce((ls, l) => ls + (l.unitCost * l.quantity), 0), 0)
    const utilidadBrutaMes = ingresosMes - costoVentasMes
    const perdidasMes = adjustmentsPeriod.reduce((s, a) => {
      const prod = a.product
      return s + (a.quantity * (prod?.costAvg || 0))
    }, 0)
    const utilidadNetaMes = utilidadBrutaMes - gastosMes - perdidasMes

    // Period totals
    const ingresosPeriodo = salesPeriod.reduce((s, sale) => s + sale.total, 0)
    const gastosPeriodo = expensesPeriod.reduce((s, e) => s + e.amount, 0)

    // Period-level utility calculations (for filtered views)
    const costoVentasPeriodo = salesPeriod.reduce((s, sale) =>
      s + sale.lines.reduce((ls, l) => ls + (l.unitCost * l.quantity), 0), 0)
    const utilidadBrutaPeriodo = ingresosPeriodo - costoVentasPeriodo
    const perdidasPeriodo = adjustmentsPeriod.reduce((s, a) => {
      const prod = a.product
      return s + (a.quantity * (prod?.costAvg || 0))
    }, 0)
    const utilidadNetaPeriodo = utilidadBrutaPeriodo - gastosPeriodo - perdidasPeriodo

    // Top 5 products by revenue (from period sales)
    // Each product keeps its own currency; if a product appears in multiple
    // currencies, we split it into separate entries (code suffix).
    const productRevenueRaw: Record<string, { name: string; revenue: number; qty: number; currencyCode: string }> = {}
    salesPeriod.forEach(sale => {
      sale.lines.forEach(line => {
        const code = line.currencyCode || ''
        // Use productId + currencyCode as key so same product in different currencies stays separate
        const key = `${line.productId}|${code}`
        if (!productRevenueRaw[key]) {
          productRevenueRaw[key] = { name: line.product?.name || 'Producto', revenue: 0, qty: 0, currencyCode: code }
        }
        productRevenueRaw[key].revenue += line.lineTotal
        productRevenueRaw[key].qty += line.quantity
      })
    })
    const topProducts = Object.values(productRevenueRaw)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // Last 10 sales in period — include line currencyCode for correct display
    const recentSalesRaw = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: {
        client: { select: { name: true } },
        user: { select: { name: true } },
        lines: { include: { product: { select: { name: true } } } },
        currency: { select: { code: true, symbol: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    })

    // Build recentSales with per-currency totals derived from lines
    const recentSales = recentSalesRaw.map(sale => {
      // Compute total per currency from lines
      const totalsByCurrency: Record<string, number> = {}
      sale.lines.forEach(line => {
        const code = line.currencyCode || ''
        if (!code) return
        totalsByCurrency[code] = (totalsByCurrency[code] || 0) + line.lineTotal
      })
      const currencies = Object.entries(totalsByCurrency).map(([code, total]) => ({
        code,
        total: Math.round(total * 100) / 100,
      }))
      // Derive primary currency: if all lines share one currency, use it
      const uniqueCodes = new Set(sale.lines.map(l => l.currencyCode).filter(Boolean))
      const primaryCurrencyCode = uniqueCodes.size === 1 ? [...uniqueCodes][0] : (sale.currency?.code || '')

      return {
        id: sale.id,
        date: sale.date.toISOString(),
        total: sale.total,
        status: sale.status,
        client: sale.client ? { name: sale.client.name } : null,
        user: { name: sale.user.name },
        currency: sale.currency ? { code: primaryCurrencyCode, symbol: sale.currency.symbol } : null,
        currencies, // per-currency breakdown
      }
    })

    // Alerts: low stock
    const lowStockItems = await db.inventory.findMany({
      where: { branchId },
      include: { product: { select: { name: true, active: true } } },
    })
    const lowStockAlerts = lowStockItems
      .filter(i => i.product.active && i.minStock > 0 && i.stock <= i.minStock)
      .map(i => ({ productName: i.product.name, stock: i.stock, minStock: i.minStock }))

    // Alerts: overdue accounts receivable
    const overdueReceivables = await db.accountReceivable.findMany({
      where: { status: 'pendiente', dueDate: { lt: new Date() } },
      include: { client: { select: { name: true } } },
    })
    const overdueAlerts = overdueReceivables.map(r => ({
      clientName: r.client.name,
      pendingBalance: r.pendingBalance,
      dueDate: r.dueDate,
    }))

    // Alerts: overdue accounts payable (supplier debts)
    const overduePayables = await db.accountPayable.findMany({
      where: { status: 'pendiente', dueDate: { lt: new Date() } },
      include: { supplier: { select: { name: true } } },
    })
    const overduePayableAlerts = overduePayables.map(p => ({
      supplierName: p.supplier?.name || 'Desconocido',
      pendingBalance: p.pendingBalance,
      dueDate: p.dueDate,
    }))

    // Chart data based on period — always uses the timezone-aware startDate/endDate
    const chartData: { date: string; total: number; count: number }[] = []

    if (period === 'year') {
      // Monthly chart for year view — use timezone-aware month boundaries
      for (let i = 0; i < 12; i++) {
        const mStart = startOfDayInTz(tz, new Date(Date.UTC(year, i, 1, 12, 0, 0)))
        const mEnd = i < 11
          ? startOfDayInTz(tz, new Date(Date.UTC(year, i + 1, 1, 12, 0, 0)))
          : new Date(endOfDayInTz(tz, new Date(Date.UTC(year, 11, 31, 12, 0, 0))).getTime() + 1)

        const monthSales = await db.sale.findMany({
          where: { date: { gte: mStart, lt: mEnd }, status: 'completada', branchId },
        })
        const monthTotal = monthSales.reduce((s, sale) => s + sale.total, 0)

        const monthName = new Date(year, i, 1).toLocaleDateString('es-VE', { month: 'short' })
        chartData.push({
          date: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          total: Math.round(monthTotal * 100) / 100,
          count: monthSales.length,
        })
      }
    } else if (period === 'today') {
      // Hourly chart for today — use timezone-aware boundaries from todayStart
      const nowTz = new Date().toLocaleString('en-US', { timeZone: tz })
      const currentHourInTz = parseInt(new Date(nowTz).getHours().toString(), 10)

      for (let h = 0; h < 24; h++) {
        const hStart = new Date(todayStart.getTime() + h * 3600 * 1000)
        const hEnd = new Date(todayStart.getTime() + (h + 1) * 3600 * 1000)

        const hourSales = await db.sale.findMany({
          where: { date: { gte: hStart, lt: hEnd }, status: 'completada', branchId },
        })
        const hourTotal = hourSales.reduce((s, sale) => s + sale.total, 0)

        if (hourTotal > 0 || h <= currentHourInTz) {
          chartData.push({
            date: `${h.toString().padStart(2, '0')}:00`,
            total: Math.round(hourTotal * 100) / 100,
            count: hourSales.length,
          })
        }
      }
    } else {
      // Daily chart for week/month/custom — use the already-computed startDate/endDate
      const rangeStart = new Date(startDate)
      const rangeEnd = new Date(endDate)
      const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      // If range > 60 days, group into weeks; otherwise show daily
      const groupByDays = totalDays > 60 ? 7 : 1
      for (let i = 0; i < totalDays; i += groupByDays) {
        const d = new Date(rangeStart.getTime() + i * 24 * 3600 * 1000)
        const nextD = new Date(rangeStart.getTime() + (i + groupByDays) * 24 * 3600 * 1000)
        if (nextD > rangeEnd) nextD.setTime(rangeEnd.getTime() + 1)

        const daySales = await db.sale.findMany({
          where: { date: { gte: d, lt: nextD }, status: 'completada', branchId },
        })
        const dayTotal = daySales.reduce((s, sale) => s + sale.total, 0)

        chartData.push({
          date: d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' }),
          total: Math.round(dayTotal * 100) / 100,
          count: daySales.length,
        })
      }
    }

    // KPI helpers
    const ventasPeriodo = salesPeriod.length
    const totalActiveProducts = await db.product.count({ where: { active: true, branchId } })
    const clientesPeriodo = new Set(salesPeriod.map(s => s.clientId).filter(Boolean)).size

    // Open cash register
    const openRegister = await db.cashRegister.findFirst({
      where: { status: 'abierta', branchId },
      include: {
        user: { select: { name: true } },
        _count: { select: { sales: true } },
      },
    })

    return NextResponse.json({
      ingresosHoy: Math.round(ingresosHoy * 100) / 100,
      ingresosMes: Math.round(ingresosMes * 100) / 100,
      gastosHoy: Math.round(gastosHoy * 100) / 100,
      gastosMes: Math.round(gastosMes * 100) / 100,
      ingresosPeriodo: Math.round(ingresosPeriodo * 100) / 100,
      gastosPeriodo: Math.round(gastosPeriodo * 100) / 100,
      utilidadBrutaMes: Math.round(utilidadBrutaMes * 100) / 100,
      utilidadNetaMes: Math.round(utilidadNetaMes * 100) / 100,
      utilidadBrutaPeriodo: Math.round(utilidadBrutaPeriodo * 100) / 100,
      utilidadNetaPeriodo: Math.round(utilidadNetaPeriodo * 100) / 100,
      topProducts,
      recentSales,
      lowStockAlerts,
      overdueAlerts,
      overduePayableAlerts,
      chartData,
      chartLabel,
      period,
      ventasPeriodo,
      totalActiveProducts,
      clientesPeriodo,
      openRegister,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 })
  }
}
