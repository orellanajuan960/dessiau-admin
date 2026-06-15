import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface LogActionParams {
  action: string   // create, update, delete, login, logout, open_cash, close_cash, etc.
  entity: string   // client, supplier, product, sale, expense, category, user, branch, settings, cash_register, etc.
  entityId?: string
  details?: Record<string, unknown>
  request?: NextRequest
  /** Override userId (bypasses session lookup) */
  userId?: string
  /** Override userName (bypasses session lookup) */
  userName?: string
  /** Override userRole (bypasses session lookup) */
  userRole?: string
}

/**
 * Log an audit action. If a request is provided, extracts user info from session
 * and IP/userAgent from headers. Direct userId/userName/userRole params take
 * precedence over session lookup.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    let userId = params.userId || ''
    let userName = params.userName || ''
    let userRole = params.userRole || ''
    let ipAddress: string | undefined
    let userAgent: string | undefined

    // If no direct user info, try to extract from session
    if (!userId && params.request) {
      try {
        const session = await getServerSession(authOptions)
        if (session?.user) {
          userId = (session.user as Record<string, unknown>).id as string || ''
          userName = session.user.name || ''
          userRole = (session.user as Record<string, unknown>).role as string || ''
        }
      } catch {
        // getServerSession can fail in non-request contexts
      }

      // Extract IP and User-Agent
      const req = params.request
      ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || undefined
      userAgent = req.headers.get('user-agent') || undefined
    }

    await db.auditLog.create({
      data: {
        userId: userId || 'system',
        userName: userName || 'Sistema',
        userRole: userRole || 'system',
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: params.details || undefined,
        ipAddress,
        userAgent,
      },
    })
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('[AuditLog] Failed to log action:', error)
  }
}
