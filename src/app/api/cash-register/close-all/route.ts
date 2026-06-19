import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { buildReportFromRegister, generateMultiCashClosePDF, type CashCloseReport } from '@/lib/cash-close-pdf'
import { formatCurrency } from '@/lib/currency'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const branchId = body.branchId || await resolveBranchId()

    const openRegisters = await db.cashRegister.findMany({
      where: { branchId, status: 'abierta' },
      include: {
        sales: {
          where: { status: 'completada' },
          include: {
            payments: { include: { currency: { select: { code: true } } } },
            lines: { include: { product: { select: { name: true } } } },
            client: { select: { name: true } },
          },
        },
        movements: true,
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    })

    if (openRegisters.length === 0) {
      return NextResponse.json({ message: 'No hay cajas abiertas' })
    }

    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
    const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))

    const results = await db.$transaction(async (tx) => {
      const cuts: any[] = []
      for (const register of openRegisters) {
        const totalSales = register.sales.reduce((sum, sale) => {
          return sum + sale.payments
            .filter(p => cashCodes.has(p.method))
            .reduce((s, p) => s + p.amount, 0)
        }, 0)

        const totalExpenses = register.movements
          .filter(m => m.type === 'salida')
          .reduce((sum, m) => sum + m.amount, 0)

        const totalEntries = register.movements
          .filter(m => m.type === 'entrada')
          .reduce((sum, m) => sum + m.amount, 0)

        const totalRetiros = register.movements
          .filter(m => m.type === 'retiro_excedente')
          .reduce((sum, m) => sum + m.amount, 0)

        const expected = Math.round((register.initialAmt + totalSales + totalEntries - totalExpenses - totalRetiros) * 100) / 100
        const actual = expected

        await tx.cashRegister.update({
          where: { id: register.id },
          data: {
            status: 'cerrada',
            closingDate: new Date(),
            currentAmt: actual,
          },
        })

        const cut = await tx.cashCut.create({
          data: {
            cashRegId: register.id,
            totalSales: Math.round(totalSales * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            totalRetiros: Math.round(totalRetiros * 100) / 100,
            expected,
            actual,
            difference: 0,
          },
          include: { cashReg: { include: { user: { select: { name: true } }, branch: { select: { name: true } } } } },
        })

        cuts.push(cut)
      }
      return cuts
    })

    // Send email with PDF report to admin (async)
    const closingDate = new Date()
    import('@/lib/email').then(async ({ sendCashCloseAllEmailWithPDF }) => {
      try {
        const settings = await db.settings.findFirst()
        const businessName = settings?.businessName || 'JO-Administrativo'
        const businessRif = settings?.rif || ''
        const businessAddress = settings?.address || ''
        const businessPhone = settings?.phone || ''
        const exchangeRate = settings?.exchangeRate || 0
        const referenceCurrency = settings?.referenceCurrency || 'USD'
        const ivaEnabled = settings?.ivaEnabled || false
        const ivaRate = settings?.ivaRate || 0

        const reports: CashCloseReport[] = []
        for (const r of openRegisters) {
          const totalSales = r.sales.reduce((sum, sale) => {
            return sum + sale.payments.filter(p => cashCodes.has(p.method)).reduce((s, p) => s + p.amount, 0)
          }, 0)
          const totalExpenses = r.movements.filter(m => m.type === 'salida').reduce((sum, m) => sum + m.amount, 0)
          const totalEntries = r.movements.filter(m => m.type === 'entrada').reduce((sum, m) => sum + m.amount, 0)
          const totalRetiros = r.movements.filter(m => m.type === 'retiro_excedente').reduce((sum, m) => sum + m.amount, 0)
          const expected = Math.round((r.initialAmt + totalSales + totalEntries - totalExpenses - totalRetiros) * 100) / 100

          reports.push(await buildReportFromRegister(
            r as any,
            closingDate,
            expected,
            expected,
            0,
            totalSales,
            totalExpenses,
            totalEntries,
            totalRetiros,
            businessName,
            businessRif,
            businessAddress,
            businessPhone,
            exchangeRate,
            referenceCurrency,
            ivaEnabled,
            ivaRate,
          ))
        }

        const pdfBuffer = await generateMultiCashClosePDF(reports)
        await sendCashCloseAllEmailWithPDF({
          registersCount: openRegisters.length,
          cuts: openRegisters.map(r => {
            const totalSales = r.sales.reduce((sum, sale) => {
              return sum + sale.payments.filter(p => cashCodes.has(p.method)).reduce((s, p) => s + p.amount, 0)
            }, 0)
            const totalExpenses = r.movements.filter(m => m.type === 'salida').reduce((sum, m) => sum + m.amount, 0)
            const totalEntries = r.movements.filter(m => m.type === 'entrada').reduce((sum, m) => sum + m.amount, 0)
            const totalRetiros = r.movements.filter(m => m.type === 'retiro_excedente').reduce((sum, m) => sum + m.amount, 0)
            const expected = Math.round((r.initialAmt + totalSales + totalEntries - totalExpenses - totalRetiros) * 100) / 100
            return {
              cashierName: r.user.name,
              registerName: r.name,
              branchName: r.branch.name,
              openingDate: r.openingDate,
              closingDate,
              initialAmt: r.initialAmt,
              expected,
              actual: expected,
              difference: 0,
              totalSales,
              totalExpenses,
              totalRetiros,
              salesCount: r.sales.length,
              ivaEnabled,
              ivaRate,
            }
          }),
          pdfBuffer,
        }, referenceCurrency || undefined)
      } catch (e) {
        console.error('[Email] Failed to generate/send PDF for mass cash close:', e)
      }
    })

    // Create notifications for all cashiers whose registers were closed
    for (const reg of openRegisters) {
      await db.notification.create({
        data: {
          userId: reg.user.id,
          title: 'Caja Cerrada',
          message: `Todas las cajas de la sucursal "${reg.branch.name}" han sido cerradas. Tu caja "${reg.name || 'Sin nombre'}" ha sido cerrada autom\u00E1ticamente. Monto final: ${formatCurrency(reg.currentAmt)}`,
          type: 'warning',
        },
      })
    }

    return NextResponse.json({
      message: `${results.length} caja(s) cerrada(s)`,
      cuts: results,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al cerrar cajas' }, { status: 500 })
  }
}
