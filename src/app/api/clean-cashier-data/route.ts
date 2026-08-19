import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-auth'

/**
 * Cleanup script: deletes data filtered by user, branch, and/or cash register.
 *
 * Usage:
 *   GET /api/clean-cashier-data?email=cajero2@correo.com
 *   GET /api/clean-cashier-data?name=Cajero 2
 *   GET /api/clean-cashier-data?branchId=abc123
 *   GET /api/clean-cashier-data?cashRegId=xyz789
 *   GET /api/clean-cashier-data?email=cajero2@correo.com&branchId=abc123&cashRegId=xyz789
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const name = searchParams.get('name')
  const branchId = searchParams.get('branchId')
  const cashRegId = searchParams.get('cashRegId')

  if (!email && !name && !branchId && !cashRegId) {
    return NextResponse.json({
      error: 'Especifica al menos un filtro: ?email=, ?name=, ?branchId= o ?cashRegId=',
      example: '/api/clean-cashier-data?cashRegId=xyz789',
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

    // If cashRegId is given, validate it exists
    if (cashRegId) {
      const cr = await db.cashRegister.findUnique({ where: { id: cashRegId }, select: { id: true, name: true, branchId: true } })
      if (!cr) {
        return NextResponse.json({ error: `No se encontro caja registradora con id: ${cashRegId}` }, { status: 404 })
      }
      // Auto-derive branchId from the cash register if not explicitly provided
      if (!branchId && cr.branchId) {
        // Use it internally for filtering sales/expenses
      }
    }

    // ── Build where clauses ──

    // Sales: filter by userId, branchId, and/or cashRegId
    const saleWhere: Record<string, unknown> = {}
    if (uid) saleWhere.userId = uid
    if (branchId) saleWhere.branchId = branchId
    if (cashRegId) saleWhere.cashRegId = cashRegId

    // CashRegisters: filter by userId and/or branchId
    const cashRegWhere: Record<string, unknown> = {}
    if (uid) cashRegWhere.userId = uid
    if (branchId) cashRegWhere.branchId = branchId
    if (cashRegId) cashRegWhere.id = cashRegId

    // Helper: get cash register IDs for a branch (used for movements/audits)
    async function getBranchRegIds(bid: string): Promise<string[]> {
      const regs = await db.cashRegister.findMany({ where: { branchId: bid }, select: { id: true } })
      return regs.map(r => r.id)
    }

    // 1. Find sales matching filters
    const saleIds = await db.sale.findMany({
      where: saleWhere,
      select: { id: true },
    })
    const saleIdList = saleIds.map(s => s.id)

    if (saleIdList.length > 0) {
      // 2. ClientPayments: by user or linked to cash registers from these sales
      const cpWhere: Record<string, unknown> = {}
      if (uid) cpWhere.userId = uid
      if (cashRegId) {
        cpWhere.cashRegId = cashRegId
      } else if (branchId) {
        const bRegIds = await getBranchRegIds(branchId)
        if (bRegIds.length > 0) cpWhere.cashRegId = { in: bRegIds }
        else cpWhere.cashRegId = '___none___'
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

      // 4. SalePayments
      const spDel = await db.salePayment.deleteMany({
        where: { saleId: { in: saleIdList } },
      })
      results.salePayments = spDel.count

      // 5. SaleLines
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
    if (cashRegId) {
      cmWhere.cashRegId = cashRegId
    } else if (branchId) {
      const ids = await getBranchRegIds(branchId)
      if (ids.length > 0) cmWhere.cashRegId = { in: ids }
      else cmWhere.cashRegId = '___none___'
    }
    if (Object.keys(cmWhere).length > 0) {
      const cmDel = await db.cashMovement.deleteMany({ where: cmWhere })
      results.cashMovements = cmDel.count
    }

    // 8. CashAudits
    const caWhere: Record<string, unknown> = {}
    if (uid) caWhere.userId = uid
    if (cashRegId) {
      caWhere.cashRegId = cashRegId
    } else if (branchId) {
      const ids = await getBranchRegIds(branchId)
      if (ids.length > 0) caWhere.cashRegId = { in: ids }
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
    if (uid) {
      const supPayDel = await db.supplierPayment.deleteMany({ where: { userId: uid } })
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
    if (cashRegId) {
      const cr = await db.cashRegister.findUnique({ where: { id: cashRegId }, select: { name: true } })
      filterDesc.push(`caja: ${cr?.name || cashRegId}`)
    }

    return NextResponse.json({
      success: true,
      ...(user ? { user: { id: user.id, name: user.name, email: user.email, role: user.role } } : {}),
      ...(branchId ? { branchId } : {}),
      ...(cashRegId ? { cashRegId } : {}),
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
