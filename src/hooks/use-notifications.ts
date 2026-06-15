'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Pusher from 'pusher-js'
import { pusherEvents } from '@/lib/pusher'

interface NotificationMessage {
  id?: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read?: boolean
  createdAt?: string
  clientId?: string | null
  clientName?: string | null
}

type NotificationHandler = (notification: NotificationMessage) => void

export function useNotifications(userId: string | undefined, onNewNotification?: NotificationHandler) {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const pusherRef = useRef<Pusher | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data)
        setUnreadCount(data.filter((n: NotificationMessage) => !n.read).length)
      }
    } catch {
      // Silent fail
    }
  }, [userId])

  // Fetch + Polling fallback (every 30s) + Pusher real-time
  useEffect(() => {
    if (!userId) return

    // Initial fetch
    fetchNotifications()

    // Polling fallback every 30s (catches notifications if Pusher is not configured)
    const pollInterval = setInterval(fetchNotifications, 30_000)

    // Initialize Pusher (may silently fail if not configured)
    if (!pusherRef.current && process.env.NEXT_PUBLIC_PUSHER_KEY) {
      try {
        pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2',
        })
      } catch {
        // Pusher not available — polling will handle it
      }
    }

    if (pusherRef.current) {
      const channel = pusherRef.current.subscribe(`user-${userId}`)

      channel.bind(pusherEvents.NOTIFICATION_NEW, (data: NotificationMessage) => {
        setNotifications((prev) => [data, ...prev])
        setUnreadCount((prev) => prev + 1)
        onNewNotification?.(data)
      })

      return () => {
        clearInterval(pollInterval)
        channel.unbind_all()
        channel.unsubscribe()
      }
    }

    return () => {
      clearInterval(pollInterval)
    }
  }, [userId, fetchNotifications, onNewNotification])

  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // Silent fail
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true, userId }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // Silent fail
    }
  }, [])

  const clearAll = useCallback(async () => {
    try {
      await fetch(`/api/notifications?userId=${userId}`, { method: 'DELETE' })
      setNotifications([])
      setUnreadCount(0)
    } catch {
      // Silent fail
    }
  }, [userId])

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    fetchNotifications,
  }
}
