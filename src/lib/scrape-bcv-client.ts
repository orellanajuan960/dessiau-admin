/**
 * Client-side BCV scraper.
 * Uses Next.js rewrites proxy (/bcv-proxy/) to bypass CORS,
 * then extracts rates from the BCV HTML.
 */

const MIN_RATE = 1
const MAX_RATE = 10000

interface RawRate {
  currency: string
  rate: number
  source: string
}

function isValidRate(v: number): boolean {
  return !isNaN(v) && v >= MIN_RATE && v <= MAX_RATE
}

function parseBcvNumber(raw: string): number | null {
  let cleaned = raw.trim().replace(/\s/g, '')
  const v1 = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
  const v2 = parseFloat(cleaned.replace(',', '.'))
  const candidates = [v1, v2].filter(v => !isNaN(v) && v >= MIN_RATE && v <= MAX_RATE)
  if (candidates.length > 0) return candidates[0]
  if (!isNaN(v1) && v1 >= MIN_RATE && v1 <= MAX_RATE) return v1
  if (!isNaN(v2) && v2 >= MIN_RATE && v2 <= MAX_RATE) return v2
  return null
}

/**
 * Strategy A: Extract rates from <script> blocks (Drupal settings, JS variables)
 */
function extractFromScripts(html: string, results: RawRate[]): void {
  const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
  if (!scriptBlocks) return

  for (const script of scriptBlocks) {
    const jsContent = script.replace(/<\/?script[^>]*>/gi, '')

    // Drupal settings
    const drupalMatch = jsContent.match(/jQuery\.extend\(Drupal\.settings\s*,\s*(\{[\s\S]*?\})\s*\)/)
    if (drupalMatch) {
      const jsonStr = drupalMatch[1]
      const usdMatch = jsonStr.match(/(?:"d[oó]lar"|dolar|"USD"|usd)["\s:=\]]*["\s]*([0-9]+[.,][0-9]+)/i)
      const eurMatch = jsonStr.match(/(?:"euro"|"EUR"|eur)["\s:=\]]*["\s]*([0-9]+[.,][0-9]+)/i)
      if (usdMatch) {
        const v = parseBcvNumber(usdMatch[1])
        if (v && !results.some(r => r.currency === 'USD')) {
          results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'BCV' })
        }
      }
      if (eurMatch) {
        const v = parseBcvNumber(eurMatch[1])
        if (v && !results.some(r => r.currency === 'EUR')) {
          results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'BCV' })
        }
      }
    }

    // Generic JS patterns
    const usdPatterns = [
      /d[oó]lar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
      /USD\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
      /"amount"\s*:\s*"?([0-9]+[,.\d]+)"?/i,
      /tasa_dolar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
      /precio_dolar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
    ]
    const eurPatterns = [
      /euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
      /EUR\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
      /tasa_euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
      /precio_euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
    ]

    for (const p of usdPatterns) {
      if (results.some(r => r.currency === 'USD')) break
      const m = jsContent.match(p)
      if (m) {
        const v = parseBcvNumber(m[1])
        if (v) results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'BCV' })
      }
    }
    for (const p of eurPatterns) {
      if (results.some(r => r.currency === 'EUR')) break
      const m = jsContent.match(p)
      if (m) {
        const v = parseBcvNumber(m[1])
        if (v) results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'BCV' })
      }
    }
  }
}

/**
 * Strategy B: HTML patterns near USD/EUR labels
 */
function extractFromHtml(html: string, results: RawRate[]): void {
  if (!results.some(r => r.currency === 'USD')) {
    const usdHtmlPatterns = [
      /d[oó]lar[^0-9]*([0-9]+[,]\d{2,})/gi,
      /USD[^0-9]*([0-9]+[,]\d{2,})/gi,
      /\$\s*<\/?\w+[^>]*>\s*([0-9]+[,]\d{2,})/gi,
      /data-valor="([0-9]+[,]\d{2,})"/gi,
      /class="[^"]*dolar[^"]*"[^>]*>\s*([0-9]+[,]\d{2,})/gi,
      /id="[^"]*dolar[^"]*"[^>]*>[\s\S]*?([0-9]+[,]\d{2,})/gi,
    ]
    for (const pattern of usdHtmlPatterns) {
      const matches = [...html.matchAll(pattern)]
      for (const match of matches) {
        const value = parseBcvNumber(match[1])
        if (value) {
          results.push({ currency: 'USD', rate: Math.round(value * 100) / 100, source: 'BCV' })
          break
        }
      }
      if (results.some(r => r.currency === 'USD')) break
    }
  }

  if (!results.some(r => r.currency === 'EUR')) {
    const eurHtmlPatterns = [
      /euro[^0-9]*([0-9]+[,]\d{2,})/gi,
      /EUR[^0-9]*([0-9]+[,]\d{2,})/gi,
      /€\s*<\/?\w+[^>]*>\s*([0-9]+[,]\d{2,})/gi,
      /class="[^"]*euro[^"]*"[^>]*>\s*([0-9]+[,]\d{2,})/gi,
    ]
    for (const pattern of eurHtmlPatterns) {
      const matches = [...html.matchAll(pattern)]
      for (const match of matches) {
        const value = parseBcvNumber(match[1])
        if (value) {
          results.push({ currency: 'EUR', rate: Math.round(value * 100) / 100, source: 'BCV' })
          break
        }
      }
      if (results.some(r => r.currency === 'EUR')) break
    }
  }
}

/**
 * Strategy C: Find all comma-decimal numbers, pick largest as likely rates
 */
function extractFromNumbers(html: string, results: RawRate[]): void {
  if (results.some(r => r.currency === 'USD')) return

  const numberPattern = /(\d{2,4},\d{2,8})/g
  const allNumbers: { value: number; index: number }[] = []
  let numMatch: RegExpExecArray | null
  while ((numMatch = numberPattern.exec(html)) !== null) {
    const value = parseBcvNumber(numMatch[1])
    if (value && isValidRate(value)) {
      allNumbers.push({ value, index: numMatch.index })
    }
  }

  // Also find dot-decimal numbers
  const dotPattern = /(\d{2,4}\.\d{2,8})/g
  while ((numMatch = dotPattern.exec(html)) !== null) {
    const value = parseFloat(numMatch[1])
    if (isValidRate(value)) {
      allNumbers.push({ value, index: numMatch.index })
    }
  }

  allNumbers.sort((a, b) => b.value - a.value)
  if (allNumbers.length >= 1) {
    results.push({ currency: 'USD', rate: Math.round(allNumbers[0].value * 100) / 100, source: 'BCV' })
  }
  if (allNumbers.length >= 2 && allNumbers[1].value > allNumbers[0].value * 0.5) {
    results.push({ currency: 'EUR', rate: Math.round(allNumbers[1].value * 100) / 100, source: 'BCV' })
  }
}

/**
 * Fetch BCV page from the user's browser and extract rates.
 * Returns { usd, eur, source } or null if failed.
 */
export async function scrapeBcvFromClient(): Promise<{
  usd: number
  eur: number
  source: string
} | null> {
  const results: RawRate[] = []

  // Use Next.js rewrite proxy to bypass CORS (requests go through our own server)
  const proxyBase = '/bcv-proxy'
  const endpoints = [
    `${proxyBase}/`,
    `${proxyBase}/tasas-informativas-sistema-bancario`,
  ]

  for (const url of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) continue

      const html = await response.text()

      if (html.length < 500) continue // Empty or error page

      // Try all extraction strategies
      extractFromScripts(html, results)
      extractFromHtml(html, results)
      extractFromNumbers(html, results)

      if (results.some(r => r.currency === 'USD')) break
    } catch (error) {
      console.warn(`[BCV Client] ${url} failed:`, error instanceof Error ? error.message : 'Unknown')
      continue
    }
  }

  // If we got USD but not EUR, estimate EUR ≈ USD × 1.17
  const usdRate = results.find(r => r.currency === 'USD')
  let eurRate = results.find(r => r.currency === 'EUR')

  if (usdRate && !eurRate) {
    eurRate = {
      currency: 'EUR',
      rate: Math.round(usdRate.rate * 1.17 * 100) / 100,
      source: `${usdRate.source}-estimado`,
    }
  }

  if (!usdRate) return null

  return {
    usd: usdRate.rate,
    eur: eurRate!.rate,
    source: usdRate.source,
  }
}
