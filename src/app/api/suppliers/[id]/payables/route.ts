import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get payables with their payment history
    const payables = await db.accountPayable.findMany({
      where: { supplierId: id },
      include: {
        purchase: {
          select: {
            id: true,
            date: true,
            total: true,
            paidUpfront: true,
            lines: {
              include: {
                product: { select: { name: true } },
              },
            },
          },
        },
        payments: {
          include: {
            user: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Get all payments for this supplier
    const payments = await db.supplierPayment.findMany({
      where: { supplierId: id },
      include: {
        payable: {
          select: {
            purchase: { select: { id: true } },
          },
        },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Calculate total debt
    const totalDebt = payables
      .filter(p => p.status === 'pendiente' || p.status === 'parcial')
      .reduce((sum, p) => sum + p.pendingBalance, 0)

    return NextResponse.json({ payables, payments, totalDebt: Math.round(totalDebt * 100) / 100 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener cuentas por pagar' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { amount, description, dueDate, products, invoiceNumber, invoiceUrl } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    const supplier = await db.supplier.findUnique({ where: { id } })
    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const result = await db.$transaction(async (tx) => {
      // Create the payable
      const payable = await tx.accountPayable.create({
        data: {
          supplierId: id,
          amount,
          pendingBalance: amount,
          dueDate: dueDate ? new Date(dueDate) : null,
          status: 'pendiente',
          description: description || null,
          invoiceNumber: invoiceNumber || null,
          invoiceUrl: invoiceUrl || null,
        },
      })

      // Update supplier balance
      await tx.supplier.update({
        where: { id },
        data: { balance: { increment: amount } },
      })

      return payable
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[Supplier Payable POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear cuenta por pagar' }, { status: 500 })
  }
}
