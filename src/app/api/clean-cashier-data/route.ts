import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-auth'

/**
 * One-time cleanup script: deletes ALL data created by a specific user (cashier 2).
 * Must be called with ?email=... or ?name=...
 *
 * Usage: GET /api/clean-cashier-data?email=cajero2@correo.com
 *        GET /api/clean-cashier-data?name=Cajero 2
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const name = searchParams.get('name')

  if (!email && !name) {
    return NextResponse.json({
      error: 'Especifica el cajero con ?email=correo o ?name=nombre',
      example: '/api/clean-cashier-data?email=cajero2@correo.com',
    }, { status: 400 })
  }

  try {
    const user = await db.user.findFirst({
      where: email
        ? { email }
        : { name },
    })

    if (!user) {
      return NextResponse.json({ error: `No se encontro usuario con ${email ? 'email' : 'nombre'}: ${email || name}` }, { status: 404 })
    }

    const uid = user.id
    const results: Record<string, number> = {}

    // 1. Find all sales by this user
    const saleIds = await db.sale.findMany({
      where: { userId: uid },
      select: { id: true },
    })
    const saleIdList = saleIds.map(s => s.id)

    if (saleIdList.length > 0) {
      // 2. ClientPayments by this user (applied to receivables from these sales)
      const cpDel = await db.clientPayment.deleteMany({
        where: { userId: uid },
      })
      results.clientPayments = cpDel.count

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
      const saleDel = await db.sale.deleteMany({
        where: { userId: uid },
      })
      results.sales = saleDel.count
    }

    // 7. CashMovements by this user
    const cmDel = await db.cashMovement.deleteMany({
      where: { userId: uid },
    })
    results.cashMovements = cmDel.count

    // 8. CashAudits by this user
    const caDel = await db.cashAudit.deleteMany({
      where: { userId: uid },
    })
    results.cashAudits = caDel.count

    // 9. CashRegisters opened by this user + their CashCuts
    const crIds = await db.cashRegister.findMany({
      where: { userId: uid },
      select: { id: true },
    })
    const crIdList = crIds.map(r => r.id)

    if (crIdList.length > 0) {
      const ccDel = await db.cashCut.deleteMany({
        where: { cashRegId: { in: crIdList } },
      })
      results.cashCuts = ccDel.count
    }

    const crDel = await db.cashRegister.deleteMany({
      where: { userId: uid },
    })
    results.cashRegisters = crDel.count

    // 10. SupplierPayments by this user
    const supPayDel = await db.supplierPayment.deleteMany({
      where: { userId: uid },
    })
    results.supplierPayments = supPayDel.count

    // 11. Expenses by this user
    const exDel = await db.expense.deleteMany({
      where: { userId: uid },
    })
    results.expenses = exDel.count

    // 12. InventoryAdjustments by this user
    const iaDel = await db.inventoryAdjustment.deleteMany({
      where: { userId: uid },
    })
    results.inventoryAdjustments = iaDel.count

    // 13. StockHistory by this user
    const shDel = await db.stockHistory.deleteMany({
      where: { userId: uid },
    })
    results.stockHistory = shDel.count

    // 14. PriceAdjustments by this user
    const paDel = await db.priceAdjustment.deleteMany({
      where: { userId: uid },
    })
    results.priceAdjustments = paDel.count

    // 15. Notifications (CASCADE)
    const notifDel = await db.notification.deleteMany({
      where: { userId: uid },
    })
    results.notifications = notifDel.count

    // 16. AuditLogs (CASCADE)
    const auditDel = await db.auditLog.deleteMany({
      where: { userId: uid },
    })
    results.auditLogs = auditDel.count

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0)

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      deleted: results,
      totalDeleted,
      message: `Se eliminaron ${totalDeleted} registros del usuario "${user.name}"`,
    })
  } catch (error: any) {
    console.error('[clean-cashier-data] Error:', error)
    return NextResponse.json({
      error: 'Error al limpiar datos del cajero',
      details: error?.message || String(error),
    }, { status: 500 })
  }
}
