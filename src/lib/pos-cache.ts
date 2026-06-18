/**
 * localStorage cache for POS data that the payment modal needs instantly.
 *
 * Populated on app startup (settings-initializer) and on POS page mount.
 * Updated whenever the user mutates payment methods, currencies, or cash registers.
 */

const PREFIX = 'jo-pos-cache-'

const KEYS = {
  methods: `${PREFIX}methods`,
  currencies: `${PREFIX}currencies`,
  openReg: `${PREFIX}open-reg`,
} as const

// ── Types ───────────────────────────────────────────────────────────

export interface CachedMethod {
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
}

export interface CachedCurrency {
  id: string
  code: string
  symbol: string
  isBase: boolean
}

// ── Getters (return null if not cached) ─────────────────────────────

export function getCachedMethods(): CachedMethod[] | null {
  try {
    const raw = localStorage.getItem(KEYS.methods)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getCachedCurrencies(): CachedCurrency[] | null {
  try {
    const raw = localStorage.getItem(KEYS.currencies)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getCachedOpenRegId(): string | null {
  try {
    const raw = localStorage.getItem(KEYS.openReg)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// ── Setters ─────────────────────────────────────────────────────────

export function setCachedMethods(methods: CachedMethod[]) {
  try {
    localStorage.setItem(KEYS.methods, JSON.stringify(methods))
  } catch {
    // localStorage full or unavailable — silent
  }
}

export function setCachedCurrencies(currencies: CachedCurrency[]) {
  try {
    localStorage.setItem(KEYS.currencies, JSON.stringify(currencies))
  } catch {
    // silent
  }
}

export function setCachedOpenRegId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(KEYS.openReg, JSON.stringify(id))
    } else {
      localStorage.removeItem(KEYS.openReg)
    }
  } catch {
    // silent
  }
}

// ── Bulk helpers ────────────────────────────────────────────────────

/** Clear all POS cache entries */
export function clearPosCache() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
}