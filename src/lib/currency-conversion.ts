/**
 * Convert an item amount from its own currency to the reference currency.
 *
 * IMPORTANT: Returns FULL precision (no rounding) to avoid round-trip loss
 * when converting VES→USD→VES. Callers should format for display as needed.
 *
 * Scenarios:
 * - Item in reference currency (e.g. USD) → no conversion
 * - Item in local/base currency (e.g. VES) → divide by exchangeRate
 * - Item in EUR when ref is USD → cross-rate via local rates
 * - Item in USD when ref is EUR → cross-rate via local rates
 *
 * exchangeRate = how many local units per 1 reference unit
 * eurRate = how many local units per 1 EUR
 * usdRate = how many local units per 1 USD
 */
export function convertToRefCurrency(
  amount: number,
  itemCurrencyCode: string,
  refCode: string,
  localCode: string,
  exchangeRate: number,
  eurRate: number,
  usdRate: number,
): number {
  if (!itemCurrencyCode || exchangeRate <= 0) return amount

  // Same currency as reference — no conversion needed
  if (itemCurrencyCode === refCode) return amount

  // Item is in local currency (VES, COP, etc.) — convert local → ref
  if (itemCurrencyCode === localCode) {
    return amount / exchangeRate
  }

  // Item is in EUR, ref is USD
  if (itemCurrencyCode === 'EUR' && refCode === 'USD') {
    if (eurRate > 0 && usdRate > 0) {
      return amount * (eurRate / usdRate)
    }
    return amount * 1.17
  }

  // Item is in USD, ref is EUR
  if (itemCurrencyCode === 'USD' && refCode === 'EUR') {
    if (eurRate > 0 && usdRate > 0) {
      return amount * (usdRate / eurRate)
    }
    return amount / 1.17
  }

  // For any other currency, assume it's a local-like currency
  return amount / exchangeRate
}

/**
 * Format a number with full significant precision.
 * Shows up to 6 decimal places but removes unnecessary trailing zeros
 * while keeping at least 2 decimal places.
 *
 * Examples:
 *   14.665549  → "14.665549"
 *   14.670000  → "14.67"
 *   10.000000  → "10.00"
 *   14.665500  → "14.6655"
 */
export function formatRefPrecision(n: number): string {
  const s = n.toFixed(6)
  const dotIdx = s.indexOf('.')
  if (dotIdx === -1) return s + '.00'
  let dec = s.slice(dotIdx + 1)
  // Keep at least 2 decimals, strip trailing zeros beyond that
  while (dec.length > 2 && dec.endsWith('0')) {
    dec = dec.slice(0, -1)
  }
  return s.slice(0, dotIdx + 1) + dec
}

/**
 * Calculate cart totals with per-item currency conversion.
 * Returns { subtotalRef, subtotalLocal } where:
 * - subtotalRef = total in reference currency (USD or EUR) — full precision
 * - subtotalLocal = total in local currency (VES, COP, etc.) — full precision
 *
 * IMPORTANT: Both values return full precision to avoid round-trip loss.
 * Round only for final display/payment as needed.
 */
export function calcCartTotals(items: Array<{
  lineTotal: number
  currencyCode?: string
}>, options: {
  multiEnabled: boolean
  exchangeRate: number
  referenceCurrency: string
  localCode: string
  eurRate: number
  usdRate: number
}): { subtotalRef: number; subtotalLocal: number } {
  if (!options.multiEnabled || options.exchangeRate <= 0) {
    const rawTotal = items.reduce((s, i) => s + i.lineTotal, 0)
    return { subtotalRef: rawTotal, subtotalLocal: rawTotal }
  }

  let ref = 0
  let local = 0
  items.forEach((item) => {
    const itemInRef = convertToRefCurrency(
      item.lineTotal,
      item.currencyCode,
      options.referenceCurrency,
      options.localCode,
      options.exchangeRate,
      options.eurRate,
      options.usdRate,
    )
    ref += itemInRef

    // For local total: sum directly if item is already in local currency
    // to avoid round-trip precision loss (local → ref → local)
    if (item.currencyCode === options.localCode || !item.currencyCode) {
      local += item.lineTotal
    } else {
      local += itemInRef * options.exchangeRate
    }
  })

  return { subtotalRef: ref, subtotalLocal: local }
}