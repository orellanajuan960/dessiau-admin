import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const product = await db.product.findUnique({
      where: { id },
      include: {
        currency: true,
        category: true,
        inventories: true,
        recipeAsParent: {
          include: {
            componentProduct: {
              include: { currency: true, inventories: true },
            },
          },
        },
        saleLines: { take: 5, orderBy: { sale: { date: 'desc' } }, include: { sale: { select: { date: true, total: true } } } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener producto' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageProducts) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    // Validate SKU uniqueness (exclude current product)
    if (body.sku && body.sku.trim()) {
      const existing = await db.product.findFirst({
        where: {
          sku: { equals: body.sku.trim(), mode: 'insensitive' },
          id: { not: id },
        },
        select: { id: true, name: true, sku: true },
      })
      if (existing) {
        return NextResponse.json(
          { error: `El SKU "${body.sku.trim()}" ya está en uso por el producto "${existing.name}"` },
          { status: 409 }
        )
      }
    }

    // Handle per-branch disable via inventory
    if (body.disableInBranch && body.branchId) {
      const inventory = await db.inventory.findFirst({
        where: { productId: id, branchId: body.branchId },
      })
      if (inventory) {
        await db.inventory.update({
          where: { id: inventory.id },
          data: { stock: 0 }, // Set stock to 0 to effectively disable in this branch
        })
      }
      const product = await db.product.findUnique({
        where: { id },
        include: { currency: true, category: true, inventories: true },
      })
      return NextResponse.json(product)
    }

    // Handle per-branch enable via inventory
    if (body.enableInBranch && body.branchId) {
      const inventory = await db.inventory.findFirst({
        where: { productId: id, branchId: body.branchId },
      })
      if (inventory) {
        await db.inventory.update({
          where: { id: inventory.id },
          data: { stock: body.stock !== undefined ? body.stock : 1 },
        })
      }
      const product = await db.product.findUnique({
        where: { id },
        include: { currency: true, category: true, inventories: true },
      })
      return NextResponse.json(product)
    }

    // Build update data — keep existing currencyId if not provided
    const updateData: Record<string, unknown> = {
      name: body.name,
      sku: body.sku || null,
      type: body.type,
      costAvg: body.costAvg,
      price: body.price,
      categoryId: body.categoryId || null,
      imageUrl: body.imageUrl || '',
      active: body.active,
    }

    // Handle currencyId: only update if explicitly provided, otherwise keep current
    if (body.currencyId !== undefined) {
      updateData.currencyId = body.currencyId
    } else if (!body.enableInBranch && !body.disableInBranch) {
      // No currencyId sent and not a branch toggle — ensure product has a valid currency
      const existing = await db.product.findUnique({ where: { id }, select: { currencyId: true } })
      if (!existing?.currencyId) {
        const settings = await db.settings.findFirst()
        if (settings?.baseCurrencyId) {
          updateData.currencyId = settings.baseCurrencyId
        } else {
          const baseCurrency = await db.currency.findFirst({ where: { isBase: true } })
          if (baseCurrency) updateData.currencyId = baseCurrency.id
        }
      }
    }

    const product = await db.product.update({
      where: { id },
      data: updateData,
      include: {
        currency: true,
        category: true,
        inventories: true,
      },
    })

    // Update inventory if stock or minStock provided
    if (body.initialStock !== undefined || body.minStock !== undefined || body.branchPrice !== undefined) {
      const branchId = body.branchId || await resolveBranchId()
      const inventory = await db.inventory.findFirst({
        where: { productId: id, branchId },
      })
      if (inventory) {
        const updateData: Record<string, number> = {}
        if (body.initialStock !== undefined) updateData.stock = body.initialStock
        if (body.minStock !== undefined) updateData.minStock = body.minStock
        if (body.branchPrice !== undefined) updateData.price = body.branchPrice
        await db.inventory.update({
          where: { id: inventory.id },
          data: updateData,
        })
      } else if (body.branchId) {
        await db.inventory.create({
          data: {
            productId: id,
            branchId: body.branchId,
            stock: body.initialStock ?? 0,
            minStock: body.minStock ?? 0,
            price: body.branchPrice ?? 0,
          },
        })
      }
    }

    return NextResponse.json(product)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'El SKU ya existe en la base de datos' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Error al actualizar producto' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageProducts) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { id } = await params
    const url = new URL(request.url)
    const hardDelete = url.searchParams.get('hard') === 'true'

    if (hardDelete) {
      // Check for dependencies before hard delete
      const saleLines = await db.saleLine.count({ where: { productId: id } })
      const purchaseLines = await db.purchaseLine.count({ where: { productId: id } })
      const recipeParent = await db.recipeComponent.count({ where: { parentProductId: id } })
      const recipeComponent = await db.recipeComponent.count({ where: { componentProductId: id } })
      const inventoryCount = await db.inventory.count({ where: { productId: id } })
      const adjustmentLines = await db.inventoryAdjustmentLine.count({ where: { productId: id } })

      const dependencies: string[] = []
      if (saleLines > 0) dependencies.push(`${saleLines} línea(s) de venta`)
      if (purchaseLines > 0) dependencies.push(`${purchaseLines} línea(s) de compra`)
      if (recipeParent > 0) dependencies.push(`${recipeParent} receta(s) como producto padre`)
      if (recipeComponent > 0) dependencies.push(`${recipeComponent} receta(s) como componente`)
      if (inventoryCount > 0) dependencies.push(`${inventoryCount} inventario(s)`)
      if (adjustmentLines > 0) dependencies.push(`${adjustmentLines} ajuste(s) de inventario`)

      if (dependencies.length > 0) {
        return NextResponse.json(
          {
            error: 'No se puede eliminar el producto porque tiene registros asociados.',
            dependencies,
            canHardDelete: false,
          },
          { status: 409 }
        )
      }

      // Safe to hard delete
      await db.product.delete({ where: { id } })
      return NextResponse.json({ success: true, message: 'Producto eliminado permanentemente' })
    }

    // Default: soft delete
    const product = await db.product.update({
      where: { id },
      data: { active: false },
    })
    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 })
  }
}
