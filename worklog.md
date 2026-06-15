---
Task ID: 1-8
Agent: Main
Task: Correcciones del módulo producto (8 fixes)

Work Log:
- Created /api/upload endpoint (was missing, causing image upload to fail)
- Added SKU uniqueness validation in POST /api/products and PUT /api/products/[id] (returns 409 with product name)
- Modified POS barcode scanner to show selection dialog when multiple products share the same SKU
- Changed handleToggleActive to disable/enable per-branch (sets stock=0 in that branch's inventory) when branch is selected
- Added generatingLabel state with full-screen loader overlay for barcode label generation
- Added two-option delete dialog: "Eliminar Permanentemente" (hard delete) or "Solo Desactivar" (soft delete)
- Hard delete checks dependencies (sale lines, purchase lines, recipes, inventory, adjustments) and shows them to user
- Changed bulk import to skip products without SKU instead of auto-generating, with clear error messages
- Centered product name in barcode label PDF using align:'center'

Stage Summary:
- 7 files changed, 416 insertions, 52 deletions
- New file: src/app/api/upload/route.ts
- Build successful, pushed to main
---
Task ID: 1
Agent: main
Task: Fix permissions system - permissions not taking effect when toggled in editor

Work Log:
- Investigated full permissions architecture: types, defaults, custom overrides, store, UI usage
- Found 3 critical bugs: (1) useAuth() not reactive to permission changes, (2) canManage* flags never checked in UI, (3) cash-register used hardcoded role check
- Fixed useAuth() hook to subscribe to permissionsVersion from Zustand store
- Added permission gates to products-table.tsx (canManageProducts): New, Import, Edit, Delete, ToggleActive
- Added permission gates to clients-table.tsx (canManageClients): New, Edit, Delete, Dispatch, Reactivate
- Added permission gates to expenses-table.tsx (canManageExpenses): New, Delete
- Fixed cash-register-view.tsx: replaced isCashier role check with canManageCash permission
- Added permission gates to suppliers-view.tsx (canManageSuppliers): New, Edit, Delete, Pedido
- Gated Settings sub-tabs: Usuarios/Roles/Categorías require canManageUsers, Sistema/Tutorial require admin, Auditoría requires canViewAudit
- Created server-side auth helper /src/lib/require-auth.ts with requireAuth(), requireAdmin(), requireManageUsers()
- Added server-side permission checks to 12 API routes: role-permissions, users, products, expenses, clients, suppliers, settings, branches, categories
- Build passed with zero errors

Stage Summary:
- Permissions now fully functional: UI buttons show/hide based on role permissions
- Server-side protection on all write API routes prevents unauthorized access
- useAuth() re-renders when custom permissions load from database
- All Settings sub-tabs properly gated by permission level

---
Task ID: 1
Agent: Main Agent
Task: Agregar botón "Pagar" directo en la tarjeta del proveedor

Work Log:
- Analicé el módulo de proveedores existente (suppliers-view.tsx)
- Confirmé que ya existía toda la funcionalidad de pagos (diálogo Abonar, API payment, FIFO allocation)
- Identifiqué que el botón "Abonar" solo estaba accesible dentro del diálogo de Deudas
- Agregué botón "Pagar" directamente en la tarjeta del proveedor, visible cuando balance > 0
- El botón abre directamente el diálogo de pago con el monto pre-llenado al balance total
- Compilación exitosa sin errores

Stage Summary:
- Botón "Pagar" agregado en cada tarjeta de proveedor con deuda
- Usa estilo verde (border-green-300, text-green-700) para distinguirlo
- Se muestra condicionalmente solo cuando supplier.balance > 0
- No requiere permiso canManage (cualquier usuario puede registrar pagos)
- Archivo modificado: src/components/clients/suppliers-view.tsx
---
Task ID: 1
Agent: Main Agent
Task: Fix dashboard date filtering - custom date range not working

Work Log:
- Analyzed dashboard API route and frontend component for date filtering logic
- Found Bug 1: KPI cards (Row 1) were hardcoded to always show "Hoy" and "Mes" data, ignoring period filter
- Found Bug 2: Chart data for custom period fell into else branch showing last 7 days from today instead of selected range
- Fixed API: Added isCustom flag, proper startDate setHours(0,0,0,0), endDate setHours(23,59,59,999) for custom ranges
- Fixed API: Added utilidadBrutaPeriodo and utilidadNetaPeriodo calculations for period-filtered utility metrics
- Fixed API: Chart now uses actual startDate→endDate for custom ranges with weekly grouping for >60 day ranges
- Fixed API: Returns proper chartLabel for custom ranges (e.g., "23 may – 24 may")
- Fixed Frontend: KPI cards now always show period-specific data with dynamic labels
- Fixed Frontend: Labels change based on period (Hoy, 7 días, Este Mes, Este Año, or custom range)
- All TypeScript checks pass for dashboard files

Stage Summary:
- Custom date filtering now works correctly in the dashboard
- When filtering by a specific date (e.g., yesterday), only data from that date range is shown
- KPI cards, chart, top products, and recent sales all respect the selected period
- Files modified: src/app/api/dashboard/route.ts, src/components/dashboard/financial-dashboard.tsx
---
Task ID: 2
Agent: Main Agent + 4 subagents
Task: Sistema de moneda centralizado — soporte multi-divisa

Work Log:
- Created src/lib/currency.ts: centralized currency utilities (getCurrencySymbol, formatCurrency, formatAmount, formatCurrencyLocale, toBaseCurrency, fromBaseCurrency)
- Created src/hooks/use-currency.ts: client-side React hook (useCurrency) with fmt, fmtBase, fmtWith, toBase, fromBase
- Updated Prisma schema: added currencyId to Sale, CashRegister, AccountReceivable, AccountPayable models + Currency relations
- Ran prisma generate to update client
- Replaced ~50+ hardcoded $ in 17 files across 6 modules:
  - Dashboard: 10 instances (KPIs, chart tooltip, top products, recent sales, alerts)
  - Cash Register: 22 instances (all amounts now use fmtBase for base currency)
  - POS: 3 files (terminal, cart, payment-modal) - symbol derivation centralized
  - Clients: clients-table.tsx (17 instances), suppliers-view.tsx (11 instances)
  - Email templates: 15 instances across 4 functions, added currencyCode parameter
  - API routes: sales, cash-register, cash-register/withdrawal, cash-register/movement, cash-register/close-all, clients/[id]/payment, notifications/check-deadlines
- API routes now include currencyId when creating Sale, CashRegister, AccountReceivable records
- Fixed pre-existing bug: close-all notification used undefined "expected" variable, now uses reg.currentAmt
- Resolved git rebase conflicts with remote, verified zero TS errors

Stage Summary:
- All currency symbols now derive dynamically from Settings.referenceCurrency
- Supports 16+ currency codes (USD, EUR, GBP, COP, VES, BRL, PEN, CLP, MXN, ARS, TRY, JPY, CNY, CAD, AUD, CHF)
- Cash register amounts correctly show base currency symbol (Bs.)
- POS/Dashboard amounts correctly show reference currency symbol ($ or €)
- New Sale and CashRegister records include currencyId for future multi-currency queries
- Pushed to main: commit 7be1d6e
---
Task ID: 3
Agent: Main Agent
Task: Fix client account notification - show clickable client name instead of ID, navigate to client detail

Work Log:
- Added `clientId` and `clientName` optional fields to Notification Prisma model and Client model (reverse relation)
- Created Notification table in SQLite DB with the new columns via sql.js (table didn't exist before)
- Updated `check-deadlines` route: stores `clientId`/`clientName` in notification, removed raw `[ID: ...]` from message text, changed dedup logic to use `clientId` + `type` instead of message text search
- Added `pendingClientId`, `navigateToClient()`, and `clearPendingClient()` to Zustand store (`use-app-store.ts`)
- Updated notifications GET API to include `clientId` and `clientName` in select
- Updated `ClientsTable` component: subscribes to `pendingClientId`, auto-opens history dialog when a client ID is pending
- Updated `NotificationBell` component: added `renderMessage()` that makes client name clickable with primary color + underline, clicking a client notification in dropdown navigates directly to client view, detail modal shows "Ver cuenta del cliente" button
- Updated `use-notifications` hook interface to include `clientId`/`clientName`
- Build passes successfully

Stage Summary:
- Client notifications now show the client NAME (clickable, primary-colored) instead of a raw CUID
- Clicking the notification navigates to the Clients view and auto-opens the client's sales/dispatch history dialog
- Non-client notifications still open the detail modal as before
- Files modified: prisma/schema.prisma, src/app/api/notifications/check-deadlines/route.ts, src/app/api/notifications/route.ts, src/stores/use-app-store.ts, src/components/clients/clients-table.tsx, src/components/layout/notification-bell.tsx, src/hooks/use-notifications.ts
---
Task ID: 1
Agent: Main Agent
Task: Fix product currency dropdown - show only USD and EUR when multi-currency ON

Work Log:
- Added `refCode` to `useCurrency()` destructure in products-table
- Changed currency dropdown filter from `currencies.filter(c => !c.isBase)` to `currencies.filter(c => !c.isBase && (c.code === 'USD' || c.code === 'EUR'))`
- Updated `openCreate` to default to the reference currency (matching settings) instead of first non-base
- When multi-currency is OFF, the dropdown is hidden (already was)

Stage Summary:
- Product form currency dropdown now only shows USD and EUR (not COP, BRL, etc.)
- Default selection matches the "Moneda para Precios" setting (USD or EUR)
- Files modified: src/components/products/products-table.tsx

---
Task ID: 2
Agent: Main Agent
Task: Fix POS credit payment client selector UX

Work Log:
- Rewrote the client selector in pos-payment-modal.tsx
- Removed the "selected badge" pattern that hid the list after selecting a client
- Client list now ALWAYS shows with search input above it (max-h-48, scrollable, 30 items)
- Selected client is highlighted with primary color background + ✓ checkmark
- Clicking a different client changes selection (only one selected at a time)
- "Nuevo cliente" button still works, shows inline form
- After creating a new client, returns to full list view with new client pre-selected and scrolled into view
- Removed unused `selectedClientName` useMemo

Stage Summary:
- POS credit now shows full client list immediately when "Crédito" is selected
- Client list is always visible with search, highlight selection, and single-select behavior
- After creating a new client inline, the list reappears with the new client selected and visible
- Files modified: src/components/pos/pos-payment-modal.tsx

---
Task ID: 1
Agent: main
Task: Reescribir métodos de pago a Prisma ORM y eliminar hardcodeados

Work Log:
- Reescrito src/app/api/payment-methods/route.ts: eliminado todo SQL crudo, ahora usa db.paymentMethod.findMany/create/update/delete de Prisma
- Reescrito src/lib/payment-methods.ts: eliminado SQL crudo, ahora usa db.paymentMethod.findMany de Prisma
- Agregado campo isDefault al modelo PaymentMethod en prisma/schema.prisma
- Agregada migración automática (ensureIsDefaultColumn) que añade la columna isDefault si no existe en la tabla de producción
- Eliminado array hardcodeado ['divisas','efectivo',...] en payment-methods-tab.tsx, ahora usa method.isDefault
- Eliminado p.method === 'credito' hardcodeado en clients-table.tsx, ahora usa pm?.isCredit de la lista dinámica
- Eliminado method === 'divisas' hardcodeado en pos-payment-modal.tsx (cálculo de cambio)
- Eliminado method === 'pago_movil' hardcodeado en placeholder de referencia
- Reemplazados useState('efectivo') y fallbacks 'divisas'/'efectivo' en clients-table y suppliers-view con lógica dinámica (primer método disponible)
- Reemplazado SelectItem de fallback hardcodeado con "Cargando métodos..."
- Eliminado default 'efectivo' en supplier payment API
- Eliminado tipo any en PUT, ahora usa Prisma.PaymentMethodUpdateInput
- Generado Prisma client con nuevo campo isDefault

Stage Summary:
- Todos los métodos de pago ahora se manejan 100% por la tabla PaymentMethod via Prisma ORM
- Cero SQL crudo en payment-methods/route.ts y lib/payment-methods.ts
- Cero referencias hardcodeadas a códigos de métodos de pago en lógica de negocio
- El campo isDefault permite proteger métodos del sistema sin listar códigos
- Migración automática para bases de datos existentes
- FALLBACK_METHODS se mantiene solo como último recurso si la DB no responde
