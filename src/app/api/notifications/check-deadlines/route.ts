import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { formatCurrency } from '@/lib/currency'

// Number of days before due date to trigger a warning notification
const WARNING_DAYS = 3

export async function POST() {
  try {
    const now = new Date()
    const warningDate = new Date()
    warningDate.setDate(warningDate.getDate() + WARNING_DAYS)

    // Get all admin and gerente users who should receive notifications
    const users = await db.user.findMany({
      where: { role: { in: ['admin', 'gerente'] }, active: true },
      select: { id: true },
    })

    if (users.length === 0) {
      return NextResponse.json({ message: 'No hay usuarios administradores activos' })
    }

    let createdCount = 0

    for (const user of users) {
      // Check supplier payables approaching due date
      const supplierPayables = await db.accountPayable.findMany({
        where: {
          status: { in: ['pendiente', 'parcial'] },
          dueDate: {
            not: null,
            gte: now,
            lte: warningDate,
          },
        },
        include: {
          supplier: { select: { name: true } },
        },
      })

      for (const payable of supplierPayables) {
        const daysLeft = Math.ceil(
          (new Date(payable.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )

        // Check if we already sent a notification for this payable recently (within 24h)
        const existingNotif = await db.notification.findFirst({
          where: {
            userId: user.id,
            type: 'warning',
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            message: { contains: payable.id },
          },
        })

        if (!existingNotif) {
          await db.notification.create({
            data: {
              userId: user.id,
              title: daysLeft <= 0
                ? `Pago vencido a proveedor`
                : `Pago a proveedor vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`,
              message: `Deuda con ${payable.supplier?.name || 'Desconocido'} por ${formatCurrency(payable.pendingBalance)} ${daysLeft <= 0 ? 'vencida' : `vence el ${new Date(payable.dueDate!).toLocaleDateString('es-VE')}`}. [ID: ${payable.id}]`,
              type: daysLeft <= 0 ? 'error' : 'warning',
            },
          })
          createdCount++
        }
      }

      // Check client receivables approaching due date
      const clientReceivables = await db.accountReceivable.findMany({
        where: {
          status: { in: ['pendiente', 'parcial'] },
          dueDate: {
            not: null,
            gte: now,
            lte: warningDate,
          },
        },
        include: {
          client: { select: { name: true } },
        },
      })

      for (const receivable of clientReceivables) {
        const daysLeft = Math.ceil(
          (new Date(receivable.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )

        const existingNotif = await db.notification.findFirst({
          where: {
            userId: user.id,
            clientId: receivable.clientId,
            type: daysLeft <= 0 ? 'error' : 'warning',
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        })

        if (!existingNotif) {
          await db.notification.create({
            data: {
              userId: user.id,
              title: daysLeft <= 0
                ? `Cuenta de cliente vencida`
                : `Cuenta de cliente vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`,
              message: `Cuenta por cobrar a ${receivable.client?.name || 'Desconocido'} por ${formatCurrency(receivable.pendingBalance)} ${daysLeft <= 0 ? 'vencida' : `vence el ${new Date(receivable.dueDate!).toLocaleDateString('es-VE')}`}.`,
              type: daysLeft <= 0 ? 'error' : 'warning',
              clientId: receivable.clientId,
              clientName: receivable.client?.name || null,
            },
          })
          createdCount++
        }
      }
    }

    return NextResponse.json({
      message: `Verificación completada. ${createdCount} notificaciones creadas.`,
      createdCount,
    })
  } catch (error) {
    console.error('[Check Deadlines] Error:', error)
    return NextResponse.json({ error: 'Error al verificar plazos' }, { status: 500 })
  }
}
