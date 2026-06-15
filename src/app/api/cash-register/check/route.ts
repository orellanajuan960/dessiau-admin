import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/cash-register/check?userId=xxx
// Returns the status of the open register for a specific user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const register = await db.cashRegister.findFirst({
      where: {
        userId,
        status: 'cerrada',
        closingDate: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { closingDate: 'desc' },
      include: {
        user: { select: { name: true } },
        branch: { select: { name: true } },
        cuts: { orderBy: { cutDate: 'desc' }, take: 1 },
      },
    })

    if (register) {
      return NextResponse.json({
        wasClosed: true,
        register: {
          name: register.name,
          branchName: register.branch.name,
          closingDate: register.closingDate,
          actual: register.cuts[0]?.actual || register.currentAmt,
          cutDate: register.cuts[0]?.cutDate || register.closingDate,
        },
      })
    }

    return NextResponse.json({ wasClosed: false })
  } catch (error) {
    return NextResponse.json({ wasClosed: false })
  }
}
