import { db } from '@/lib/db'

async function seed() {
  try {
    // Check if any branch exists
    const existingBranch = await db.branch.findFirst()
    if (existingBranch) {
      console.log('Branch already exists, skipping seed.')
      return
    }

    // Create default main branch
    const branch = await db.branch.create({
      data: {
        name: 'Sucursal Principal',
        code: 'sucursal-1',
        active: true,
        isMain: true,
      },
    })
    console.log(`Created default branch: ${branch.name} (${branch.id})`)

    // Update existing inventory records to reference the new branch
    const result = await db.inventory.updateMany({
      where: { branchId: 'sucursal-1' },
      data: { branchId: branch.id },
    })
    console.log(`Updated ${result.count} inventory records to use branch ID: ${branch.id}`)

    // Update existing sale records
    const salesResult = await db.sale.updateMany({
      where: { branchId: 'sucursal-1' },
      data: { branchId: branch.id },
    })
    console.log(`Updated ${salesResult.count} sale records`)

    // Update existing purchase records
    const purchasesResult = await db.purchase.updateMany({
      where: { branchId: 'sucursal-1' },
      data: { branchId: branch.id },
    })
    console.log(`Updated ${purchasesResult.count} purchase records`)

    // Update existing cash register records
    const cashResult = await db.cashRegister.updateMany({
      where: { branchId: 'sucursal-1' },
      data: { branchId: branch.id },
    })
    console.log(`Updated ${cashResult.count} cash register records`)

    // Update existing expense records
    const expenseResult = await db.expense.updateMany({
      where: { branchId: 'sucursal-1' },
      data: { branchId: branch.id },
    })
    console.log(`Updated ${expenseResult.count} expense records`)

    // Update existing inventory adjustment records
    const adjResult = await db.inventoryAdjustment.updateMany({
      where: { branchId: 'sucursal-1' },
      data: { branchId: branch.id },
    })
    console.log(`Updated ${adjResult.count} inventory adjustment records`)

    console.log('Seed completed successfully!')
  } catch (error) {
    console.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

seed()
