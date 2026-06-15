/**
 * Country → Local Currency mapping.
 * When the user changes the country in Settings, the system auto-creates
 * the corresponding local currency if it doesn't exist.
 */

export interface CountryCurrency {
  code: string
  name: string
  symbol: string
}

// ISO 3166-1 alpha-2 → currency
const COUNTRY_CURRENCY_MAP: Record<string, CountryCurrency> = {
  VE: { code: 'VES', name: 'Bol\u00EDvar Venezolano', symbol: 'Bs.' },
  CO: { code: 'COP', name: 'Peso Colombiano', symbol: 'COL$' },
  MX: { code: 'MXN', name: 'Peso Mexicano', symbol: 'MX$' },
  AR: { code: 'ARS', name: 'Peso Argentino', symbol: 'AR$' },
  PE: { code: 'PEN', name: 'Sol Peruano', symbol: 'S/' },
  CL: { code: 'CLP', name: 'Peso Chileno', symbol: 'CLP$' },
  BR: { code: 'BRL', name: 'Real Brasile\u00F1o', symbol: 'R$' },
  EC: { code: 'USD', name: 'D\u00F3lar Estadounidense', symbol: '$' },   // Ecuador uses USD
  PA: { code: 'USD', name: 'D\u00F3lar Estadounidense', symbol: '$' },   // Panama uses USD
  SV: { code: 'USD', name: 'D\u00F3lar Estadounidense', symbol: '$' },   // El Salvador uses USD
  US: { code: 'USD', name: 'D\u00F3lar Estadounidense', symbol: '$' },
  ES: { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  DE: { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  FR: { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  IT: { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  GB: { code: 'GBP', name: 'Libra Esterlina', symbol: '\u00A3' },
  PY: { code: 'PYG', name: 'Guaran\u00ED Paraguayo', symbol: '\u20B2' },
  UY: { code: 'UYU', name: 'Peso Uruguayo', symbol: 'UYU$' },
  BO: { code: 'BOB', name: 'Boliviano', symbol: 'Bs.' },
  DO: { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  GT: { code: 'GTQ', name: 'Quetzal Guatemalteco', symbol: 'Q' },
  HN: { code: 'HNL', name: 'Lempira Hondure\u00F1o', symbol: 'L' },
  NI: { code: 'NIO', name: 'C\u00F3rdoba Nicarag\u00FCense', symbol: 'C$' },
  CR: { code: 'CRC', name: 'Col\u00F3n Costarricense', symbol: '\u20A1' },
  CU: { code: 'CUP', name: 'Peso Cubano', symbol: '$MN' },
  JP: { code: 'JPY', name: 'Yen Japon\u00E9s', symbol: '\u00A5' },
  CN: { code: 'CNY', name: 'Yuan Chino', symbol: '\u00A5' },
  CA: { code: 'CAD', name: 'D\u00F3lar Canadiense', symbol: 'C$' },
  AU: { code: 'AUD', name: 'D\u00F3lar Australiano', symbol: 'A$' },
  CH: { code: 'CHF', name: 'Franco Suizo', symbol: 'CHF' },
  TR: { code: 'TRY', name: 'Lira Turca', symbol: '\u20BA' },
  IN: { code: 'INR', name: 'Rupia India', symbol: '\u20B9' },
}

/** Get the local currency info for a country code */
export function getCurrencyForCountry(countryCode: string): CountryCurrency | null {
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()] || null
}

/** Get the local currency symbol for a country */
export function getLocalSymbol(countryCode: string): string {
  const c = getCurrencyForCountry(countryCode)
  return c?.symbol || '$'
}

/** List all supported countries with their currency info */
export function getAllCountryCurrencies(): { country: string; currency: CountryCurrency }[] {
  return Object.entries(COUNTRY_CURRENCY_MAP).map(([country, currency]) => ({
    country,
    currency,
  }))
}