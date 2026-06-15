import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cashRegId = searchParams.get('cashRegId')

    if (!cashRegId) {
      return NextResponse.json({ error: 'cashRegId es requerido' }, { status: 400 })
    }

    const audits = await db.cashAudit.findMany({
      where: { cashRegId },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { auditDate: 'desc' },
    })

    return NextResponse.json(audits)
  } catch (error) {
    return NextResponse.json({ error: 'Error al consultar arqueos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashRegId, userId, breakdown, notes } = body

    if (!cashRegId || !userId || !breakdown) {
      return NextResponse.json({ error: 'cashRegId, userId y breakdown son requeridos' }, { status: 400 })
    }

    const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
    if (!register || register.status === 'cerrada') {
      return NextResponse.json({ error: 'Caja no encontrada o cerrada' }, { status: 400 })
    }

    // Calculate counted total from denomination breakdown
    const counted = Object.entries(breakdown as Record<string, number>).reduce(
      (sum, [denomination, qty]) => sum + parseFloat(denomination) * (qty || 0),
      0
    )

    const expected = register.currentAmt
    const difference = Math.round((counted - expected) * 100) / 100

    const audit = await db.cashAudit.create({
      data: {
        cashRegId,
        userId,
        expected: Math.round(expected * 100) / 100,
        counted: Math.round(counted * 100) / 100,
        difference,
        breakdown: breakdown as object,
        notes: notes || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        cashReg: { select: { id: true, name: true } },
      },
    })

    // Fix 10 & 12: Update currentAmt to counted amount (adjusts excedente)
    if (difference !== 0) {
      const currencies = await db.currency.findMany({ select: { id: true, isBase: true } })
      const baseCurrency = currencies.find(c => c.isBase)
      await db.$transaction(async (tx) => {
        await tx.cashRegister.update({
          where: { id: cashRegId },
          data: { currentAmt: Math.round(counted * 100) / 100 },
        })
        // Create automatic adjustment movement
        await tx.cashMovement.create({
          data: {
            cashRegId,
            userId,
            type: difference > 0 ? 'entrada' : 'salida',
            amount: Math.abs(difference),
            concept: `Ajuste por arqueo (${difference > 0 ? 'sobrante' : 'faltante'})`,
            currencyId: baseCurrency?.id || currencies[0]?.id || '',
          },
        })
      })
    }

    const fmt = (v: number) => v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    await logAction({
      action: 'cut_cash',
      entity: 'cash_register',
      entityId: cashRegId,
      details: {
        summary: `Arqueo de caja - Esperado: $${fmt(expected)}, Contado: $${fmt(counted)}, Diferencia: $${fmt(difference)}`,
        expected, counted, difference,
      },
      request,
    })

    return NextResponse.json(audit, { status: 201 })
  } catch (error) {
    console.error('Error al registrar arqueo:', error)
    return NextResponse.json({ error: 'Error al registrar arqueo de caja' }, { status: 500 })
  }
}
