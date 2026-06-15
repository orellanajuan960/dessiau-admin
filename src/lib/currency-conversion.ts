/**
 * Convert an item amount from its own currency to the reference currency.
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
    return Math.round((amount / exchangeRate) * 100) / 100
  }

  // Item is in EUR, ref is USD
  if (itemCurrencyCode === 'EUR' && refCode === 'USD') {
    if (eurRate > 0 && usdRate > 0) {
      // 1 EUR = eurRate local, 1 USD = usdRate local
      // So 1 EUR = (eurRate / usdRate) USD
      return Math.round(amount * (eurRate / usdRate) * 100) / 100
    }
    // Fallback: treat EUR ≈ 1.17 USD
    return Math.round(amount * 1.17 * 100) / 100
  }

  // Item is in USD, ref is EUR
  if (itemCurrencyCode === 'USD' && refCode === 'EUR') {
    if (eurRate > 0 && usdRate > 0) {
      return Math.round(amount * (usdRate / eurRate) * 100) / 100
    }
    return Math.round((amount / 1.17) * 100) / 100
  }

  // For any other currency, assume it's a local-like currency
  return Math.round((amount / exchangeRate) * 100) / 100
}

/**
 * Calculate cart totals with per-item currency conversion.
 * Returns { subtotalRef, subtotalLocal } where:
 * - subtotalRef = total in reference currency (USD or EUR)
 * - subtotalLocal = total in local currency (VES, COP, etc.)
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
  })
  ref = Math.round(ref * 100) / 100
  return { subtotalRef: ref, subtotalLocal: Math.round(ref * options.exchangeRate * 100) / 100 }
}