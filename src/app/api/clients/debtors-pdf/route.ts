import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const settings = await db.settings.findFirst()
    const exRate = settings?.exchangeRate || 0
    const businessName = settings?.businessName || 'Mi Negocio'

    const [refCur, localCur] = await Promise.all([
      settings?.referenceCurrencyId
        ? db.currency.findUnique({ where: { id: settings.referenceCurrencyId }, select: { code: true, symbol: true } })
        : null,
      settings?.baseCurrencyId
        ? db.currency.findUnique({ where: { id: settings.baseCurrencyId }, select: { code: true, symbol: true } })
        : null,
    ])

    const refCode = refCur?.code || 'USD'
    const refSymbol = refCur?.symbol || '$'
    const localCode = localCur?.code || 'VES'
    const localSymbol = localCur?.symbol || 'Bs'

    // Fetch ALL clients with pending receivables
    const clients = await db.client.findMany({
      where: { deletedAt: null },
      include: {
        receivables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: {
            pendingBalance: true,
            currencyId: true,
            currency: { select: { code: true } },
            sale: {
              select: {
                lines: {
                  select: {
                    currencyCode: true,
                    product: { select: { currencyId: true, currency: { select: { code: true } } } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute per-currency balance for each debtor
    interface DebtorRow {
      name: string
      phone: string | null
      balanceByCurrency: Record<string, number>
    }

    const debtors: DebtorRow[] = []
    const grandTotals: Record<string, number> = {}

    for (const client of clients) {
      const balanceByCurrency: Record<string, number> = {}

      for (const r of client.receivables) {
        if (r.pendingBalance <= 0) continue

        const recvCode = r.currency?.code || ''
        const lines = (r as any).sale?.lines || []

        const hasMatchingLine = lines.some(
          (l: { currencyCode?: string; product?: { currency?: { code: string } } }) =>
            l.currencyCode === recvCode || l.product?.currency?.code === recvCode
        )

        if (hasMatchingLine) {
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        } else if (recvCode === refCode && exRate > 0) {
          const inLocal = Math.round(r.pendingBalance * exRate * 100) / 100
          balanceByCurrency[localCode] = (balanceByCurrency[localCode] || 0) + inLocal
        } else if (recvCode) {
          balanceByCurrency[recvCode] = (balanceByCurrency[recvCode] || 0) + r.pendingBalance
        } else {
          balanceByCurrency[localCode] = (balanceByCurrency[localCode] || 0) + r.pendingBalance
        }
      }

      // Round
      for (const code of Object.keys(balanceByCurrency)) {
        balanceByCurrency[code] = Math.round(balanceByCurrency[code] * 100) / 100
      }

      // Only include clients with actual debt
      const totalDebt = Object.values(balanceByCurrency).reduce((s, a) => s + a, 0)
      if (totalDebt <= 0) continue

      debtors.push({
        name: client.name,
        phone: client.phone,
        balanceByCurrency,
      })

      // Accumulate grand totals
      for (const [code, amt] of Object.entries(balanceByCurrency)) {
        grandTotals[code] = (grandTotals[code] || 0) + amt
      }
    }

    // Round grand totals
    for (const code of Object.keys(grandTotals)) {
      grandTotals[code] = Math.round(grandTotals[code] * 100) / 100
    }

    // Generate PDF using jsPDF
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // Helper: get currency symbol
    const getSym = (code: string) => {
      if (code === localCode) return localSymbol
      if (code === refCode) return refSymbol
      return code
    }

    // Collect all currency codes present
    const allCodes = new Set<string>()
    for (const d of debtors) {
      for (const code of Object.keys(d.balanceByCurrency)) {
        allCodes.add(code)
      }
    }
    const currencyCols = [...allCodes]

    // Title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(businessName, 105, 20, { align: 'center' })

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text('Reporte de Clientes Deudores', 105, 28, { align: 'center' })

    const now = new Date()
    const dateStr = now.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    doc.setFontSize(9)
    doc.text(`Fecha: ${dateStr}  |  Total deudores: ${debtors.length}`, 105, 35, { align: 'center' })

    // Build table
    const head = [['#', 'Cliente', 'Telefono', ...currencyCols.map(c => `Deuda (${getSym(c)})']]]

    const body = debtors.map((d, i) => {
      const row: (string | number)[] = [
        i + 1,
        d.name,
        d.phone || '-',
        ...currencyCols.map(c => (d.balanceByCurrency[c] || 0).toFixed(2)),
      ]
      return row
    })

    // Totals row
    const totalsRow: (string | number)[] = [
      '',
      { content: 'TOTAL', styles: { fontStyle: 'bold' } } as any,
      '',
      ...currencyCols.map(c => ({
        content: grandTotals[c] ? grandTotals[c].toFixed(2) : '0.00',
        styles: { fontStyle: 'bold' },
      } as any)),
    ]

    autoTable(doc, {
      startY: 42,
      head,
      body: [...body, totalsRow],
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8.5,
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        2: { cellWidth: 28 },
        ...Object.fromEntries(
          currencyCols.map((_, idx) => [idx + 3, { halign: 'right', cellWidth: 30 }])
        ),
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
      didDrawPage: (data) => {
        // Footer on each page
        const pageCount = doc.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(
          `Pagina ${pageCount} de ${doc.getNumberOfPages()}`,
          105,
          doc.internal.pageSize.height - 8,
          { align: 'center' }
        )
        doc.setTextColor(0)
      },
    })

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="clientes_deudores_${dateStr.replace(/\//g, '-')}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[debtors-pdf] Error:', error)
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 })
  }
}