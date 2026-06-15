import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const active = searchParams.get('active')
    const queryBranchId = searchParams.get('branchId')
    const allInventories = searchParams.get('allInventories') === 'true'

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
      ]
    }
    if (categoryId) {
      where.categoryId = categoryId
    }
    if (active === 'true') {
      where.active = true
    } else if (active === 'false') {
      where.active = false
    }

    // Use query-provided branchId if available, otherwise resolve from cookie/DB
    const branchId = queryBranchId || await resolveBranchId(request)

    const products = await db.product.findMany({
      where,
      include: {
        currency: true,
        category: true,
        inventories: allInventories
          ? { include: { branch: { select: { id: true, name: true } } } }
          : { where: { branchId } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ products, branchId })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageProducts) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()

    // Validate SKU uniqueness
    if (body.sku && body.sku.trim()) {
      const existing = await db.product.findFirst({
        where: { sku: { equals: body.sku.trim(), mode: 'insensitive' } },
        select: { id: true, name: true, sku: true },
      })
      if (existing) {
        return NextResponse.json(
          { error: `El SKU "${body.sku.trim()}" ya está en uso por el producto "${existing.name}"` },
          { status: 409 }
        )
      }
    }

    // Default currencyId to the base currency from settings if not provided
    let currencyId = body.currencyId
    if (!currencyId) {
      const settings = await db.settings.findFirst()
      if (settings?.baseCurrencyId) {
        currencyId = settings.baseCurrencyId
      } else {
        // Fallback: find any base currency or first currency
        const baseCurrency = await db.currency.findFirst({ where: { isBase: true } })
        currencyId = baseCurrency?.id || ''
      }
    }

    const product = await db.product.create({
      data: {
        name: body.name,
        sku: body.sku || null,
        type: body.type || 'simple',
        costAvg: body.costAvg || 0,
        price: body.price,
        currencyId,
        categoryId: body.categoryId || null,
        imageUrl: body.imageUrl || '',
      },
      include: { currency: true, category: true },
    })

    // Create inventory entry for the current branch
    const branchId = body.branchId || await resolveBranchId()
    await db.inventory.create({
      data: {
        productId: product.id,
        branchId,
        stock: body.initialStock ?? 0,
        minStock: body.minStock ?? 0,
        price: body.branchPrice ?? 0,
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'El SKU ya existe en la base de datos' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 })
  }
}
