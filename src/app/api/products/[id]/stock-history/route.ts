import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

const SOURCE_LABELS: Record<string, string> = {
  sale: 'Venta',
  void_sale: 'Venta anulada',
  credit_sale_deleted: 'Venta de credito eliminada',
  purchase: 'Compra',
  adjustment: 'Ajuste',
  manual_edit: 'Edicion manual',
  branch_enable: 'Activacion en sucursal',
  branch_disable: 'Desactivacion en sucursal',
  dispatch: 'Despacho a cliente',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const branchId = request.nextUrl.searchParams.get('branchId') || await resolveBranchId(request)

    const history = await db.stockHistory.findMany({
      where: { productId: id, branchId },
      include: {
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const rows = history.map(h => ({
      id: h.id,
      date: h.createdAt,
      previousStock: h.previousStock,
      newStock: h.newStock,
      change: h.change,
      source: h.source,
      sourceLabel: SOURCE_LABELS[h.source] || h.source,
      details: h.details,
      userName: h.user?.name || null,
    }))

    return NextResponse.json(rows)
  } catch (error) {
    console.error('[stock-history] Error:', error)
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}