/**
 * Centralized currency utilities for JO-Administrativo.
 * Both server-side (API routes) and client-side (components) helpers.
 */

// ─── Currency code → symbol map ────────────────────────────────────────────
const SYMBOL_MAP: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  COP: 'COL$',
  VES: 'Bs.',
  BRL: 'R$',
  PEN: 'S/',
  CLP: 'CLP$',
  MXN: 'MX$',
  ARS: 'AR$',
  TRY: '\u20BA',
  JPY: '\u00A5',
  CNY: '\u00A5',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
}

/** Get the symbol for a currency code. Falls back to the code itself. */
export function getCurrencySymbol(code?: string | null): string {
  if (!code) return '$'
  return SYMBOL_MAP[code.toUpperCase()] || `${code} `
}

// ─── Format amount with symbol ────────────────────────────────────────────
export function formatCurrency(amount: number, code?: string | null, decimals = 2): string {
  const safe = (amount == null || isNaN(amount)) ? 0 : amount
  const sym = getCurrencySymbol(code)
  return `${sym}${safe.toFixed(decimals)}`
}

// ─── Locale-aware formatting (es-VE) ──────────────────────────────────────
export function formatAmount(amount: number, decimals = 2): string {
  const safe = (amount == null || isNaN(amount)) ? 0 : amount
  return safe.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatCurrencyLocale(amount: number, code?: string | null, decimals = 2): string {
  const sym = getCurrencySymbol(code)
  return `${sym}${formatAmount(amount, decimals)}`
}

// ─── React hook: useCurrency (client-side) ────────────────────────────────
// Import this in components: import { useCurrency } from '@/lib/currency'
//
// This file contains pure functions. The hook version lives in
// src/hooks/use-currency.ts so it can import from zustand without
// creating circular deps in server-side code.

// ─── Server-side helpers for API routes ───────────────────────────────────

interface MinimalSettings {
  referenceCurrency?: string | null
  baseCurrencyId?: string | null
  exchangeRate?: number | null
}

/** Return the reference currency symbol from settings (server-side). */
export function refSymbol(settings: MinimalSettings): string {
  return getCurrencySymbol(settings.referenceCurrency)
}

/** Return the base currency symbol. Requires looking up the Currency table. */
export function baseSymbol(baseCurrencyCode?: string | null): string {
  return getCurrencySymbol(baseCurrencyCode)
}

/** Convert from reference currency to base (local) currency using the active rate. */
export function toBaseCurrency(amount: number, rate: number): number {
  if (!rate || rate <= 0) return amount
  return Math.round(amount * rate * 100) / 100
}

/** Convert from base (local) currency to reference currency. */
export function fromBaseCurrency(amount: number, rate: number): number {
  if (!rate || rate <= 0) return amount
  return Math.round((amount / rate) * 100) / 100
}
