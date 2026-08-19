/**
 * localStorage cache for POS data that the payment modal needs instantly.
 *
 * Populated on app startup (settings-initializer) and on POS page mount.
 * Updated whenever the user mutates payment methods, currencies, or cash registers.
 *
 * Cash register ID is stored PER BRANCH so each branch uses its own register.
 */

const PREFIX = 'jo-pos-cache-'

// Clean up legacy key (without branch suffix) on first import
if (typeof window !== 'undefined') {
  try { localStorage.removeItem(`${PREFIX}open-reg`) } catch { /* ignore */ }
}

const KEYS = {
  methods: `${PREFIX}methods`,
  currencies: `${PREFIX}currencies`,
  // openReg key is built dynamically with branchId suffix
  openRegPrefix: `${PREFIX}open-reg-`,
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

/**
 * Get cached open cash register ID for a specific branch.
 * Each branch stores its own register ID to prevent cross-branch contamination.
 */
export function getCachedOpenRegId(branchId?: string | null): string | null {
  try {
    const key = branchId ? `${KEYS.openRegPrefix}${branchId}` : `${KEYS.openRegPrefix}default`
    const raw = localStorage.getItem(key)
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

/**
 * Cache the open cash register ID for a specific branch.
 */
export function setCachedOpenRegId(id: string | null, branchId?: string | null) {
  try {
    const key = branchId ? `${KEYS.openRegPrefix}${branchId}` : `${KEYS.openRegPrefix}default`
    if (id) {
      localStorage.setItem(key, JSON.stringify(id))
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // silent
  }
}

// ── Bulk helpers ────────────────────────────────────────────────────

/** Clear all POS cache entries (including per-branch register IDs) */
export function clearPosCache() {
  localStorage.removeItem(KEYS.methods)
  localStorage.removeItem(KEYS.currencies)
  // Remove all branch-specific register cache entries
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(KEYS.openRegPrefix)) keysToRemove.push(k)
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))
}
