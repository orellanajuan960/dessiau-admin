/**
 * Backfill script: populate SaleLine.currencyCode from the product's currency.
 *
 * Run once after deploying the schema change (prisma db push).
 *
 * Usage: npx tsx prisma/backfill-sale-line-currency.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('Backfilling SaleLine.currencyCode from Product.currency ...')

  // Fetch all SaleLines that have an empty currencyCode, joined with their product's currency
  const lines = await db.saleLine.findMany({
    where: {
      OR: [
        { currencyCode: '' },
        { currencyCode: { notIn: ['USD', 'EUR', 'VES', 'COP', 'BRL', 'PEN', 'CLP', 'MXN', 'ARS', 'TRY', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'GBP'] } },
      ],
    },
    select: {
      id: true,
      product: {
        select: {
          currency: {
            select: { code: true },
          },
        },
      },
    },
  })

  console.log(`Found ${lines.length} SaleLines to update`)

  let updated = 0
  for (const line of lines) {
    const code = line.product?.currency?.code || ''
    if (code) {
      await db.saleLine.update({
        where: { id: line.id },
        data: { currencyCode: code },
      })
      updated++
    }
  }

  console.log(`Updated ${updated} SaleLines with their product's currency code`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())