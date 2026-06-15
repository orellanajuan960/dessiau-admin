'use client'

import { useAppStore, useSetting } from '@/stores/use-app-store'
import { getCurrencySymbol, formatAmount } from '@/lib/currency'
import { getCurrencyForCountry } from '@/lib/country-currency'

/**
 * Centralized hook for currency operations in client components.
 *
 * When multiCurrencyEnabled is OFF:
 *   - sym = local currency symbol (Bs., COL$, etc.)
 *   - rate = 1 (no conversion)
 *   - fmt/fmtBase both show local currency
 *   - toBase/fromBase are identity (no-op)
 *
 * When multiCurrencyEnabled is ON:
 *   - sym = reference currency symbol ($, €, etc.)
 *   - rate = exchange rate
 *   - fmt shows reference, fmtBase shows local
 *   - toBase/fromBase convert between them
 */
export function useCurrency() {
  const settings = useAppStore((s) => s.settings)
  const refCode = useSetting('referenceCurrency')
  const multiEnabled = useSetting('multiCurrencyEnabled')
  const country = useSetting('country')
  const rateSetting = useSetting('exchangeRate')

  // Derive local currency from country
  const localInfo = getCurrencyForCountry(country)

  // When multi-currency is OFF, everything is in local currency
  const effectiveRefCode = multiEnabled ? refCode : (localInfo?.code || refCode)
  const effectiveRate = multiEnabled ? rateSetting : 1

  const sym = getCurrencySymbol(effectiveRefCode)
  const baseSym = localInfo?.symbol || '$'

  /** Format amount in the effective currency (ref when multi, local when mono) */
  const fmt = (amount: number, decimals = 2): string => {
    return `${sym}${formatAmount(amount, decimals)}`
  }

  /** Format amount in base/local currency */
  const fmtBase = (amount: number, decimals = 2): string => {
    return `${baseSym}${formatAmount(amount, decimals)}`
  }

  /** Format amount in a specific currency code */
  const fmtWith = (amount: number, code?: string | null, decimals = 2): string => {
    const s = getCurrencySymbol(code)
    return `${s}${formatAmount(amount, decimals)}`
  }

  /** Convert effective currency → base (only when multi-currency is ON) */
  const toBase = (amount: number): number => {
    if (!multiEnabled || !effectiveRate || effectiveRate <= 0) return amount
    return Math.round(amount * effectiveRate * 100) / 100
  }

  /** Convert base → effective currency (only when multi-currency is ON) */
  const fromBase = (amount: number): number => {
    if (!multiEnabled || !effectiveRate || effectiveRate <= 0) return amount
    return Math.round((amount / effectiveRate) * 100) / 100
  }

  return {
    sym,
    refCode: effectiveRefCode,
    baseCode: localInfo?.code || '',
    baseSym,
    rate: effectiveRate,
    multiEnabled,
    localCode: localInfo?.code || '',
    fmt,
    fmtBase,
    fmtWith,
    toBase,
    fromBase,
  }
}