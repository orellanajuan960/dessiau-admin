import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'
import { formatCurrency } from '@/lib/currency'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryBranchId = searchParams.get('branchId')
    const branchId = queryBranchId || await resolveBranchId(request)

    const registers = await db.cashRegister.findMany({
      where: { branchId },
      orderBy: { openingDate: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { sales: true, movements: true } },
      },
    })

    // Recalculate currentAmt for open registers (non-credit payments + movements)
    const openRegs = registers.filter(r => r.status === 'abierta')
    if (openRegs.length > 0) {
      const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
      const creditCodes = new Set(pmList.filter(m => m.isCredit).map(m => m.code))

      for (const reg of openRegs) {
        const sales = await db.sale.findMany({
          where: { cashRegId: reg.id, status: 'completada' },
          include: { payments: true },
        })
        const movements = await db.cashMovement.findMany({
          where: { cashRegId: reg.id },
        })

        let salesTotal = 0
        for (const sale of sales) {
          for (const p of sale.payments) {
            if (!creditCodes.has(p.method)) salesTotal += p.amount
          }
        }
        const entradas = movements.filter(m => m.type === 'entrada').reduce((s, m) => s + m.amount, 0)
        const salidas = movements.filter(m => m.type === 'salida').reduce((s, m) => s + m.amount, 0)
        const retiros = movements.filter(m => m.type === 'retiro_excedente').reduce((s, m) => s + m.amount, 0)

        const correctAmt = Math.round((reg.initialAmt + salesTotal + entradas - salidas - retiros) * 100) / 100

        // Update in-memory for response
        ;(reg as any).currentAmt = correctAmt

        // Persist if different
        if (Math.abs(reg.currentAmt - correctAmt) > 0.01) {
          await db.cashRegister.update({
            where: { id: reg.id },
            data: { currentAmt: correctAmt },
          })
        }
      }
    }

    return NextResponse.json(registers)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener caja' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, initialAmt, branchId, name } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const effectiveBranchId = body.branchId || await resolveBranchId()

    const settings = await db.settings.findFirst()

    const register = await db.cashRegister.create({
      data: {
        name: name?.trim() || null,
        userId,
        branchId: effectiveBranchId,
        initialAmt: initialAmt || 0,
        currentAmt: initialAmt || 0,
        status: 'abierta',
        currencyId: settings?.baseCurrencyId || '',
      },
      include: { user: { select: { id: true, name: true } } },
    })

    await logAction({
      action: 'open_cash',
      entity: 'cash_register',
      entityId: register.id,
      details: { summary: `Caja abierta: ${formatCurrency(initialAmt || 0)}`, initialAmount: initialAmt || 0 },
      request,
    })

    return NextResponse.json(register, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al abrir caja' }, { status: 500 })
  }
}
