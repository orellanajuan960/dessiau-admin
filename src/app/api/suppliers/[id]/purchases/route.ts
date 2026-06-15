import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const purchases = await db.purchase.findMany({
      where: { supplierId: id },
      include: {
        currency: { select: { symbol: true, code: true } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })

    return NextResponse.json({ purchases })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener compras del proveedor' }, { status: 500 })
  }
}
