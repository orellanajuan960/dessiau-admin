/**
 * Shared helper to determine payment method behavior from DB.
 * Falls back to hardcoded values for backward compatibility.
 */

import { db } from './db'

export interface PaymentMethodRecord {
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
  sortOrder: number
  countries: string
}

// In-memory cache to avoid hitting DB on every sale
let _cache: PaymentMethodRecord[] | null = null
let _cacheTs = 0
const CACHE_TTL = 30_000 // 30 seconds

export async function getPaymentMethodsFromDB(): Promise<PaymentMethodRecord[]> {
  const now = Date.now()
  if (_cache && now - _cacheTs < CACHE_TTL) return _cache

  try {
    const rows = await db.paymentMethod.findMany({ orderBy: { sortOrder: 'asc' } })
    _cache = rows.map((r) => ({
      code: r.code,
      name: r.name,
      icon: r.icon || 'Banknote',
      enabled: r.enabled,
      needsReference: r.needsReference,
      isLocalCurrency: r.isLocalCurrency,
      isCash: r.isCash,
      isCredit: r.isCredit,
      sortOrder: r.sortOrder,
      countries: r.countries,
    }))
    _cacheTs = now
    return _cache!
  } catch {
    return []
  }
}

/** Invalidate the cache (call after updating payment methods) */
export function invalidatePaymentMethodsCache() {
  _cache = null
  _cacheTs = 0
}

// Fallback defaults for when the DB table doesn't exist yet
export const FALLBACK_METHODS: PaymentMethodRecord[] = [
  { code: 'divisas', name: 'Divisas', icon: 'Banknote', enabled: true, needsReference: false, isLocalCurrency: false, isCash: false, isCredit: false, sortOrder: 0, countries: 'ALL' },
  { code: 'efectivo', name: 'Efectivo', icon: 'Banknote', enabled: true, needsReference: false, isLocalCurrency: true, isCash: true, isCredit: false, sortOrder: 1, countries: 'ALL' },
  { code: 'pago_movil', name: 'Pago Móvil', icon: 'Smartphone', enabled: true, needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 2, countries: 'VE' },
  { code: 'tarjeta', name: 'Tarjeta', icon: 'CreditCard', enabled: true, needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 3, countries: 'ALL' },
  { code: 'transferencia', name: 'Transferencia', icon: 'ArrowLeftRight', enabled: true, needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 4, countries: 'ALL' },
  { code: 'credito', name: 'Crédito', icon: 'Clock', enabled: true, needsReference: false, isLocalCurrency: false, isCash: false, isCredit: true, sortOrder: 5, countries: 'ALL' },
]