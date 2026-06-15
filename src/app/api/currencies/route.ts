import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

const REFERENCE_CURRENCIES = [
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
]

export async function GET() {
  try {
    // If multi-currency is enabled but USD/EUR don't exist, auto-create them
    const settings = await db.settings.findFirst()
    if (settings?.multiCurrencyEnabled) {
      for (const rc of REFERENCE_CURRENCIES) {
        const exists = await db.currency.findUnique({ where: { code: rc.code } })
        if (!exists) {
          await db.currency.create({ data: { ...rc, isBase: false } })
        }
      }
    }

    const currencies = await db.currency.findMany({
      include: {
        exchangeRatesTo: {
          where: { fromCurrency: { isBase: true } },
          orderBy: { date: 'desc' },
          take: 1,
          include: { fromCurrency: true },
        },
      },
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
    })
    return NextResponse.json(currencies)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener monedas' }, { status: 500 })
  }
}