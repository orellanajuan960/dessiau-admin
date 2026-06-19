import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getPusherServer, pusherEvents } from '@/lib/pusher'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, title, message, type } = body

    if (!userId || !title || !message) {
      return NextResponse.json({ error: 'userId, title y message son requeridos' }, { status: 400 })
    }

    const notification = await db.notification.create({
      data: {
        userId,
        title,
        message,
        type: type || 'info',
      },
    })

    // Trigger Pusher event
    try {
      const pusher = getPusherServer()
      await pusher.trigger(`user-${userId}`, pusherEvents.NOTIFICATION_NEW, {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        createdAt: notification.createdAt,
        userId,
      })
    } catch (pusherError) {
      // Pusher might fail, but notification is still saved
      console.error('Pusher error:', pusherError)
    }

    return NextResponse.json(notification, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al enviar notificación' }, { status: 500 })
  }
}
