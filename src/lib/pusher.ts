import type Pusher from 'pusher'

let _pusher: Pusher | null = null

export function getPusherServer(): Pusher {
  if (!_pusher) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PusherModule = require('pusher')
    _pusher = new PusherModule({
      appId: process.env.NEXT_PUBLIC_PUSHER_APP_ID || '',
      key: process.env.NEXT_PUBLIC_PUSHER_KEY || '',
      secret: process.env.PUSHER_SECRET || '',
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2',
      useTLS: true,
    })
  }
  return _pusher
}

export const pusherEvents = {
  NOTIFICATION_NEW: 'notification-new',
  NOTIFICATION_READ: 'notification-read',
  SALE_COMPLETED: 'sale-completed',
  LOW_STOCK_ALERT: 'low-stock-alert',
  CASH_REGISTER_OPENED: 'cash-register-opened',
  CASH_REGISTER_CLOSED: 'cash-register-closed',
} as const
