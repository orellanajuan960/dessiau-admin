import { db } from '@/lib/db'
import { generateStatementPDF } from '@/lib/statement-pdf'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params

    const [settings, client] = await Promise.all([
      db.settings.findFirst(),
      db.client.findUnique({
        where: { id: clientId },
        include: {
          receivables: {
            where: { status: 'pendiente' },
            include: {
              sale: {
                include: {
                  lines: { include: { product: { select: { name: true, sku: true } } } },
                  payments: { include: { currency: { select: { code: true, symbol: true } } } },
                  user: { select: { name: true } },
                  branch: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ])

    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    if (!client.email) {
      return NextResponse.json({ error: 'El cliente no tiene email registrado' }, { status: 400 })
    }

    const businessName = settings?.businessName || 'Mi Empresa'
    const rif = settings?.rif || ''
    const address = settings?.address || ''
    const phone = settings?.phone || ''

    const totalDebt = client.receivables.reduce((sum, r) => sum + r.pendingBalance, 0)
    const symbol = (settings?.referenceCurrency || 'USD') === 'EUR' ? '\u20ac' : '$'
    const fmt = (n: number) =>
      n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    // Generate PDF directly (no HTTP fetch)
    console.log('[Email] Generando PDF del estado de cuenta...')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = generateStatementPDF(client as any, settings as any)
    console.log('[Email] PDF generado correctamente, enviando email...')

    // Send email
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const fromEmail = process.env.RESEND_FROM || 'JO-Administrativo <onboarding@resend.dev>'

    // Build receivables rows for email HTML
    const receivablesRows = client.receivables.length > 0
      ? client.receivables.map((r, i) => {
          const sale = r.sale
          const saleDate = sale.date
            ? new Date(sale.date).toLocaleDateString('es-VE')
            : ''
          const dueDateStr = r.dueDate
            ? new Date(r.dueDate).toLocaleDateString('es-VE')
            : '\u2014'
          return `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; text-align: center;">${i + 1}</td>
              <td style="padding: 8px;">${saleDate}</td>
              <td style="padding: 8px;">${sale.lines.map(l => l.product.name).join(', ')}</td>
              <td style="padding: 8px; text-align: right;">${symbol}${fmt(r.pendingBalance)}</td>
              <td style="padding: 8px; text-align: center;">${dueDateStr}</td>
            </tr>
          `
        }).join('')
      : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #666;">Sin deuda pendiente</td></tr>'

    const filename = `estado_cuenta_${client.name.replace(/\s+/g, '_')}.pdf`

    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: [client.email],
      subject: `Estado de Cuenta - ${client.name} - ${new Date().toLocaleDateString('es-VE')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a3a6b; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Estado de Cuenta</h2>
            <p style="color: #d1d5db; margin: 5px 0 0 0;">${businessName}</p>
          </div>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Cliente:</td>
                <td style="padding: 6px 0;">${client.name}</td>
              </tr>
              ${client.phone ? `<tr><td style="padding: 6px 0; font-weight: bold;">Telefono:</td><td style="padding: 6px 0;">${client.phone}</td></tr>` : ''}
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Fecha:</td>
                <td style="padding: 6px 0;">${new Date().toLocaleDateString('es-VE')}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Facturas pendientes:</td>
                <td style="padding: 6px 0; font-weight: bold;">${client.receivables.length}</td>
              </tr>
            </table>
          </div>
          <div style="margin-top: 16px; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; color: #333;">Detalle de Facturas Pendientes</h3>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 8px;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 10px; text-align: center;">#</th>
                  <th style="padding: 10px; text-align: left;">Fecha</th>
                  <th style="padding: 10px; text-align: left;">Productos</th>
                  <th style="padding: 10px; text-align: right;">Pendiente</th>
                  <th style="padding: 10px; text-align: center;">Vence</th>
                </tr>
              </thead>
              <tbody>
                ${receivablesRows}
              </tbody>
            </table>
            <div style="margin-top: 12px; padding: 12px; background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px; font-weight: bold; color: #dc2626;">
                Deuda Total: ${symbol}${fmt(totalDebt)}
              </p>
            </div>
          </div>
          <div style="margin-top: 16px; background: #f0f5ff; padding: 16px; border-radius: 8px; text-align: center; border: 1px dashed #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-weight: bold;">PDF adjunto con detalle completo</p>
          </div>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            ${businessName} ${rif ? `- RIF: ${rif}` : ''} ${address ? `- ${address}` : ''} ${phone ? `- Tel: ${phone}` : ''}
          </p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    })

    console.log('[Email] Resend response:', JSON.stringify(sendResult))

    if (sendResult.error) {
      throw new Error(`Resend error: ${sendResult.error.name} - ${sendResult.error.message}`)
    }

    console.log('[Email] Estado de cuenta enviado correctamente, ID:', sendResult.data?.id)

    return NextResponse.json({ success: true, message: `Estado de cuenta enviado a ${client.email}` })
  } catch (error) {
    console.error('[Email] Error al enviar estado de cuenta:', error)
    return NextResponse.json(
      { error: 'Error al enviar el estado de cuenta por correo' },
      { status: 500 }
    )
  }
}
