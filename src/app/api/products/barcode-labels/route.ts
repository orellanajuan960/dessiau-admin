import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import bwipjs from 'bwip-js'
import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabelItem {
  productId: string
  quantity: number
}

// ─── Barcode generator ───────────────────────────────────────────────────────

async function generateBarcode(text: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 8,
    includetext: false,
  })
  return `data:image/png;base64,${png.toString('base64')}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '\u2026'
}

function formatPrice(price: number): string {
  return price.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ─── Label layout constants ───────────────────────────────────────────────────

const MARGIN = 30
const COLS = 3
const LABEL_WIDTH = 165
const LABEL_HEIGHT = 90
const LABEL_GAP_X = 10
const LABEL_GAP_Y = 10

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { products } = body as { products?: LabelItem[] }

    // ── Validate request ─────────────────────────────────────────────────
    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un arreglo de productos con productId y quantity.' },
        { status: 400 },
      )
    }

    for (const item of products) {
      if (!item.productId || typeof item.quantity !== 'number' || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Cada producto debe tener productId (string) y quantity (number >= 1).' },
          { status: 400 },
        )
      }
    }

    // ── Fetch products from DB ───────────────────────────────────────────
    const productIds = products.map((p) => p.productId)
    const dbProducts = await db.product.findMany({
      where: { id: { in: productIds } },
      include: { currency: { select: { symbol: true, code: true } } },
    })

    if (dbProducts.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron productos con los IDs proporcionados.' },
        { status: 404 },
      )
    }

    // Build a lookup map
    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    // ── Expand labels with quantity ──────────────────────────────────────
    type LabelData = {
      name: string
      sku: string
      price: string
      barcodeText: string
    }

    const labels: LabelData[] = []
    for (const item of products) {
      const product = productMap.get(item.productId)
      if (!product) continue // skip unknown products

      const sku = product.sku || product.id.slice(0, 8)
      const priceStr = `${product.currency.symbol}${formatPrice(product.price)}`

      for (let i = 0; i < item.quantity; i++) {
        labels.push({
          name: product.name,
          sku,
          price: priceStr,
          barcodeText: sku,
        })
      }
    }

    if (labels.length === 0) {
      return NextResponse.json(
        { error: 'No se generaron etiquetas.' },
        { status: 400 },
      )
    }

    // ── Generate barcode images (cache unique barcodes as base64) ────────
    const barcodeCache = new Map<string, string>()
    async function getBarcode(text: string): Promise<string> {
      if (!barcodeCache.has(text)) {
        barcodeCache.set(text, await generateBarcode(text))
      }
      return barcodeCache.get(text)!
    }

    // Pre-generate all unique barcodes
    const uniqueBarcodes = [...new Set(labels.map((l) => l.barcodeText))]
    await Promise.all(uniqueBarcodes.map((text) => getBarcode(text)))

    // ── Create PDF ───────────────────────────────────────────────────────
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
    })

    doc.setProperties({
      title: 'Etiquetas de Productos',
      author: 'JO-Administrativo',
      subject: 'Codigos de barras para productos',
    })

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    const rowsPerPage = Math.floor((pageH - MARGIN * 2) / (LABEL_HEIGHT + LABEL_GAP_Y))

    let labelIndex = 0
    let col = 0
    let row = 0
    let currentPageRows = 0

    while (labelIndex < labels.length) {
      // Check if we need a new page
      if (currentPageRows >= rowsPerPage) {
        doc.addPage()
        col = 0
        row = 0
        currentPageRows = 0
      }

      const x = MARGIN + col * (LABEL_WIDTH + LABEL_GAP_X)
      const y = MARGIN + row * (LABEL_HEIGHT + LABEL_GAP_Y)
      const label = labels[labelIndex]

      // Dotted border
      doc.setDrawColor(153, 153, 153)
      doc.setLineDashPattern([2, 2], 0)
      doc.setLineWidth(0.5)
      doc.rect(x, y, LABEL_WIDTH, LABEL_HEIGHT)
      doc.setLineDashPattern([], 0)

      const padX = 6
      const padY = 5
      const innerW = LABEL_WIDTH - padX * 2

      // Product name (bold, top)
      doc.setFontSize(9)
      doc.setTextColor(17, 24, 39)
      doc.setFont('helvetica', 'bold')
      doc.text(truncate(label.name, 28), x + padX + innerW / 2, y + padY + 7, { align: 'center', maxWidth: innerW })

      // Barcode image (middle)
      const barcodeDataUrl = barcodeCache.get(label.barcodeText)!
      const barcodeW = Math.min(120, innerW)
      const barcodeH = 30
      const barcodeX = x + padX + (innerW - barcodeW) / 2
      const barcodeY = y + padY + 14
      doc.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeW, barcodeH)

      // SKU text (below barcode)
      doc.setFontSize(7)
      doc.setTextColor(107, 114, 128)
      doc.setFont('helvetica', 'normal')
      doc.text(label.sku, x + padX + innerW / 2, y + padY + 52, { align: 'center' })

      // Price (bottom)
      doc.setFontSize(10)
      doc.setTextColor(17, 24, 39)
      doc.setFont('helvetica', 'bold')
      doc.text(label.price, x + padX + innerW / 2, y + padY + 65, { align: 'center' })

      labelIndex++
      col++
      if (col >= COLS) {
        col = 0
        row++
        currentPageRows++
      }
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    // ── Return PDF ───────────────────────────────────────────────────────
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="etiquetas_productos.pdf"',
      },
    })
  } catch (error) {
    console.error('Error generando etiquetas de producto:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al generar las etiquetas.' },
      { status: 500 },
    )
  }
}
