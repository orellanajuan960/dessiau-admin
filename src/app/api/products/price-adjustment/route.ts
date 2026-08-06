import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const branchIds = searchParams.get('branchIds')

    const where: Record<string, unknown> = {}
    if (branchIds) {
      where.branchId = { in: branchIds.split(',') }
    }

    const adjustments = await db.priceAdjustment.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json(adjustments)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ajustes' }, { status: 500 })
  }
}
