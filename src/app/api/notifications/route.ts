import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || ''

    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        read: true,
        createdAt: true,
        clientId: true,
        clientName: true,
      },
    })
    return NextResponse.json(notifications)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener notificaciones' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { notificationId, markAll, userId } = body

    if (markAll) {
      const where: Record<string, unknown> = { read: false }
      if (userId) where.userId = userId
      await db.notification.updateMany({
        where,
        data: { read: true },
      })
      return NextResponse.json({ success: true })
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId es requerido' }, { status: 400 })
    }

    await db.notification.update({
      where: { id: notificationId },
      data: { read: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar notificación' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || ''

    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId

    await db.notification.deleteMany({ where })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al limpiar notificaciones' }, { status: 500 })
  }
}
