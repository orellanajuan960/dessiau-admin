import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'
import { getCurrencyForCountry } from '@/lib/country-currency'

export async function GET() {
  try {
    // Get the single settings row (firstOrCreate pattern)
    let settings = await db.settings.findFirst()
    if (!settings) {
      settings = await db.settings.create({
        data: {
          key: 'general',
          businessName: 'JO-Administrativo',
          logoUrl: '',
          address: '',
          phone: '',
          rif: '',
          email: '',
          baseCurrencyId: '',
          sessionDuration: 28800,
          notificationsEnabled: true,
          primaryColor: 'blue',
          secondaryColor: 'slate',
          theme: 'light',
          referenceCurrency: 'USD',
          usdRate: 0,
          eurRate: 0,
          customRate: 0,
          exchangeRate: 36.50,
        },
      })
    }
    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener configuraci\u00F3n' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const body = await request.json()

    // If country is changing, auto-create/update the local currency
    if (body.country) {
      const localCurrency = getCurrencyForCountry(body.country)
      if (localCurrency) {
        // Upsert the local currency
        const currency = await db.currency.upsert({
          where: { code: localCurrency.code },
          create: {
            code: localCurrency.code,
            name: localCurrency.name,
            symbol: localCurrency.symbol,
            isBase: true,
          },
          update: {
            name: localCurrency.name,
            symbol: localCurrency.symbol,
            isBase: true,
          },
        })

        // Set all other currencies as non-base
        await db.currency.updateMany({
          where: { id: { not: currency.id } },
          data: { isBase: false },
        })

        // Update baseCurrencyId to point to this currency
        body.baseCurrencyId = currency.id

        // When multi-currency is disabled, also set referenceCurrency to local
        const currentSettings = await db.settings.findFirst()
        if (!currentSettings?.multiCurrencyEnabled) {
          body.referenceCurrency = localCurrency.code
        }
      }
    }

    // If multi-currency is being enabled, ensure USD and EUR exist in the DB
    if (body.multiCurrencyEnabled === true) {
      const referenceCurrencies = [
        { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
      ]
      for (const rc of referenceCurrencies) {
        const exists = await db.currency.findUnique({ where: { code: rc.code } })
        if (!exists) {
          await db.currency.create({ data: { ...rc, isBase: false } })
        }
      }
    }

    // If multi-currency is being disabled, reset reference currency to local
    if (body.multiCurrencyEnabled === false) {
      const settings = await db.settings.findFirst()
      if (settings?.country) {
        const localCurrency = getCurrencyForCountry(settings.country)
        if (localCurrency) {
          body.referenceCurrency = localCurrency.code
          body.exchangeRate = 1
        }
      }
    }

    let settings = await db.settings.findFirst()
    if (!settings) {
      settings = await db.settings.create({
        data: body,
      })
    } else {
      settings = await db.settings.update({
        where: { id: settings.id },
        data: body,
      })
    }

    // Log which fields changed (excluding sensitive data)
    const changedFields = Object.keys(body).filter(k => !['id', 'createdAt', 'updatedAt'].includes(k))
    logAction({
      action: 'update',
      entity: 'settings',
      entityId: settings.id,
      details: { summary: `Configuraci\u00F3n actualizada: ${changedFields.join(', ')}`, fields: changedFields },
      request: request as any,
    })

    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json({ error: 'Error al guardar configuraci\u00F3n' }, { status: 500 })
  }
}