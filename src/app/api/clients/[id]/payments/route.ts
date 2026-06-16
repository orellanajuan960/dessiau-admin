import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params

    const payments = await db.clientPayment.findMany({
      where: { clientId },
      include: {
        user: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ payments })
  } catch (error) {
    console.error('[Client Payments List] Error:', error)
    return NextResponse.json({ error: 'Error al obtener pagos' }, { status: 500 })
  }
}