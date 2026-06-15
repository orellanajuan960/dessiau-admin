import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month' // today, week, month, year

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Calculate date range based on period
    let startDate: Date
    let chartDays: number
    let chartLabel: string

    switch (period) {
      case 'today':
        startDate = new Date(today)
        chartDays = 1
        chartLabel = 'Hoy'
        break
      case 'week':
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 7)
        chartDays = 7
        chartLabel = '7 días'
        break
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1)
        chartDays = 12 // Show monthly for year view
        chartLabel = '12 meses'
        break
      case 'month':
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        chartDays = 7
        chartLabel = '7 días'
        break
    }

    // Custom date range overrides period
    const customFrom = searchParams.get('from')
    const customTo = searchParams.get('to')
    let endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
    let isCustom = false
    if (customFrom) {
      startDate = new Date(customFrom)
      startDate.setHours(0, 0, 0, 0)
      isCustom = true
    }
    if (customTo) {
      endDate = new Date(customTo)
      endDate.setHours(23, 59, 59, 999)
      isCustom = true
    }
    if (isCustom) {
      // Build a readable label for the custom range
      const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
      chartLabel = `${fmt(startDate)} – ${fmt(endDate)}`
      chartDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      chartDays = Math.min(chartDays, 365) // cap at 1 year
    }

    // Sales in period
    const salesPeriod = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: { lines: { include: { product: { select: { name: true } } } }, payments: true },
    })

    // Expenses in period
    const expensesPeriod = await db.expense.findMany({ where: { date: { gte: startDate, lte: endDate }, branchId, deletedAt: null } })

    // Adjustments in period (losses)
    const adjustmentsPeriod = await db.inventoryAdjustment.findMany({
      where: { createdAt: { gte: startDate }, branchId },
      include: { product: true },
    })

    // Sales today (always for KPI)
    const salesToday = await db.sale.findMany({
      where: { date: { gte: today }, status: 'completada', branchId },
    })
    const expensesToday = await db.expense.findMany({ where: { date: { gte: today }, branchId, deletedAt: null } })

    // Sales this month (always for KPI)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const salesMonth = await db.sale.findMany({
      where: { date: { gte: monthStart }, status: 'completada', branchId },
      include: { lines: { include: { product: { select: { name: true } } } } },
    })
    const expensesMonth = await db.expense.findMany({ where: { date: { gte: monthStart }, branchId, deletedAt: null } })

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
    const productRevenue: Record<string, { name: string; revenue: number; qty: number }> = {}
    salesPeriod.forEach(sale => {
      sale.lines.forEach(line => {
        const key = line.productId
        if (!productRevenue[key]) {
          productRevenue[key] = { name: line.product?.name || 'Producto', revenue: 0, qty: 0 }
        }
        productRevenue[key].revenue += line.lineTotal
        productRevenue[key].qty += line.quantity
      })
    })
    const topProducts = Object.values(productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // Last 10 sales in period
    const recentSales = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: {
        client: { select: { name: true } },
        user: { select: { name: true } },
        lines: { include: { product: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 10,
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

    // Chart data based on period
    const chartData: { date: string; total: number; count: number }[] = []

    if (period === 'year') {
      // Monthly chart for year view
      for (let i = 11; i >= 0; i--) {
        const mStart = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const mEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 1)

        const monthSales = await db.sale.findMany({
          where: { date: { gte: mStart, lt: mEnd }, status: 'completada', branchId },
        })
        const monthTotal = monthSales.reduce((s, sale) => s + sale.total, 0)

        chartData.push({
          date: mStart.toLocaleDateString('es-VE', { month: 'short' }),
          total: Math.round(monthTotal * 100) / 100,
          count: monthSales.length,
        })
      }
    } else if (period === 'today') {
      // Hourly chart for today
      for (let h = 0; h < 24; h++) {
        const hStart = new Date(today)
        hStart.setHours(h, 0, 0, 0)
        const hEnd = new Date(today)
        hEnd.setHours(h + 1, 0, 0, 0)

        const hourSales = await db.sale.findMany({
          where: { date: { gte: hStart, lt: hEnd }, status: 'completada', branchId },
        })
        const hourTotal = hourSales.reduce((s, sale) => s + sale.total, 0)

        if (hourTotal > 0 || h <= new Date().getHours()) {
          chartData.push({
            date: `${h}:00`,
            total: Math.round(hourTotal * 100) / 100,
            count: hourSales.length,
          })
        }
      }
    } else {
      // Daily chart for week/month/custom
      const rangeStart = isCustom ? new Date(startDate) : new Date()
      if (!isCustom) rangeStart.setDate(rangeStart.getDate() - (chartDays - 1))
      rangeStart.setHours(0, 0, 0, 0)
      const rangeEnd = isCustom ? new Date(endDate) : new Date()
      rangeEnd.setHours(23, 59, 59, 999)
      const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const cappedDays = Math.min(totalDays, 60) // cap chart points for readability
      // If range > 60 days, group into weeks; otherwise show daily
      const groupByDays = totalDays > 60 ? 7 : 1
      for (let i = 0; i < totalDays; i += groupByDays) {
        const d = new Date(rangeStart)
        d.setDate(d.getDate() + i)
        d.setHours(0, 0, 0, 0)
        const nextD = new Date(d)
        nextD.setDate(nextD.getDate() + groupByDays)
        if (nextD > rangeEnd) nextD.setTime(rangeEnd.getTime())

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
      openRegister,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 })
  }
}
