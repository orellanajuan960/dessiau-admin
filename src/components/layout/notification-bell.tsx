'use client'

import { useState, useEffect } from 'react'
import { Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle2, XCircle, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/hooks/use-notifications'
import { useAppStore } from '@/stores/use-app-store'
import { toast } from 'sonner'

const typeConfig: Record<string, { dot: string; badge: string; icon: typeof Info; label: string }> = {
  info: { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', icon: Info, label: 'Información' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400', icon: AlertTriangle, label: 'Advertencia' },
  success: { dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400', icon: CheckCircle2, label: 'Completado' },
  error: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400', icon: XCircle, label: 'Error' },
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diff < 60) return 'Justo ahora'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  return `Hace ${Math.floor(diff / 86400)}d`
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface NotificationItem {
  id?: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read?: boolean
  createdAt?: string
  clientId?: string | null
  clientName?: string | null
}

export function NotificationBell() {
  const { user } = useAuth()
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications(user?.id)
  const navigateToClient = useAppStore((s) => s.navigateToClient)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<NotificationItem | null>(null)

  // Check for approaching deadlines every 5 minutes
  useEffect(() => {
    if (!user?.id || !['admin', 'gerente'].includes(user.role || '')) return

    fetch('/api/notifications/check-deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})

    const interval = setInterval(() => {
      fetch('/api/notifications/check-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {})
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user?.id, user?.role])

  const handleOpenDetail = (notification: NotificationItem) => {
    if (!notification.read) markAsRead(notification.id!)
    setSelected(notification)
    setOpen(false)
  }

  const handleGoToClient = (notification: NotificationItem) => {
    if (!notification.clientId) return
    if (!notification.read) markAsRead(notification.id!)
    setSelected(null)
    navigateToClient(notification.clientId)
  }

  const handleClearAll = () => {
    if (notifications.length === 0) return
    clearAll()
    toast.success('Notificaciones limpiadas')
  }

  // Render message with clickable client name for client-related notifications
  const renderMessage = (notification: NotificationItem, inModal = false) => {
    if (!notification.clientId || !notification.clientName) {
      return <span>{notification.message}</span>
    }

    // Extract the part before and after the client name in the message
    // Message format: "Cuenta por cobrar a {name} por {amount} ..."
    const nameEscaped = notification.clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(a\\s+)(${nameEscaped})(\\s+por)`, 'i')
    const match = notification.message.match(regex)

    if (!match) {
      return <span>{notification.message}</span>
    }

    const before = notification.message.slice(0, match.index! + match[1].length)
    const after = notification.message.slice(match.index! + match[1].length + match[2].length)

    return (
      <span>
        {before}
        <button
          type="button"
          className={cn(
            'font-semibold text-primary hover:underline',
            inModal && 'inline-flex items-center gap-1'
          )}
          onClick={(e) => {
            e.stopPropagation()
            handleGoToClient(notification)
          }}
        >
          {notification.clientName}
          {inModal && <ExternalLink className="h-3 w-3" />}
        </button>
        {after}
      </span>
    )
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-9 md:w-9">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80 md:w-96" align="end" forceMount>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span className="text-sm font-semibold">Notificaciones</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-primary hover:text-primary/80"
                  onClick={(e) => {
                    e.stopPropagation()
                    markAllAsRead()
                  }}
                >
                  <CheckCheck className="mr-1 h-3 w-3" />
                  <span className="hidden sm:inline">Leer todas</span>
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive/80"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClearAll()
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  <span className="hidden sm:inline">Limpiar</span>
                </Button>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ScrollArea className="max-h-72">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Bell className="mx-auto mb-2 h-6 w-6 opacity-40" />
                No hay notificaciones
              </div>
            ) : (
              notifications.slice(0, 20).map((notification) => {
                const config = typeConfig[notification.type] || typeConfig.info
                return (
                  <DropdownMenuItem
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-2.5 p-3 cursor-pointer',
                      !notification.read && 'bg-muted/50'
                    )}
                    onClick={() => handleOpenDetail(notification)}
                  >
                    <div className="mt-0.5 shrink-0">
                      <span className={cn('inline-block h-2 w-2 rounded-full', config.dot)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{notification.title}</span>
                        {!notification.read && (
                          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {notification.message}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap mt-0.5">
                      {timeAgo(notification.createdAt!)}
                    </span>
                  </DropdownMenuItem>
                )
              })
            )}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Notification Detail Modal ─────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {selected && (() => {
                const config = typeConfig[selected.type] || typeConfig.info
                const Icon = config.icon
                return (
                  <span className={cn('inline-flex items-center justify-center h-9 w-9 rounded-full', config.badge)}>
                    <Icon className="h-4 w-4" />
                  </span>
                )
              })()}
              <DialogTitle className="text-base">{selected?.title}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground leading-relaxed">
              {selected ? renderMessage(selected, true) : null}
            </div>
            {selected?.clientId && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleGoToClient(selected)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver cuenta del cliente
              </Button>
            )}
            <div className="flex items-center justify-between pt-2 border-t">
              {selected && (() => {
                const config = typeConfig[selected.type] || typeConfig.info
                return (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', config.badge)}>
                    {config.label}
                  </span>
                )
              })()}
              <span className="text-xs text-muted-foreground">
                {selected?.createdAt ? formatFullDate(selected.createdAt) : ''}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
