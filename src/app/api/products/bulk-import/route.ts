import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

interface ImportRow {
  name: string
  sku?: string
  price: number
  cost?: number
  stock?: number
  minStock?: number
  category?: string
  currencyCode?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { products, branchId: bodyBranchId, updateExisting = false } = body as {
      products: ImportRow[]
      branchId?: string
      updateExisting?: boolean
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'No se recibieron productos' }, { status: 400 })
    }

    if (products.length > 500) {
      return NextResponse.json({ error: 'Máximo 500 productos por importación' }, { status: 400 })
    }

    const branchId = bodyBranchId || await resolveBranchId()

    // Get base currency
    const baseCurrency = await db.currency.findFirst({ where: { isBase: true } })
    const currencyId = baseCurrency?.id

    if (!currencyId) {
      return NextResponse.json({ error: 'No se encontró moneda base' }, { status: 400 })
    }

    // Pre-fetch all categories and currencies for lookup
    const allCategories = await db.category.findMany({ select: { id: true, name: true } })
    const allCurrencies = await db.currency.findMany({ select: { id: true, code: true } })

    const categoryMap = new Map(allCategories.map(c => [c.name.toLowerCase(), c.id]))
    const currencyMap = new Map(allCurrencies.map(c => [c.code.toLowerCase(), c.id]))

    // Pre-fetch existing SKUs and names for duplicate checking
    const existingProducts = await db.product.findMany({
      select: { id: true, sku: true, name: true },
    })
    const skuSet = new Set(existingProducts.filter(p => p.sku).map(p => p.sku!.toLowerCase()))
    const nameSet = new Set(existingProducts.map(p => p.name.toLowerCase()))

    // Helper: auto-generate SKU from product name (ABC-0001 format)
    function generateAutoSKU(name: string): string {
      const letters = name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 3)
        .padEnd(3, 'X')
      // Find the next available number for this prefix
      let num = 1
      let candidate = `${letters}-${String(num).padStart(4, '0')}`
      while (skuSet.has(candidate.toLowerCase())) {
        num++
        candidate = `${letters}-${String(num).padStart(4, '0')}`
      }
      return candidate
    }

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    // Process in batches of 50 to avoid timeout
    const batchSize = 50
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)

      await db.$transaction(async (tx) => {
        for (const row of batch) {
          try {
            // Validate required fields
            if (!row.name || !row.name.toString().trim()) {
              errors.push(`Fila ${i + batch.indexOf(row) + 1}: Nombre vacío`)
              skipped++
              continue
            }

            const name = row.name.toString().trim()
            let sku = row.sku?.toString().trim() || null

            // Skip products without SKU — user must add it manually to avoid inconsistencies
            if (!sku) {
              errors.push(`Fila ${i + batch.indexOf(row) + 1}: "${name}" omitido — no tiene SKU. Debes asignar un SKU a cada producto.`)
              skipped++
              continue
            }
            const price = parseFloat(String(row.price))
            if (isNaN(price) || price <= 0) {
              errors.push(`Fila ${i + batch.indexOf(row) + 1}: Precio inválido (${row.price})`)
              skipped++
              continue
            }

            const cost = parseFloat(String(row.cost || 0)) || 0
            const stock = parseFloat(String(row.stock || 0)) || 0
            const minStock = parseFloat(String(row.minStock || 0)) || 0

            // Resolve category
            let categoryId: string | null = null
            if (row.category) {
              categoryId = categoryMap.get(row.category.toString().trim().toLowerCase()) || null
              // Auto-create category if it doesn't exist
              if (!categoryId && row.category.toString().trim()) {
                const newCat = await tx.category.create({
                  data: { name: row.category.toString().trim() },
                })
                categoryId = newCat.id
                categoryMap.set(newCat.name.toLowerCase(), newCat.id)
              }
            }

            // Resolve currency
            let resolvedCurrencyId = currencyId
            if (row.currencyCode) {
              resolvedCurrencyId = currencyMap.get(row.currencyCode.toString().trim().toLowerCase()) || currencyId
            }

            // Check for existing product
            const existingBySku = sku ? skuSet.has(sku.toLowerCase()) : false
            const existingByName = nameSet.has(name.toLowerCase())

            if (existingBySku || existingByName) {
              if (updateExisting) {
                // Find the existing product
                const whereClause = sku
                  ? { sku: { equals: sku, mode: 'insensitive' as const } }
                  : { name: { equals: name, mode: 'insensitive' as const } }
                const existing = await tx.product.findFirst({ where: whereClause })
                if (existing) {
                  await tx.product.update({
                    where: { id: existing.id },
                    data: {
                      price,
                      costAvg: cost,
                      categoryId,
                      currencyId: resolvedCurrencyId,
                      active: true,
                    },
                  })
                  // Upsert inventory
                  await tx.inventory.upsert({
                    where: { productId_branchId: { productId: existing.id, branchId } },
                    create: { productId: existing.id, branchId, stock, minStock, price: 0 },
                    update: { stock, minStock },
                  })
                  updated++
                  continue
                }
              } else {
                errors.push(`Fila ${i + batch.indexOf(row) + 1}: "${name}" ya existe (SKU: ${sku || 'sin SKU'})`)
                skipped++
                continue
              }
            }

            // Create new product
            const product = await tx.product.create({
              data: {
                name,
                sku,
                type: 'simple',
                costAvg: cost,
                price,
                currencyId: resolvedCurrencyId,
                categoryId,
                active: true,
              },
            })

            // Create inventory for this branch
            await tx.inventory.create({
              data: {
                productId: product.id,
                branchId,
                stock,
                minStock,
                price: 0,
              },
            })

            // Update lookup sets
            if (sku) skuSet.add(sku.toLowerCase())
            nameSet.add(name.toLowerCase())
            created++
          } catch (err) {
            const rowNum = i + batch.indexOf(row) + 1
            errors.push(`Fila ${rowNum}: Error al procesar "${row.name}"`)
            skipped++
          }
        }
      }, { timeout: 30000 })
    }

    return NextResponse.json({
      created,
      updated,
      skipped,
      errors: errors.slice(0, 20), // Limit error messages
      totalProcessed: products.length,
    })
  } catch (error) {
    console.error('[Bulk Import] Error:', error)
    return NextResponse.json({ error: 'Error al importar productos' }, { status: 500 })
  }
}
