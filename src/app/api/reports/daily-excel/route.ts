import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'

// GET /api/reports/daily-excel?date=2026-09-01
export async function GET(request: NextRequest) {
  try {
    const dateParam = request.nextUrl.searchParams.get('date')
    const tz = 'America/Caracas'

    // Calculate date range in Caracas timezone
    let targetDate: Date
    if (dateParam) {
      const [y, m, d] = dateParam.split('-').map(Number)
      targetDate = new Date(y, m - 1, d)
    } else {
      // Default: yesterday in Caracas
      const now = new Date()
      const caracasStr = now.toLocaleString('en-US', { timeZone: tz })
      const caracasNow = new Date(caracasStr)
      caracasNow.setDate(caracasNow.getDate() - 1)
      targetDate = caracasNow
    }

    const y = targetDate.getFullYear()
    const m = targetDate.getMonth()
    const d = targetDate.getDate()

    // Day boundaries in UTC (Caracas is UTC-4)
    const from = new Date(Date.UTC(y, m, d, 4, 0, 0))  // 00:00 Caracas = 04:00 UTC
    const to = new Date(Date.UTC(y, m, d + 1, 4, 0, 0))   // next day 00:00 Caracas

    // ── Query sales with payments ──
    const sales = await db.sale.findMany({
      where: {
        date: { gte: from, lt: to },
        status: 'completada',
      },
      include: {
        client: { select: { name: true } },
        branch: { select: { name: true } },
        user: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
        payments: { include: { currency: { select: { code: true, symbol: true } } } },
        lines: { include: { product: { select: { name: true } } } },
      },
      orderBy: { date: 'asc' },
    })

    // ── Query account receivables (credits) created from those sales ──
    const receivables = await db.accountReceivable.findMany({
      where: {
        sale: { date: { gte: from, lt: to }, status: 'completada' },
      },
      include: {
        client: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
        sale: { select: { date: true, total: true } },
      },
      orderBy: { id: 'asc' },
    })

    // ── Build workbook ──
    const wb = new ExcelJS.Workbook()
    const fmtDate = `${d.toString().padStart(2, '0')}-${(m + 1).toString().padStart(2, '0')}-${y}`

    // ── Sheet 1: Ventas ──
    const wsSales = wb.addWorksheet(`Ventas ${fmtDate}`)
    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4F46E5' } }
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    const moneyFmt = '#,##0.00'

    wsSales.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Hora', key: 'time', width: 10 },
      { header: 'Sucursal', key: 'branch', width: 18 },
      { header: 'Cajero', key: 'user', width: 20 },
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Método de Pago', key: 'method', width: 20 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Total Venta', key: 'total', width: 16 },
      { header: 'Productos', key: 'products', width: 40 },
    ]

    // Style header row
    const hr1 = wsSales.getRow(1)
    hr1.fill = headerFill
    hr1.font = headerFont
    hr1.alignment = { horizontal: 'center', vertical: 'middle' }
    hr1.height = 25

    let salesTotal = 0
    sales.forEach((s, i) => {
      const row = wsSales.addRow({
        num: i + 1,
        time: s.date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
        branch: s.branch?.name || '-',
        user: s.user?.name || '-',
        client: s.client?.name || 'Consumidor final',
        method: s.payments.map(p => p.method).join(', ') || '-',
        currency: s.currency ? `${s.currency.symbol} (${s.currency.code})` : '-',
        total: s.total,
        products: s.lines.map(l => `${l.product.name} x${l.quantity}`).join(', '),
      })
      row.getCell('total').numFmt = moneyFmt
      row.getCell('total').alignment = { horizontal: 'right' }
      salesTotal += s.total
    })

    // Totals row
    const totalRow = wsSales.addRow({})
    totalRow.getCell('client').value = `TOTAL: ${sales.length} ventas`
    totalRow.getCell('client').font = { bold: true, size: 11 }
    totalRow.getCell('total').value = salesTotal
    totalRow.getCell('total').numFmt = moneyFmt
    totalRow.getCell('total').font = { bold: true, size: 12 }
    totalRow.getCell('total').alignment = { horizontal: 'right' }

    // ── Sheet 2: Créditos (Cuentas por Cobrar) ──
    const wsCredit = wb.addWorksheet(`Créditos ${fmtDate}`)

    wsCredit.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Monto Venta', key: 'saleTotal', width: 16 },
      { header: 'Monto Crédito', key: 'amount', width: 16 },
      { header: 'Saldo Pendiente', key: 'pending', width: 16 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Fecha Venta', key: 'saleDate', width: 16 },
    ]

    const hr2 = wsCredit.getRow(1)
    hr2.fill = headerFill
    hr2.font = headerFont
    hr2.alignment = { horizontal: 'center', vertical: 'middle' }
    hr2.height = 25

    let creditTotal = 0
    let pendingTotal = 0
    receivables.forEach((ar, i) => {
      const row = wsCredit.addRow({
        num: i + 1,
        client: ar.client?.name || '-',
        saleTotal: ar.sale.total,
        amount: ar.amount,
        pending: ar.pendingBalance,
        status: ar.status,
        currency: ar.currency ? `${ar.currency.symbol} (${ar.currency.code})` : '-',
        saleDate: ar.sale.date.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }),
      })
      row.getCell('saleTotal').numFmt = moneyFmt
      row.getCell('amount').numFmt = moneyFmt
      row.getCell('pending').numFmt = moneyFmt
      row.getCell('saleTotal').alignment = { horizontal: 'right' }
      row.getCell('amount').alignment = { horizontal: 'right' }
      row.getCell('pending').alignment = { horizontal: 'right' }
      creditTotal += ar.amount
      pendingTotal += ar.pendingBalance
    })

    if (receivables.length > 0) {
      const ctRow = wsCredit.addRow({})
      ctRow.getCell('client').value = `TOTAL: ${receivables.length} créditos`
      ctRow.getCell('client').font = { bold: true }
      ctRow.getCell('amount').value = creditTotal
      ctRow.getCell('amount').numFmt = moneyFmt
      ctRow.getCell('amount').font = { bold: true }
      ctRow.getCell('amount').alignment = { horizontal: 'right' }
      ctRow.getCell('pending').value = pendingTotal
      ctRow.getCell('pending').numFmt = moneyFmt
      ctRow.getCell('pending').font = { bold: true }
      ctRow.getCell('pending').alignment = { horizontal: 'right' }
    }

    // ── Return file ──
    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte_${fmtDate.replace(/\//g, '-')}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/daily-excel]', error)
    return NextResponse.json({ error: 'Error generando reporte' }, { status: 500 })
  }
}
