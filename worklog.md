---
Task ID: 1
Agent: Main
Task: Fix POS "cobrar" button 500 error + VES credit balance display + saldo después del cobro

Work Log:
- Analyzed screenshot: user gets "Error al registrar pago" (500) when clicking Registrar Cobro in Clients payment dialog
- Investigated `/api/clients/[id]/payment/route.ts` - found `orderBy: { createdAt: 'asc' }` but AccountReceivable model has NO `createdAt` field
- Fixed by changing to `orderBy: { id: 'asc' }` (CUID is time-ordered)
- Fixed "Saldo después del cobro" display: was showing USD amount with Bs. symbol when payment method was local currency
- Fixed VES-only credit sales pending balance: after partial payment, `pendingBalance` (in USD) was displayed with VES symbol
- Applied ratio technique: `ratio = pendingBalance / creditAmount`, then multiply each currency's line total by ratio
- Fixed in both cash-register-view and clients-table

Stage Summary:
- Commit 2dca20b: Fix 500 error (orderBy createdAt → id) + saldo display in payment modal
- Commit a665ad8: Fix VES credit balance using payment ratio technique in cash-register-view and clients-table
- Both pushed to GitHub, Vercel will auto-deploy
- Credit sales exclusion from Historial de Ventas was already fixed in commit 6f92031