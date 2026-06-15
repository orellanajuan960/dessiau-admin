'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { applyBothColors } from '@/components/settings/color-picker'
import { setCustomPermissions, type UserPermissions } from '@/lib/permissions'
import { useTheme } from 'next-themes'
import type { AppSettings } from '@/stores/use-app-store'

/** Update the browser favicon dynamically */
function setFavicon(url: string) {
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (link) {
    link.href = url
  } else {
    const newLink = document.createElement('link')
    newLink.rel = 'icon'
    newLink.href = url
    document.head.appendChild(newLink)
  }
}

interface SettingsData {
  primaryColor: string
  secondaryColor: string
  theme: string
  sessionDuration: number
  notificationsEnabled: boolean
  businessName: string
  logoUrl: string
  phone: string
  email: string
  rif: string
  address: string
  baseCurrencyId: string
  referenceCurrency: string
  usdRate: number
  eurRate: number
  customRate: number
  exchangeRate: number
}

// ── Auto-fetch exchange rates on schedule (Venezuela time) ──

/** Scheduled times in America/Caracas timezone */
const AUTO_FETCH_SCHEDULE = [
  { hour: 8, minute: 30 },   // 8:30 AM
  { hour: 10, minute: 0 },   // 10:00 AM
  { hour: 14, minute: 0 },   // 2:00 PM
  { hour: 16, minute: 0 },   // 4:00 PM
]

const VENEZUELA_TZ = 'America/Caracas'
const AUTO_FETCH_KEY_PREFIX = 'rate-auto-fetch-'
const CHECK_INTERVAL_MS = 30_000 // check every 30 seconds

/** Get current time parts in Venezuela timezone */
function getVenezuelaTimeParts() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VENEZUELA_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  return {
    hour: parseInt(get('hour')) || 0,
    minute: parseInt(get('minute')) || 0,
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/** Build a localStorage key for a specific schedule slot */
function slotKey(dateStr: string, hour: number, minute: number) {
  return `${AUTO_FETCH_KEY_PREFIX}${dateStr}-${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Check if the current time matches any scheduled slot that hasn't fired yet */
function shouldAutoFetch(): string | null {
  const { hour, minute, dateStr } = getVenezuelaTimeParts()
  const nowTotal = hour * 60 + minute

  for (const slot of AUTO_FETCH_SCHEDULE) {
    const key = slotKey(dateStr, slot.hour, slot.minute)
    const slotTotal = slot.hour * 60 + slot.minute
    const diff = nowTotal - slotTotal

    // If we're within a 2-minute window after the scheduled time and haven't fetched yet
    if (diff >= 0 && diff <= 2 && !localStorage.getItem(key)) {
      return key
    }
  }
  return null
}

/** Perform the auto-fetch: scrape BCV from client, then POST to server */
async function performAutoFetch(
  setSettings: (settings: AppSettings) => void,
  sourceLabel: string,
) {
  try {
    let usdRate: number | undefined
    let eurRate: number | undefined
    let source = 'auto-server'

    // 1st: Try client-side BCV scraping (from user's browser in Venezuela)
    try {
      const { scrapeBcvFromClient } = await import('@/lib/scrape-bcv-client')
      const clientRates = await scrapeBcvFromClient()
      if (clientRates) {
        usdRate = clientRates.usd
        eurRate = clientRates.eur
        source = clientRates.source
      }
    } catch {
      console.warn('[Auto-rates] Client-side BCV scraping failed, falling back to server')
    }

    // 2nd: Persist rates to DB
    if (usdRate) {
      await api.post('/api/exchange-rates', {
        usd: usdRate,
        eur: eurRate,
        source: `${sourceLabel}-${source}`,
      })
    } else {
      // Fallback: let server fetch rates
      const data = await api.get<{
        rates: Array<{ currency: string; rate: number; source: string }>
      }>('/api/exchange-rates')
      if (data?.rates?.length > 0) {
        const foundUsd = data.rates.find((r) => r.currency === 'USD')
        const foundEur = data.rates.find((r) => r.currency === 'EUR')
        if (foundUsd) {
          usdRate = foundUsd.rate
          eurRate = foundEur?.rate
          source = foundUsd.source
          // POST to persist in Settings table
          await api.post('/api/exchange-rates', {
            usd: usdRate,
            eur: eurRate,
            source: `${sourceLabel}-server`,
          })
        }
      }
    }

    // 3rd: Update Zustand store so POS/dashboard picks up new rates immediately
    if (usdRate) {
      const currentSettings = useAppStore.getState().settings
      if (currentSettings) {
        const updates: Partial<AppSettings> = { usdRate }
        if (eurRate) updates.eurRate = eurRate
        if (!currentSettings.customRate) {
          const refCurrency = currentSettings.referenceCurrency || 'USD'
          updates.exchangeRate =
            refCurrency === 'EUR' && eurRate ? eurRate : usdRate
        }
        setSettings({ ...currentSettings, ...updates })
      }
    }

    const timeStr = new Date().toLocaleString('es-VE', { timeZone: VENEZUELA_TZ })
    console.log(`[Auto-rates] Tasas actualizadas automaticamente a las ${timeStr} (fuente: ${source})`)
  } catch (error) {
    console.error('[Auto-rates] Error en actualizacion automatica:', error)
  }
}

/**
 * Loads settings from DB on app startup and applies theme colors to CSS variables.
 * Also sets up a scheduler for automatic exchange rate updates (4x/day).
 */
export function SettingsInitializer() {
  const setSettings = useAppStore((s) => s.setSettings)
  const { setTheme } = useTheme()

  useEffect(() => {
    async function loadAndApplySettings() {
      try {
        const s = await api.get<SettingsData>('/api/settings')
        if (s) {
          setSettings(s as AppSettings)

          // Apply both colors at once via <style> injection (reliable method)
          applyBothColors(s.primaryColor || 'blue', s.secondaryColor || 'slate')

          // Apply theme from DB only if next-themes hasn't already set one
          const nextThemesValue = localStorage.getItem('theme')
          if (nextThemesValue) {
            setTheme(nextThemesValue)
          } else if (s.theme) {
            setTheme(s.theme)
          }

          // Update page title
          if (s.businessName) {
            document.title = `${s.businessName} - ERP/POS`
          }

          // Update favicon with company logo
          if (s.logoUrl) {
            setFavicon(s.logoUrl)
          }
        }

        // Load custom role permissions from the database
        api.get<{ permissions: Record<string, UserPermissions> }>('/api/role-permissions')
          .then((data) => {
            if (data?.permissions && Object.keys(data.permissions).length > 0) {
              setCustomPermissions(data.permissions)
            }
          })
          .catch(() => {})
      } catch {
        // Silently fail — use defaults from globals.css
      }
    }

    loadAndApplySettings()

    // ── Scheduled auto-fetch for exchange rates ──
    function tick() {
      const settings = useAppStore.getState().settings
      if (!settings?.multiCurrencyEnabled) return

      const key = shouldAutoFetch()
      if (key) {
        // Mark this slot as fulfilled
        localStorage.setItem(key, new Date().toISOString())
        performAutoFetch(setSettings, 'auto')
      }
    }

    // Check immediately on load (in case a scheduled slot was just missed)
    tick()

    // Then check every 30 seconds
    const interval = setInterval(tick, CHECK_INTERVAL_MS)

    // Re-apply colors when theme changes (dark <-> light)
    const observer = new MutationObserver(() => {
      const settings = useAppStore.getState().settings
      if (settings) {
        applyBothColors(settings.primaryColor || 'blue', settings.secondaryColor || 'slate')
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [setSettings, setTheme])

  return null
}
