import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-auth'

/**
 * Cleanup script: deletes data created by a specific user, optionally filtered by branch.
 *
 * Usage:
 *   GET /api/clean-cashier-data?email=cajero2@correo.com
 *   GET /api/clean-cashier-data?name=Cajero 2
 *   GET /api/clean-cashier-data?email=cajero2@correo.com&branchId=abc123
 *   GET /api/clean-cashier-data?branchId=abc123
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const name = searchParams.get('name')
  const branchId = searchParams.get('branchId')

  if (!email && !name && !branchId) {
    return NextResponse.json({
      error: 'Especifica ?email=correo, ?name=nombre y/o ?branchId=idSucursal',
      example: '/api/clean-cashier-data?email=cajero2@correo.com&branchId=abc123',
    }, { status: 400 })
  }

  try {
    // Find user if specified
    let user: { id: string; name: string; email: string; role: string } | null = null
    if (email || name) {
      user = await db.user.findFirst({
        where: email ? { email } : { name },
      })
      if (!user) {
        return NextResponse.json({ error: `No se encontro usuario con ${email ? 'email' : 'nombre'}: ${email || name}` }, { status: 404 })
      }
    }

    const uid = user?.id
    const results: Record<string, number> = {}

    // Build branch-aware where clauses
    const saleWhere: Record<string, unknown> = {}
    if (uid) saleWhere.userId = uid
    if (branchId) saleWhere.branchId = branchId

    const cashRegWhere: Record<string, unknown> = {}
    if (uid) cashRegWhere.userId = uid
    if (branchId) cashRegWhere.branchId = branchId

    // 1. Find sales
    const saleIds = await db.sale.findMany({
      where: saleWhere,
      select: { id: true },
    })
    const saleIdList = saleIds.map(s => s.id)

    if (saleIdList.length > 0) {
      // 2. ClientPayments by this user (or linked to these sales' cash registers)
      const cpWhere: Record<string, unknown> = {}
      if (uid) cpWhere.userId = uid
      if (saleIdList.length > 0) {
        // Also delete client payments linked to cash registers from these sales
        const crIdsFromSales = await db.sale.findMany({
          where: { id: { in: saleIdList }, cashRegId: { not: null } },
          select: { cashRegId: true },
        }).then(s => [...new Set(s.map(x => x.cashRegId!))])
        if (crIdsFromSales.length > 0 && !uid) {
          cpWhere.cashRegId = { in: crIdsFromSales }
        }
      }
      if (Object.keys(cpWhere).length > 0) {
        const cpDel = await db.clientPayment.deleteMany({ where: cpWhere })
        results.clientPayments = cpDel.count
      }

      // 3. AccountReceivables from these sales
      const arDel = await db.accountReceivable.deleteMany({
        where: { saleId: { in: saleIdList } },
      })
      results.accountReceivables = arDel.count

      // 4. SalePayments from these sales
      const spDel = await db.salePayment.deleteMany({
        where: { saleId: { in: saleIdList } },
      })
      results.salePayments = spDel.count

      // 5. SaleLines from these sales
      const slDel = await db.saleLine.deleteMany({
        where: { saleId: { in: saleIdList } },
      })
      results.saleLines = slDel.count

      // 6. Sales
      const saleDel = await db.sale.deleteMany({ where: saleWhere })
      results.sales = saleDel.count
    }

    // 7. CashMovements
    const cmWhere: Record<string, unknown> = {}
    if (uid) cmWhere.userId = uid
    if (branchId) {
      const cmRegIds = await db.cashRegister.findMany({
        where: { branchId }, select: { id: true },
      })
      if (cmRegIds.length > 0) cmWhere.cashRegId = { in: cmRegIds.map(r => r.id) }
      else cmWhere.cashRegId = '___none___' // force 0 deletes if no registers
    }
    if (Object.keys(cmWhere).length > 0) {
      const cmDel = await db.cashMovement.deleteMany({ where: cmWhere })
      results.cashMovements = cmDel.count
    }

    // 8. CashAudits
    const caWhere: Record<string, unknown> = {}
    if (uid) caWhere.userId = uid
    if (branchId) {
      const caRegIds = await db.cashRegister.findMany({
        where: { branchId }, select: { id: true },
      })
      if (caRegIds.length > 0) caWhere.cashRegId = { in: caRegIds.map(r => r.id) }
      else caWhere.cashRegId = '___none___'
    }
    if (Object.keys(caWhere).length > 0) {
      const caDel = await db.cashAudit.deleteMany({ where: caWhere })
      results.cashAudits = caDel.count
    }

    // 9. CashRegisters + CashCuts
    const crIds = await db.cashRegister.findMany({
      where: cashRegWhere,
      select: { id: true },
    })
    const crIdList = crIds.map(r => r.id)

    if (crIdList.length > 0) {
      const ccDel = await db.cashCut.deleteMany({
        where: { cashRegId: { in: crIdList } },
      })
      results.cashCuts = ccDel.count
    }

    const crDel = await db.cashRegister.deleteMany({ where: cashRegWhere })
    results.cashRegisters = crDel.count

    // 10. SupplierPayments
    const supWhere: Record<string, unknown> = {}
    if (uid) supWhere.userId = uid
    if (Object.keys(supWhere).length > 0) {
      const supPayDel = await db.supplierPayment.deleteMany({ where: supWhere })
      results.supplierPayments = supPayDel.count
    }

    // 11. Expenses
    const exWhere: Record<string, unknown> = {}
    if (uid) exWhere.userId = uid
    if (branchId) exWhere.branchId = branchId
    if (Object.keys(exWhere).length > 0) {
      const exDel = await db.expense.deleteMany({ where: exWhere })
      results.expenses = exDel.count
    }

    // 12. InventoryAdjustments
    const iaWhere: Record<string, unknown> = {}
    if (uid) iaWhere.userId = uid
    if (branchId) iaWhere.branchId = branchId
    if (Object.keys(iaWhere).length > 0) {
      const iaDel = await db.inventoryAdjustment.deleteMany({ where: iaWhere })
      results.inventoryAdjustments = iaDel.count
    }

    // 13. StockHistory
    const shWhere: Record<string, unknown> = {}
    if (uid) shWhere.userId = uid
    if (branchId) shWhere.branchId = branchId
    if (Object.keys(shWhere).length > 0) {
      const shDel = await db.stockHistory.deleteMany({ where: shWhere })
      results.stockHistory = shDel.count
    }

    // 14. PriceAdjustments
    const paWhere: Record<string, unknown> = {}
    if (uid) paWhere.userId = uid
    if (branchId) paWhere.branchId = branchId
    if (Object.keys(paWhere).length > 0) {
      const paDel = await db.priceAdjustment.deleteMany({ where: paWhere })
      results.priceAdjustments = paDel.count
    }

    // 15. Notifications (user only)
    if (uid) {
      const notifDel = await db.notification.deleteMany({ where: { userId: uid } })
      results.notifications = notifDel.count
    }

    // 16. AuditLogs (user only)
    if (uid) {
      const auditDel = await db.auditLog.deleteMany({ where: { userId: uid } })
      results.auditLogs = auditDel.count
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0)

    const filterDesc: string[] = []
    if (user) filterDesc.push(`usuario: ${user.name}`)
    if (branchId) {
      const branch = await db.branch.findUnique({ where: { id: branchId }, select: { name: true } })
      filterDesc.push(`sucursal: ${branch?.name || branchId}`)
    }

    return NextResponse.json({
      success: true,
      ...(user ? { user: { id: user.id, name: user.name, email: user.email, role: user.role } } : {}),
      ...(branchId ? { branchId } : {}),
      deleted: results,
      totalDeleted,
      message: `Se eliminaron ${totalDeleted} registros (${filterDesc.join(', ')})`,
    })
  } catch (error: any) {
    console.error('[clean-cashier-data] Error:', error)
    return NextResponse.json({
      error: 'Error al limpiar datos',
      details: error?.message || String(error),
    }, { status: 500 })
  }
}
