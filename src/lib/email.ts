import { Resend } from 'resend'
import { formatCurrency } from '@/lib/currency'

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashCloseData {
  cashierName: string
  registerName: string | null
  branchName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  expected: number
  actual: number
  difference: number
  totalSales: number
  totalExpenses: number
  totalRetiros: number
  salesCount?: number
  ivaEnabled?: boolean
  ivaRate?: number
}

interface CashCloseDataWithPDF extends CashCloseData {
  pdfBuffer: Buffer
}

interface CashCloseAllData {
  registersCount: number
  cuts: CashCloseData[]
  pdfBuffer: Buffer
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdminEmail(): Promise<string | null> {
  const { db } = await import('@/lib/db')
  const settings = await db.settings.findFirst()
  return settings?.email || process.env.ADMIN_EMAIL || null
}

function getFromEmail(): string {
  return process.env.RESEND_FROM || 'JO-Administrativo <onboarding@resend.dev>'
}

// ─── Single Register Close Email with PDF ────────────────────────────────────

export async function sendCashCloseEmailWithPDF(data: CashCloseDataWithPDF, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = getFromEmail()
    const dateStr = data.closingDate.toLocaleDateString('es-VE')
    const registerLabel = data.registerName || 'Caja'
    const salesInfo = data.salesCount ? `<tr><td style="padding: 6px 0; font-weight: bold;">Ventas realizadas:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${data.salesCount}</td></tr>` : ''

    const filename = `Cierre_${registerLabel.replace(/\s+/g, '_')}_${data.cashierName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre de Caja] ${registerLabel} - ${data.cashierName} - ${dateStr}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Cierre de Caja</h2>
            <p style="color: #d1d5db; margin: 5px 0 0 0;">Reporte adjunto en PDF con detalle completo</p>
          </div>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Cajero:</td>
                <td style="padding: 8px 0;">${data.cashierName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Caja:</td>
                <td style="padding: 8px 0;">${registerLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Sucursal:</td>
                <td style="padding: 8px 0;">${data.branchName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Cierre:</td>
                <td style="padding: 8px 0;">${data.closingDate.toLocaleString('es-VE')}</td>
              </tr>
            </table>
          </div>
          <div style="margin-top: 16px; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; color: #333;">Resumen</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0;">Monto Inicial:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(data.initialAmt, currencyCode)}</td>
              </tr>
              ${salesInfo}
              <tr>
                <td style="padding: 6px 0;">Total Ventas (efectivo):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: green;">+${formatCurrency(data.totalSales, currencyCode)}</td>
              </tr>
              ${data.ivaEnabled && data.ivaRate && data.ivaRate > 0 ? `
              <tr>
                <td style="padding: 6px 0;">I.V.A. Recaudado (${data.ivaRate}%):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #2563eb;">+${formatCurrency(data.totalSales * data.ivaRate / 100, currencyCode)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 6px 0;">Total Gastos:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: red;">-${formatCurrency(data.totalExpenses, currencyCode)}</td>
              </tr>
              <tr style="border-top: 2px solid #333;">
                <td style="padding: 6px 0; font-weight: bold;">Total en Caja:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(data.actual, currencyCode)}</td>
              </tr>
            </table>
          </div>
          <div style="margin-top: 16px; background: #f0f5ff; padding: 16px; border-radius: 8px; text-align: center; border: 1px dashed #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-weight: bold;">PDF adjunto con detalle completo</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Productos vendidos, metodos de pago, gastos, entradas y mas</p>
          </div>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            JO-Administrativo - Sistema de Gestion
          </p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: data.pdfBuffer,
        },
      ],
    })

    console.log(`[Email] Cash close notification with PDF sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send cash close notification:', error)
    return false
  }
}

// ─── Mass Close Email with PDF ───────────────────────────────────────────────

export async function sendCashCloseAllEmailWithPDF(data: CashCloseAllData, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping mass cash close notification')
      return false
    }

    const fromEmail = getFromEmail()
    const dateStr = new Date().toLocaleDateString('es-VE')
    const grandTotal = data.cuts.reduce((sum, c) => sum + c.actual, 0)

    const rows = data.cuts.map(c => {
      const salesCol = c.salesCount
        ? `<td style="padding: 8px; text-align: center;">${c.salesCount}</td>`
        : ''
      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${c.cashierName}</td>
          <td style="padding: 8px;">${c.registerName || '—'}</td>
          ${salesCol}
          <td style="padding: 8px; text-align: right;">${formatCurrency(c.totalSales, currencyCode)}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(c.actual, currencyCode)}</td>
        </tr>
      `
    }).join('')

    const salesHeader = data.cuts.some(c => c.salesCount !== undefined)
      ? `<th style="padding: 10px; text-align: center;">Ventas</th>`
      : ''

    const filename = `Cierre_Masivo_${data.registersCount}_cajas_${dateStr.replace(/\//g, '-')}.pdf`

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre Masivo] ${data.registersCount} cajas cerradas - ${dateStr}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Cierre Masivo de Cajas</h2>
            <p style="color: #d1d5db; margin: 5px 0 0 0;">Reporte adjunto en PDF con detalle completo de cada caja</p>
          </div>
          <p style="padding: 16px 0 8px 0;">${data.registersCount} caja(s) han sido cerradas.</p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 8px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Cajero</th>
                <th style="padding: 10px; text-align: left;">Caja</th>
                ${salesHeader}
                <th style="padding: 10px; text-align: right;">Ventas</th>
                <th style="padding: 10px; text-align: right;">Total en Caja</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td colspan="${salesHeader ? '4' : '3'}" style="padding: 10px; text-align: right;">Total General:</td>
                <td style="padding: 10px; text-align: right;">${formatCurrency(grandTotal, currencyCode)}</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 16px; background: #f0f5ff; padding: 16px; border-radius: 8px; text-align: center; border: 1px dashed #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-weight: bold;">PDF adjunto con detalle completo de cada caja</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Productos vendidos, metodos de pago, gastos, entradas y mas por cada caja cerrada</p>
          </div>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            JO-Administrativo - Sistema de Gestion
          </p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: data.pdfBuffer,
        },
      ],
    })

    console.log(`[Email] Mass cash close notification with PDF sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send mass cash close notification:', error)
    return false
  }
}

// ─── Legacy functions (kept for backward compatibility) ───────────────────────

export async function sendCashCloseEmail(data: CashCloseData, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = getFromEmail()

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre de Caja] ${data.registerName || 'Caja'} - ${data.cashierName} - ${new Date().toLocaleDateString('es-VE')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Cierre de Caja</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Cajero:</td>
                <td style="padding: 8px 0;">${data.cashierName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Caja:</td>
                <td style="padding: 8px 0;">${data.registerName || 'Sin nombre'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Sucursal:</td>
                <td style="padding: 8px 0;">${data.branchName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Apertura:</td>
                <td style="padding: 8px 0;">${data.openingDate.toLocaleString('es-VE')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Cierre:</td>
                <td style="padding: 8px 0;">${data.closingDate.toLocaleString('es-VE')}</td>
              </tr>
            </table>
          </div>
          <div style="margin-top: 16px; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; color: #333;">Resumen</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0;">Monto Inicial:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(data.initialAmt, currencyCode)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;">Total Ventas (efectivo):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: green;">+${formatCurrency(data.totalSales, currencyCode)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;">Total Gastos:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: red;">-${formatCurrency(data.totalExpenses, currencyCode)}</td>
              </tr>
              <tr style="border-top: 2px solid #333;">
                <td style="padding: 6px 0; font-weight: bold;">Total en Caja:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(data.actual, currencyCode)}</td>
              </tr>
            </table>
          </div>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            JO-Administrativo - Sistema de Gestion
          </p>
        </div>
      `,
    })

    console.log(`[Email] Cash close notification sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send cash close notification:', error)
    return false
  }
}

export async function sendCashCloseAllEmail(cuts: Array<{
  cashierName: string
  registerName: string | null
  branchName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  expected: number
  actual: number
  difference: number
  totalSales: number
  totalExpenses: number
  totalRetiros: number
}>, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = getFromEmail()
    const grandTotal = cuts.reduce((sum, c) => sum + c.actual, 0)

    const rows = cuts.map(c => {
      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${c.cashierName}</td>
          <td style="padding: 8px;">${c.registerName || '—'}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(c.totalSales, currencyCode)}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(c.actual, currencyCode)}</td>
        </tr>
      `
    }).join('')

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre Masivo] ${cuts.length} cajas cerradas - ${new Date().toLocaleDateString('es-VE')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <h2 style="color: #333;">Cierre Masivo de Cajas</h2>
          <p>${cuts.length} caja(s) han sido cerradas.</p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 8px; margin-top: 16px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Cajero</th>
                <th style="padding: 10px; text-align: left;">Caja</th>
                <th style="padding: 10px; text-align: right;">Ventas</th>
                <th style="padding: 10px; text-align: right;">Total en Caja</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td colspan="3" style="padding: 10px; text-align: right;">Total General:</td>
                <td style="padding: 10px; text-align: right;">${formatCurrency(grandTotal, currencyCode)}</td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            JO-Administrativo - Sistema de Gestion
          </p>
        </div>
      `,
    })

    console.log(`[Email] Mass cash close notification sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send mass cash close notification:', error)
    return false
  }
}
