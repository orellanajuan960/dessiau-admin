import { db } from '@/lib/db'
import { getPusherServer, pusherEvents } from '@/lib/pusher'

/**
 * Central helper to create a notification in DB + trigger Pusher in real-time.
 * All notification-creating endpoints should use this instead of calling
 * db.notification.create() directly.
 */
export async function notifyUser(
  userId: string,
  data: { title: string; message: string; type?: string }
) {
  const notification = await db.notification.create({
    data: {
      userId,
      title: data.title,
      message: data.message,
      type: (data.type as 'info' | 'warning' | 'success' | 'error') || 'info',
    },
  })

  // Fire Pusher event (non-blocking, silent fail)
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
  } catch (e) {
    // Pusher may not be configured — notification is still saved in DB
    console.error('Pusher notify error:', e)
  }

  return notification
}
