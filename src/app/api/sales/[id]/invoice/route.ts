import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params

    const [settings, sale] = await Promise.all([
      db.settings.findFirst(),
      db.sale.findUnique({
        where: { id: saleId },
        include: {
          lines: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
          client: { select: { name: true, phone: true, email: true, address: true } },
          user: { select: { name: true } },
          branch: { select: { name: true } },
          payments: {
            include: { currency: { select: { code: true, symbol: true } } },
          },
          receivables: true,
        },
      }),
    ])

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    const businessName = settings?.businessName || 'Mi Empresa'
    const rif = settings?.rif || ''
    const address = settings?.address || ''
    const phone = settings?.phone || ''
    const businessEmail = settings?.email || ''

    const hasReceivable = sale.receivables && sale.receivables.length > 0
    const receivable = hasReceivable ? sale.receivables[0] : null
    const invoiceTitle = hasReceivable ? 'NOTA DE DESPACHO' : 'FACTURA'

    const fmt = (n: number) =>
      n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    // ─── Colors ───────────────────────────────────────────────────────────
    const blueHeader: [number, number, number] = [26, 58, 107]
    const accentBlue: [number, number, number] = [37, 99, 235]
    const lightGray: [number, number, number] = [243, 244, 246]
    const darkText: [number, number, number] = [31, 41, 55]
    const mutedText: [number, number, number] = [107, 114, 128]
    const redBg: [number, number, number] = [254, 242, 242]
    const redAccent: [number, number, number] = [220, 38, 38]

    // ─── Create PDF ───────────────────────────────────────────────────────
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
    })

    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()

    // ─── Blue Header Band ─────────────────────────────────────────────────
    doc.setFillColor(...blueHeader)
    doc.rect(0, 0, pw, 110, 'F')

    // Company name
    doc.setFontSize(20)
    doc.setTextColor(...C_white)
    doc.setFont('helvetica', 'bold')
    doc.text(businessName, 40, 24)

    // Company details
    doc.setFontSize(9)
    doc.setTextColor(209, 213, 219)
    doc.setFont('helvetica', 'normal')
    let detailY = 48
    if (rif) { doc.text(`RIF: ${rif}`, 40, detailY); detailY += 14 }
    if (address) { doc.text(`Direccion: ${address}`, 40, detailY); detailY += 14 }
    if (phone) { doc.text(`Telefono: ${phone}`, 40, detailY); detailY += 14 }
    if (businessEmail) { doc.text(`Email: ${businessEmail}`, 40, detailY) }

    // Invoice number & title (right side)
    doc.setFontSize(14)
    doc.setTextColor(...C_white)
    doc.setFont('helvetica', 'bold')
    doc.text(invoiceTitle, pw - 40, 76, { align: 'right' })

    const invoiceNumber = sale.id.substring(0, 8).toUpperCase()
    doc.setFontSize(10)
    doc.setTextColor(147, 197, 253)
    doc.setFont('helvetica', 'normal')
    doc.text(`No ${invoiceNumber}`, pw - 40, 96, { align: 'right' })

    // ─── Invoice Meta Info ────────────────────────────────────────────────
    let y = 120

    // Left box: Date & Branch
    const boxH = 60
    const halfW = (pw - 90) / 2 - 5

    doc.setFillColor(...lightGray)
    doc.roundedRect(40, y, halfW, boxH, 4, 4, 'F')

    doc.setFontSize(8)
    doc.setTextColor(...mutedText)
    doc.setFont('helvetica', 'bold')
    doc.text('FECHA', 50, y + 12)

    doc.setFontSize(10)
    doc.setTextColor(...darkText)
    doc.setFont('helvetica', 'normal')
    const saleDate = sale.date
      ? new Date(sale.date).toLocaleDateString('es-VE', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      : ''
    doc.text(saleDate, 50, y + 26)

    if (sale.branch) {
      doc.setFontSize(8)
      doc.setTextColor(...mutedText)
      doc.setFont('helvetica', 'bold')
      doc.text('SUCURSAL', 50, y + 42)
      doc.setFontSize(10)
      doc.setTextColor(...darkText)
      doc.setFont('helvetica', 'normal')
      doc.text(sale.branch.name, 110, y + 42)
    }

    // Right box: Client info
    const rightX = 40 + halfW + 10
    doc.setFillColor(...lightGray)
    doc.roundedRect(rightX, y, halfW, boxH, 4, 4, 'F')

    doc.setFontSize(8)
    doc.setTextColor(...mutedText)
    doc.setFont('helvetica', 'bold')
    doc.text('CLIENTE', rightX + 10, y + 12)

    doc.setFontSize(10)
    doc.setTextColor(...darkText)
    doc.setFont('helvetica', 'normal')
    const clientName = sale.client?.name || 'Consumidor Final'
    doc.text(clientName, rightX + 10, y + 26)

    if (sale.client?.phone) {
      doc.setFontSize(8)
      doc.setTextColor(...mutedText)
      doc.text(`Tel: ${sale.client.phone}`, rightX + 10, y + 42)
    }

    if (sale.user) {
      doc.setFontSize(8)
      doc.setTextColor(...mutedText)
      doc.setFont('helvetica', 'bold')
      const cajeroLabel = `CAJERO: ${sale.user.name}`
      doc.text(cajeroLabel, rightX + 10, y + 54)
    }

    y += boxH + 8

    // Client details block
    if (sale.client) {
      const clientDetails: string[] = []
      if (sale.client.email) clientDetails.push(`Email: ${sale.client.email}`)
      if (sale.client.address) clientDetails.push(`Direccion: ${sale.client.address}`)

      if (clientDetails.length > 0) {
        doc.setFillColor(238, 242, 255)
        doc.roundedRect(40, y, pw - 80, 24, 4, 4, 'F')
        doc.setFontSize(8)
        doc.setTextColor(...accentBlue)
        doc.setFont('helvetica', 'normal')
        doc.text(clientDetails.join('  |  '), 50, y + 15, { maxWidth: pw - 100 })
        y += 30
      }
    }

    // ─── Products Table ───────────────────────────────────────────────────
    const linesBody = sale.lines.map((line, index) => [
      String(index + 1),
      line.product.name,
      line.product.sku || '-',
      String(line.quantity),
      fmt(line.unitPrice),
      fmt(line.lineTotal),
    ])

    autoTable(doc, {
      startY: y + 4,
      theme: 'grid',
      margin: { left: 40, right: 40 },
      head: [['#', 'Producto', 'SKU', 'Cantidad', 'P. Unitario', 'Total']],
      body: linesBody,
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: blueHeader,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { fontStyle: 'bold' },
        2: { cellWidth: 50, textColor: mutedText },
        3: { halign: 'right', cellWidth: 45 },
        4: { halign: 'right', cellWidth: 60 },
        5: { halign: 'right', fontStyle: 'bold', textColor: accentBlue },
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 12

    // ─── Totals Section ───────────────────────────────────────────────────
    const totalsX = 40 + (pw - 80) - 200
    const labelW = 110
    const valueW = 90

    doc.setFontSize(9)
    doc.setTextColor(...mutedText)
    doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', totalsX, y, { align: 'right' })
    doc.setTextColor(...darkText)
    doc.text(fmt(sale.total), totalsX + labelW, y, { align: 'right' })
    y += 18

    // Total line
    doc.setDrawColor(...accentBlue)
    doc.setLineWidth(1.5)
    doc.line(totalsX, y, totalsX + labelW + valueW, y)
    y += 6

    doc.setFontSize(12)
    doc.setTextColor(...accentBlue)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTAL:', totalsX, y, { align: 'right' })
    doc.setTextColor(...darkText)
    doc.text(fmt(sale.total), totalsX + labelW, y, { align: 'right' })
    y += 24

    // ─── Payment Methods ──────────────────────────────────────────────────
    if (sale.payments.length > 0) {
      if (y + 60 > ph - 80) { doc.addPage(); y = 40 }

      doc.setFillColor(...lightGray)
      doc.roundedRect(40, y, pw - 80, 18, 3, 3, 'F')
      doc.setFontSize(8)
      doc.setTextColor(...mutedText)
      doc.setFont('helvetica', 'bold')
      doc.text('FORMA DE PAGO', 50, y + 12)
      y += 24

      for (const payment of sale.payments) {
        const methodLabel = payment.method.toUpperCase()
        const amountStr = fmt(payment.amount)
        const currencyInfo = payment.currency ? `${payment.currency.symbol} ${payment.currency.code}` : ''
        const reference = payment.reference ? ` \u2014 Ref: ${payment.reference}` : ''

        doc.setFontSize(9)
        doc.setTextColor(...darkText)
        doc.setFont('helvetica', 'normal')
        doc.text(`${methodLabel}:  ${amountStr} ${currencyInfo}${reference}`, 55, y)
        y += 16
      }
      y += 6
    }

    // ─── Credit / Receivables Notice ──────────────────────────────────────
    if (hasReceivable && receivable) {
      if (y + 40 > ph - 80) { doc.addPage(); y = 40 }

      const dueDateStr = receivable.dueDate
        ? new Date(receivable.dueDate).toLocaleDateString('es-VE', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          })
        : 'No definida'
      const pendingStr = fmt(receivable.pendingBalance)

      doc.setFillColor(...redBg)
      doc.roundedRect(40, y, pw - 80, 30, 4, 4, 'F')
      doc.setFillColor(...redAccent)
      doc.rect(40, y, 4, 30, 'F')

      doc.setFontSize(9)
      doc.setTextColor(153, 27, 27)
      doc.setFont('helvetica', 'bold')
      doc.text('CREDITO', 54, y + 12)
      doc.setFontSize(8)
      doc.setTextColor(185, 28, 28)
      doc.setFont('helvetica', 'normal')
      doc.text(`Vence: ${dueDateStr}  |  Saldo pendiente: ${pendingStr}`, 54, y + 23)

      y += 38
    }

    // ─── Footer ───────────────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)

      doc.setDrawColor(209, 213, 219)
      doc.setLineWidth(0.5)
      doc.line(40, ph - 35, pw - 40, ph - 35)

      doc.setFontSize(7)
      doc.setTextColor(...mutedText)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `${businessName} \u2014 Generado el ${new Date().toLocaleDateString('es-VE')}`,
        pw / 2, ph - 22, { align: 'center' },
      )
      doc.text(
        `Factura No ${invoiceNumber}  |  Pagina ${i} de ${totalPages}`,
        pw / 2, ph - 12, { align: 'center' },
      )
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="factura_${saleId}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generando factura PDF:', error)
    return NextResponse.json(
      { error: 'Error al generar la factura' },
      { status: 500 }
    )
  }
}

// Helper constant for white color
const C_white: [number, number, number] = [255, 255, 255]
