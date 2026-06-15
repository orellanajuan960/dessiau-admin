import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { notifyUser } from '@/lib/notify'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const body = await request.json()
    const { reason, context } = body

    if (!reason?.trim()) {
      return NextResponse.json({ error: 'El motivo es requerido' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { name: true },
    })
    const callerName = user?.name || 'Un cajero'

    const managers = await db.user.findMany({
      where: { role: { in: ['admin', 'gerente'] }, active: true },
      select: { id: true },
    })

    if (managers.length === 0) {
      return NextResponse.json(
        { error: 'No hay gerentes ni administradores activos para notificar' },
        { status: 400 }
      )
    }

    const fullMessage = context
      ? `${callerName} solicita atención: ${reason.trim()} — ${context}`
      : `${callerName} solicita atención: ${reason.trim()}`

    await Promise.all(
      managers.map((manager) =>
        notifyUser(manager.id, {
          title: 'Solicitud de Gerente',
          message: fullMessage,
          type: 'info',
        })
      )
    )

    return NextResponse.json({ sent: managers.length }, { status: 201 })
  } catch (error) {
    console.error('Error al notificar gerente:', error)
    return NextResponse.json({ error: 'Error al enviar notificación' }, { status: 500 })
  }
}
