import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Prisma } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleDetail {
  id: string
  date: Date
  clientName: string | null
  total: number
  lines: {
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }[]
  payments: {
    method: string
    amount: number
    currencyCode: string
    reference: string | null
  }[]
}

export interface CashCloseReport {
  businessName: string
  businessRif: string
  businessAddress: string
  businessPhone: string
  registerId: string
  registerName: string | null
  branchName: string
  cashierName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  totalSales: number
  totalExpenses: number
  totalEntries: number
  totalRetiros: number
  expected: number
  actual: number
  difference: number
  sales: SaleDetail[]
  expenses: { concept: string; amount: number; date: Date }[]
  entries: { concept: string; amount: number; date: Date }[]
  exchangeRate: number
  referenceCurrency: string
  ivaEnabled: boolean
  ivaRate: number
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  primary: [30, 64, 175] as [number, number, number],
  primaryLight: [59, 130, 246] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  amber: [180, 83, 9] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  grayLight: [243, 244, 246] as [number, number, number],
  grayMedium: [229, 231, 235] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  blueBg: [224, 231, 255] as [number, number, number],
  yellowBg: [255, 251, 235] as [number, number, number],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(n: unknown): number {
  return (n == null || isNaN(n as number)) ? 0 : (n as number)
}

function fmt(amount: number, decimals = 2): string {
  return safeNum(amount).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtDate(d: Date): string {
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtDateShort(d: Date): string {
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cs(refCurrency: string): string {
  return refCurrency === 'EUR' ? '\u20ac' : '$'
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

/**
 * Draws the clean header bar: "Cierre de Caja" title on a blue background.
 * No logos, no images, no business info band.
 */
function drawHeader(doc: jsPDF): number {
  const pw = doc.internal.pageSize.getWidth()

  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 40, 'F')

  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('Cierre de Caja', pw / 2, 27, { align: 'center' })

  return 52 // y position after header
}

/**
 * Info card: Cajero, Caja, Sucursal, Apertura, Cierre
 */
function drawInfoCard(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const pw = doc.internal.pageSize.getWidth()
  const margin = 36
  const cardW = pw - margin * 2
  let y = startY

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    body: [
      [
        { content: 'Cajero:', styles: { fontStyle: 'bold', textColor: C.gray, cellPadding: 5 } },
        { content: report.cashierName, styles: { textColor: C.dark, cellPadding: 5 } },
        { content: 'Sucursal:', styles: { fontStyle: 'bold', textColor: C.gray, cellPadding: 5 } },
        { content: report.branchName, styles: { textColor: C.dark, cellPadding: 5 } },
      ],
      [
        { content: 'Caja:', styles: { fontStyle: 'bold', textColor: C.gray, cellPadding: 5 } },
        { content: report.registerName || 'Sin nombre', styles: { textColor: C.dark, cellPadding: 5 } },
        { content: 'Cierre:', styles: { fontStyle: 'bold', textColor: C.gray, cellPadding: 5 } },
        { content: fmtDate(report.closingDate), styles: { textColor: C.dark, cellPadding: 5 } },
      ],
    ],
    styles: {
      fillColor: [248, 250, 252],
      lineWidth: 0.3,
      lineColor: C.grayMedium,
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: '35%' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: '35%' },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 14
}

/**
 * Financial summary: clean table with all breakdown rows + total en caja + Bs conversion
 */
function drawFinancialSummary(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const symbol = cs(report.referenceCurrency)
  let y = startY

  // Section title
  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen Financiero', 36, y)
  y += 4

  // Build rows
  const summaryBody: any[][] = [
    [
      { content: 'Monto Inicial', styles: { textColor: C.dark, cellPadding: { top: 6, bottom: 6 } } },
      { content: `${symbol}${fmt(report.initialAmt)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.dark, cellPadding: { top: 6, bottom: 6 } } },
    ],
    [
      { content: '+ Total Ventas (efectivo)', styles: { textColor: C.green, cellPadding: { top: 4, bottom: 4 } } },
      { content: `+${symbol}${fmt(report.totalSales)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 4, bottom: 4 } } },
    ],
  ]

  // IVA row
  if (report.ivaEnabled && report.ivaRate > 0) {
    const ivaAmount = report.totalSales * (report.ivaRate / 100)
    summaryBody.push([
      { content: `+ I.V.A. Recaudado (${report.ivaRate}%)`, styles: { textColor: C.primaryLight, cellPadding: { top: 4, bottom: 4 } } },
      { content: `+${symbol}${fmt(ivaAmount)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.primaryLight, cellPadding: { top: 4, bottom: 4 } } },
    ])
  }

  // Expenses
  if (report.totalExpenses > 0) {
    summaryBody.push([
      { content: '- Total Gastos', styles: { textColor: C.red, cellPadding: { top: 4, bottom: 4 } } },
      { content: `-${symbol}${fmt(report.totalExpenses)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 4, bottom: 4 } } },
    ])
  }

  // Entries
  if (report.totalEntries > 0) {
    summaryBody.push([
      { content: '+ Entradas de Efectivo', styles: { textColor: C.green, cellPadding: { top: 4, bottom: 4 } } },
      { content: `+${symbol}${fmt(report.totalEntries)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 4, bottom: 4 } } },
    ])
  }

  // Retiros
  if (report.totalRetiros > 0) {
    summaryBody.push([
      { content: '- Retiros de Excedente', styles: { textColor: C.red, cellPadding: { top: 4, bottom: 4 } } },
      { content: `-${symbol}${fmt(report.totalRetiros)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 4, bottom: 4 } } },
    ])
  }

  // Separator + Total en Caja
  summaryBody.push([
    { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
    { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
  ])
  summaryBody.push([
    { content: 'Total en Caja', styles: { fontStyle: 'bold', textColor: C.dark, cellPadding: { top: 8, bottom: 8 } } },
    { content: `${symbol}${fmt(report.actual)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.primary, fontSize: 11, cellPadding: { top: 8, bottom: 8 } } },
  ])

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    margin: { left: 36, right: 36 },
    body: summaryBody,
    columnStyles: {
      0: { cellWidth: '70%' },
      1: { cellWidth: '30%' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIdx = data.row.index
        // Separator row - draw a line via top/bottom border
        if (summaryBody[rowIdx][0].content === '') {
          data.cell.styles.cellPadding = { top: 0, bottom: 0, left: 0, right: 0 }
          data.cell.styles.lineWidth = 0.5
          data.cell.styles.lineColor = C.grayMedium
          data.cell.styles.borders = { top: { width: 0.5, color: C.grayMedium }, bottom: { width: 0.5, color: C.grayMedium }, left: { width: 0 }, right: { width: 0 } }
        }
        // Total row highlight
        if (rowIdx === summaryBody.length - 1) {
          data.cell.styles.fillColor = C.blueBg
        }
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  // Exchange rate + Bs conversion
  if (report.exchangeRate > 0) {
    const totalBs = report.actual * report.exchangeRate
    const pw = doc.internal.pageSize.getWidth()

    // Exchange rate info
    doc.setFontSize(8)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')
    doc.text(`Tasa de cambio: 1 ${report.referenceCurrency} = ${fmt(report.exchangeRate)} Bs  |  Total en caja: ${fmt(totalBs, 2)} Bs`, pw / 2, y + 6, { align: 'center' })

    y += 18
  }

  return y
}

function drawPaymentMethods(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const symbol = cs(report.referenceCurrency)
  const paymentMap = new Map<string, { amount: number; count: number }>()
  let totalAllPayments = 0

  for (const sale of report.sales) {
    for (const p of sale.payments) {
      const key = p.method
      const current = paymentMap.get(key) || { amount: 0, count: 0 }
      current.amount += p.amount
      current.count++
      paymentMap.set(key, current)
      totalAllPayments += p.amount
    }
  }

  if (paymentMap.size === 0) return startY

  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Desglose por Metodo de Pago', 36, y)
  y += 4

  const bodyRows = Array.from(paymentMap.entries()).map(([method, data]) => [
    method.charAt(0).toUpperCase() + method.slice(1),
    String(data.count),
    `${symbol}${fmt(data.amount)}`,
  ])

  bodyRows.push(['TOTAL', String(bodyRows.reduce((s, r) => s + parseInt(r[1]), 0)), `${symbol}${fmt(totalAllPayments)}`])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 36, right: 36 },
    head: [['Metodo', 'Cantidad', 'Monto Total']],
    body: bodyRows,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'normal' },
      1: { halign: 'center' },
      2: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = C.blueBg
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C.primary
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8
}

function drawExpenses(doc: jsPDF, report: CashCloseReport, startY: number, type: 'salida' | 'entrada'): number {
  const items = type === 'salida' ? report.expenses : report.entries
  const symbol = cs(report.referenceCurrency)
  const title = type === 'salida' ? 'Gastos y Salidas' : 'Entradas de Efectivo'
  const color = type === 'salida' ? C.red : C.green
  const prefix = type === 'salida' ? '-' : '+'

  if (items.length === 0) return startY

  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...color)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 36, y)
  y += 4

  const bodyRows = items.map(exp => [
    exp.concept,
    fmtDateShort(exp.date),
    `${prefix}${symbol}${fmt(exp.amount)}`,
  ])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 36, right: 36 },
    head: [['Concepto', 'Fecha', 'Monto']],
    body: bodyRows,
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: color,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: C.dark },
      1: { halign: 'right', textColor: C.gray, fontSize: 7 },
      2: { halign: 'right', fontStyle: 'bold', textColor: color },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8
}

function drawSalesDetail(doc: jsPDF, report: CashCloseReport, startY: number): number {
  if (report.sales.length === 0) return startY

  const symbol = cs(report.referenceCurrency)
  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text(`Detalle de Ventas (${report.sales.length} venta${report.sales.length !== 1 ? 's' : ''})`, 36, y)
  y += 6

  for (let si = 0; si < report.sales.length; si++) {
    const sale = report.sales[si]

    doc.setFillColor(...C.blueBg)
    doc.rect(36, y, doc.internal.pageSize.getWidth() - 72, 16, 'F')
    doc.setFontSize(8)
    doc.setTextColor(...C.primary)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `Venta #${si + 1}  |  ${fmtDate(sale.date)}  |  Cliente: ${sale.clientName || 'General'}`,
      42, y + 11
    )
    y += 20

    const linesBody = sale.lines.map(l => [
      l.productName,
      String(l.quantity),
      `${symbol}${fmt(l.unitPrice)}`,
      `${symbol}${fmt(l.lineTotal)}`,
    ])

    // Total row
    linesBody.push(['', '', 'TOTAL:', `${symbol}${fmt(sale.total)}`])

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      margin: { left: 36, right: 36 },
      head: [['Producto', 'Cant.', 'P. Unit.', 'Total']],
      body: linesBody,
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: C.grayLight,
        textColor: C.gray,
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { textColor: C.dark, cellWidth: 'auto', overflow: 'linebreak' },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', fontStyle: 'bold', textColor: C.primary },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === linesBody.length - 1) {
          data.cell.styles.fillColor = [240, 245, 255]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6

    // Payment methods for this sale
    if (sale.payments.length > 0) {
      doc.setFontSize(6.5)
      doc.setTextColor(...C.gray)
      doc.setFont('helvetica', 'normal')
      const payStr = sale.payments.map(p =>
        `${p.method} ${symbol}${fmt(p.amount)}${p.reference ? ` (Ref: ${p.reference})` : ''}`
      ).join('  |  ')
      doc.text(payStr, 42, y, { maxWidth: doc.internal.pageSize.getWidth() - 84 })
      y += 10
    }

    y += 4
  }

  return y
}

function drawFooter(doc: jsPDF, totalPages: number, info: { businessName: string; businessRif: string }) {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    doc.setDrawColor(...C.grayMedium)
    doc.setLineWidth(0.5)
    doc.line(36, ph - 40, pw - 36, ph - 40)

    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${info.businessName}  |  RIF: ${info.businessRif}  |  Generado por JO-Administrativo`,
      pw / 2, ph - 32, { align: 'center' }
    )

    if (totalPages > 1) {
      doc.text(`Pagina ${i} de ${totalPages}`, pw / 2, ph - 24, { align: 'center' })
    }
  }
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

export async function generateCashClosePDF(report: CashCloseReport): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  doc.setProperties({
    title: `Cierre de Caja - ${report.registerName || 'Sin nombre'} - ${fmtDateShort(report.closingDate)}`,
    author: report.businessName,
    subject: 'Reporte de cierre de caja',
  })

  // Clean header (no logo, no business info band)
  let y = drawHeader(doc)

  // Info card
  y = drawInfoCard(doc, report, y)

  // Financial summary with full breakdown
  y = drawFinancialSummary(doc, report, y)

  // Payment methods
  y = drawPaymentMethods(doc, report, y)

  // Expenses
  y = drawExpenses(doc, report, y, 'salida')

  // Entries
  y = drawExpenses(doc, report, y, 'entrada')

  // Sales detail
  y = drawSalesDetail(doc, report, y)

  // Footer
  const totalPages = doc.getNumberOfPages()
  drawFooter(doc, totalPages, { businessName: report.businessName, businessRif: report.businessRif })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Multi-register PDF (for close-all) ───────────────────────────────────────

export async function generateMultiCashClosePDF(reports: CashCloseReport[]): Promise<Buffer> {
  if (reports.length === 1) {
    return generateCashClosePDF(reports[0])
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  doc.setProperties({
    title: `Cierre Masivo de Cajas - ${fmtDateShort(new Date())}`,
    author: reports[0]?.businessName || 'JO-Administrativo',
    subject: 'Reporte de cierre masivo de cajas',
  })

  const info = reports[0]
  const symbol = cs(info?.referenceCurrency || 'USD')
  const pw = doc.internal.pageSize.getWidth()

  // ─── Cover page ──────────────────────────────────────────────────────────
  // Clean header
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 40, 'F')

  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('Cierre Masivo de Cajas', pw / 2, 27, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(...C.gray)
  doc.setFont('helvetica', 'normal')
  doc.text(`${reports.length} caja(s) cerradas  |  ${fmtDate(new Date())}`, pw / 2, 56, { align: 'center' })

  // Summary table
  let y = 70

  let grandTotalSales = 0
  let grandTotalActual = 0

  const bodyRows = reports.map(r => {
    grandTotalSales += r.totalSales
    grandTotalActual += r.actual
    return [
      r.cashierName,
      r.registerName || '\u2014',
      `${symbol}${fmt(r.totalSales)}`,
      `${symbol}${fmt(r.actual)}`,
    ]
  })

  bodyRows.push([
    'TOTAL GENERAL',
    '',
    `${symbol}${fmt(grandTotalSales)}`,
    `${symbol}${fmt(grandTotalActual)}`,
  ])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 36, right: 36 },
    head: [['Cajero/a', 'Caja', 'Ventas', 'Total en Caja']],
    body: bodyRows,
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = C.blueBg
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C.primary
      }
    },
  })

  // ─── Individual reports ──────────────────────────────────────────────────
  for (let i = 0; i < reports.length; i++) {
    doc.addPage()
    const r = reports[i]

    // Compact header
    doc.setFillColor(...C.primary)
    doc.rect(0, 0, pw, 30, 'F')

    doc.setFontSize(12)
    doc.setTextColor(...C.white)
    doc.setFont('helvetica', 'bold')
    doc.text(`Caja ${i + 1}: ${r.registerName || 'Sin nombre'}  |  ${r.branchName}  |  Cajero: ${r.cashierName}`, 36, 21)

    // Financial summary compact
    const sym = cs(r.referenceCurrency)
    y = 40

    const summaryBody: any[][] = [
      [
        { content: 'Monto Inicial', styles: { textColor: C.dark, cellPadding: { top: 5, bottom: 5 } } },
        { content: `${sym}${fmt(r.initialAmt)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.dark, cellPadding: { top: 5, bottom: 5 } } },
      ],
      [
        { content: '+ Total Ventas (efectivo)', styles: { textColor: C.green, cellPadding: { top: 3, bottom: 3 } } },
        { content: `+${sym}${fmt(r.totalSales)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 3, bottom: 3 } } },
      ],
    ]

    if (r.ivaEnabled && r.ivaRate > 0) {
      const ivaAmount = r.totalSales * (r.ivaRate / 100)
      summaryBody.push([
        { content: `+ I.V.A. Recaudado (${r.ivaRate}%)`, styles: { textColor: C.primaryLight, cellPadding: { top: 3, bottom: 3 } } },
        { content: `+${sym}${fmt(ivaAmount)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.primaryLight, cellPadding: { top: 3, bottom: 3 } } },
      ])
    }

    if (r.totalExpenses > 0) {
      summaryBody.push([
        { content: '- Total Gastos', styles: { textColor: C.red, cellPadding: { top: 3, bottom: 3 } } },
        { content: `-${sym}${fmt(r.totalExpenses)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 3, bottom: 3 } } },
      ])
    }

    if (r.totalEntries > 0 || r.totalRetiros > 0) {
      summaryBody.push([
        { content: `Entradas / Retiros`, styles: { textColor: C.gray, cellPadding: { top: 3, bottom: 3 } } },
        { content: `${r.totalEntries > 0 ? `+${sym}${fmt(r.totalEntries)}` : ''} ${r.totalRetiros > 0 ? `/ -${sym}${fmt(r.totalRetiros)}` : ''}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.gray, cellPadding: { top: 3, bottom: 3 } } },
      ])
    }

    summaryBody.push([
      { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
      { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
    ])
    summaryBody.push([
      { content: 'Total en Caja', styles: { fontStyle: 'bold', textColor: C.dark, cellPadding: { top: 6, bottom: 6 } } },
      { content: `${sym}${fmt(r.actual)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.primary, fontSize: 10, cellPadding: { top: 6, bottom: 6 } } },
    ])

    autoTable(doc, {
      startY: y,
      theme: 'plain',
      margin: { left: 36, right: 36 },
      body: summaryBody,
      columnStyles: {
        0: { cellWidth: '70%' },
        1: { cellWidth: '30%' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowIdx = data.row.index
          if (summaryBody[rowIdx][0].content === '') {
            data.cell.styles.cellPadding = { top: 0, bottom: 0, left: 0, right: 0 }
            data.cell.styles.lineWidth = 0.5
            data.cell.styles.lineColor = C.grayMedium
            data.cell.styles.borders = { top: { width: 0.5, color: C.grayMedium }, bottom: { width: 0.5, color: C.grayMedium }, left: { width: 0 }, right: { width: 0 } }
          }
          if (rowIdx === summaryBody.length - 1) {
            data.cell.styles.fillColor = C.blueBg
          }
        }
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6

    // Bs conversion
    if (r.exchangeRate > 0) {
      const totalBs = r.actual * r.exchangeRate
      doc.setFontSize(8)
      doc.setTextColor(...C.gray)
      doc.setFont('helvetica', 'normal')
      doc.text(`Tasa: 1 ${r.referenceCurrency} = ${fmt(r.exchangeRate)} Bs  |  Total: ${fmt(totalBs, 2)} Bs`, pw / 2, y, { align: 'center' })
      y += 14
    }

    // Payment methods
    y = drawPaymentMethods(doc, r, y)

    // Sales detail
    y = drawSalesDetail(doc, r, y)
  }

  // Footer
  const totalPages = doc.getNumberOfPages()
  drawFooter(doc, totalPages, { businessName: info.businessName, businessRif: info.businessRif })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Data builder ─────────────────────────────────────────────────────────────

export interface RegisterWithDetails {
  id: string
  name: string | null
  userId: string
  branchId: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  currentAmt: number
  status: string
  user: { id: string; name: string; email: string }
  branch: { id: string; name: string }
  sales: {
    id: string
    date: Date
    total: number
    status: string
    clientId: string | null
    client?: { id: string; name: string } | null
    payments: {
      id: string
      method: string
      amount: number
      currencyId: string
      reference: string | null
      currency: { id: string; code: string; name: string }
    }[]
    lines: {
      id: string
      quantity: number
      unitPrice: number
      unitCost: number
      lineTotal: number
      lineProfit: number
      product: { id: string; name: string }
    }[]
  }[]
  movements: {
    id: string
    type: string
    amount: number
    concept: string
    createdAt: Date
  }[]
}

export async function buildReportFromRegister(
  register: RegisterWithDetails,
  closingDate: Date,
  actual: number,
  expected: number,
  difference: number,
  totalSales: number,
  totalExpenses: number,
  totalEntries: number,
  totalRetiros: number,
  businessName: string,
  businessRif: string,
  businessAddress: string,
  businessPhone: string,
  exchangeRate: number,
  referenceCurrency: string,
  ivaEnabled: boolean,
  ivaRate: number,
): Promise<CashCloseReport> {
  const sales: SaleDetail[] = register.sales.map(s => ({
    id: s.id,
    date: s.date,
    clientName: s.client?.name || null,
    total: s.total,
    lines: s.lines.map(l => ({
      productName: l.product.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    payments: s.payments.map(p => ({
      method: p.method,
      amount: p.amount,
      currencyCode: p.currency.code,
      reference: p.reference,
    })),
  }))

  const expenses = register.movements
    .filter(m => m.type === 'salida')
    .map(m => ({ concept: m.concept, amount: m.amount, date: m.createdAt }))

  const entries = register.movements
    .filter(m => m.type === 'entrada')
    .map(m => ({ concept: m.concept, amount: m.amount, date: m.createdAt }))

  return {
    businessName,
    businessRif,
    businessAddress,
    businessPhone,
    registerId: register.id,
    registerName: register.name,
    branchName: register.branch.name,
    cashierName: register.user.name,
    openingDate: register.openingDate,
    closingDate,
    initialAmt: register.initialAmt,
    totalSales,
    totalExpenses,
    totalEntries,
    totalRetiros,
    expected,
    actual,
    difference,
    sales,
    expenses,
    entries,
    exchangeRate,
    referenceCurrency,
    ivaEnabled,
    ivaRate,
  }
}
