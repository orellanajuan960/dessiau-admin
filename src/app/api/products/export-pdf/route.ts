import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db } from '@/lib/db'
import { resolveBranchId } from '@/lib/resolve-branch'

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  primary: [30, 64, 175] as [number, number, number],
  primaryLight: [59, 130, 246] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  grayLight: [243, 244, 246] as [number, number, number],
  grayMedium: [229, 231, 235] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, decimals = 2): string {
  return amount.toLocaleString('es-VE', {
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
  })
}

function fmtStock(stock: number): string {
  return stock % 1 === 0 ? String(Math.round(stock)) : fmt(stock, 2)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  name: string
  sku: string | null
  categoryName: string
  price: number
  currencySymbol: string
  stock: number
  noStock: boolean
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

function generateProductsPDF(
  products: ProductRow[],
  companyInfo: {
    businessName: string
    rif: string
    address: string
    phone: string
  },
): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  doc.setProperties({
    title: 'Listado de Productos',
    author: companyInfo.businessName || 'JO-Administrativo',
    subject: 'Reporte de listado de productos',
  })

  const pw = doc.internal.pageSize.getWidth()

  // ─── Header band ────────────────────────────────────────────────────────
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 80, 'F')

  doc.setFontSize(18)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text(companyInfo.businessName || 'JO-Administrativo', 45, 30)

  doc.setFontSize(9)
  doc.setTextColor(209, 213, 219)
  doc.setFont('helvetica', 'normal')

  const rifLine = companyInfo.rif ? `RIF: ${companyInfo.rif}` : ''
  const addressLine = companyInfo.address || ''
  const phoneLine = companyInfo.phone ? `Tel: ${companyInfo.phone}` : ''
  const parts = [rifLine, addressLine, phoneLine].filter(Boolean).join('  |  ')
  if (parts) {
    doc.text(parts, 45, 46)
  }

  doc.setFontSize(14)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('LISTADO DE PRODUCTOS', pw - 45, 68, { align: 'right' })

  // ─── Date ───────────────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setTextColor(...C.gray)
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha de generacion: ${fmtDate(new Date())}`, 45, 96)

  // ─── Summary ────────────────────────────────────────────────────────────
  const totalProducts = products.length
  const totalWithStock = products.filter(p => !p.noStock).length
  const totalNoStock = products.filter(p => p.noStock).length

  doc.setFillColor(240, 245, 255)
  doc.setDrawColor(...C.primaryLight)
  doc.roundedRect(45, 106, pw - 90, 44, 3, 3, 'FD')

  doc.setFontSize(10)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen', 55, 120)

  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.setFont('helvetica', 'normal')
  doc.text(`Total Productos: ${totalProducts}`, 55, 136)
  doc.text(`Con Stock: ${totalWithStock}`, 55 + (pw - 90) * 0.35, 136)
  doc.text(`Sin Stock: ${totalNoStock}`, 55 + (pw - 90) * 0.6, 136)

  const inStockPercent = totalProducts > 0 ? ((totalWithStock / totalProducts) * 100).toFixed(1) : '0.0'
  const noStockPercent = totalProducts > 0 ? ((totalNoStock / totalProducts) * 100).toFixed(1) : '0.0'
  doc.setFontSize(8)
  doc.setTextColor(...C.gray)
  doc.text(`(${inStockPercent}%)`, 55 + (pw - 90) * 0.35 + 70, 137)
  doc.text(`(${noStockPercent}%)`, 55 + (pw - 90) * 0.6 + 55, 137)

  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text('Productos activos en inventario', 55, 146)

  // ─── Table ──────────────────────────────────────────────────────────────
  const bodyRows = products.map((p, i) => [
    String(i + 1),
    p.name,
    p.sku || '\u2014',
    p.categoryName || '\u2014',
    `${p.currencySymbol} ${fmt(p.price)}`,
    fmtStock(p.stock),
    p.noStock ? '\u2717' : '\u2713',
  ])

  autoTable(doc, {
    startY: 158,
    theme: 'grid',
    margin: { left: 45, right: 45 },
    head: [['#', 'Producto', 'SKU', 'Categoria', 'Precio', 'Stock', 'Sin Stock']],
    body: bodyRows.length > 0 ? bodyRows : [['No se encontraron productos con los filtros seleccionados.']],
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 25, textColor: C.gray },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 55, textColor: C.gray },
      3: { cellWidth: 80 },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'center', fontStyle: 'bold' },
      6: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && bodyRows.length > 0) {
        // Color stock column
        if (data.column.index === 5) {
          data.cell.styles.textColor = products[data.row.index]?.noStock ? C.red : C.green
        }
        // Color sin stock column
        if (data.column.index === 6) {
          data.cell.styles.textColor = products[data.row.index]?.noStock ? C.red : C.green
          data.cell.styles.fontSize = 9
        }
      }
    },
  })

  // ─── Footer ─────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  const ph = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    doc.setDrawColor(...C.grayMedium)
    doc.setLineWidth(0.5)
    doc.line(45, ph - 40, pw - 45, ph - 40)

    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')

    const footerCompany = companyInfo.businessName || 'JO-Administrativo'
    const footerRif = companyInfo.rif ? `  |  RIF: ${companyInfo.rif}` : ''
    doc.text(
      `${footerCompany}${footerRif}  |  Generado por JO-Administrativo`,
      pw / 2, ph - 32, { align: 'center' },
    )

    if (totalPages > 1) {
      doc.text(
        `Pagina ${i} de ${totalPages}`,
        pw / 2, ph - 24, { align: 'center' },
      )
    }
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryBranchId = searchParams.get('branchId')
    const activeParam = searchParams.get('active') ?? 'true'
    const categoryId = searchParams.get('categoryId') || ''

    // Build where clause
    const where: Record<string, unknown> = {}
    if (activeParam === 'true') {
      where.active = true
    } else if (activeParam === 'false') {
      where.active = false
    }
    if (categoryId) {
      where.categoryId = categoryId
    }

    // Resolve branch
    const branchId = queryBranchId || await resolveBranchId(request)

    // Fetch products
    const products = await db.product.findMany({
      where,
      include: {
        currency: true,
        category: true,
        inventories: { where: { branchId } },
      },
      orderBy: { name: 'asc' },
    })

    // Fetch company settings
    const settings = await db.settings.findFirst()
    const companyInfo = {
      businessName: settings?.businessName || 'JO-Administrativo',
      rif: settings?.rif || '',
      address: settings?.address || '',
      phone: settings?.phone || '',
    }

    // Build product rows
    const rows: ProductRow[] = products.map(p => {
      const inv = p.inventories[0]
      const stock = inv?.stock ?? 0
      return {
        name: p.name,
        sku: p.sku,
        categoryName: p.category?.name || '',
        price: p.price,
        currencySymbol: p.currency?.symbol || '$',
        stock,
        noStock: !inv || inv.stock <= 0,
      }
    })

    // Generate PDF
    const pdfBuffer = generateProductsPDF(rows, companyInfo)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="listado_productos.pdf"',
      },
    })
  } catch (error) {
    console.error('Error generando PDF de productos:', error)
    return NextResponse.json(
      { error: 'Error al generar el PDF de productos' },
      { status: 500 },
    )
  }
}
