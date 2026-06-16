'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/use-app-store'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'
import { ArrowLeft, ArrowRight, X, Wallet, ShoppingCart, Store, Package, Building2, DollarSign, Percent, Tag, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ── Types ───────────────────────────────────────────────

type ValidationType = 'has-categories' | 'has-products' | 'caja-open'

interface TourStep {
  /** CSS selector for the element to highlight. Omit for welcome/finish steps. */
  target?: string
  title: string
  description: string
  /** Which view must be active for this step. Navigates automatically. */
  navigateTo?: string
  /** Side where the popover appears relative to the target. */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Icon to show in the step header. */
  icon?: React.ReactNode
  /** Validation: block "Siguiente" until this condition is met. */
  validation?: ValidationType
  /** Message shown while waiting for validation. */
  validationMessage?: string
  /** If set, dispatches a custom event to switch the Settings tab before highlighting. */
  switchTab?: string
}

// ── Validation functions ────────────────────────────────

async function checkValidation(type: ValidationType): Promise<boolean> {
  try {
    switch (type) {
      case 'has-categories': {
        const cats = await api.get<Array<unknown>>('/api/categories')
        return Array.isArray(cats) && cats.length > 0
      }
      case 'has-products': {
        const res = await api.get<{ products: Array<unknown> }>('/api/products?active=true')
        return Array.isArray(res.products) && res.products.length > 0
      }
      case 'caja-open': {
        const registers = await api.get<Array<{ status: string }>>('/api/cash-register')
        return Array.isArray(registers) && registers.some((r) => r.status === 'abierta')
      }
      default:
        return true
    }
  } catch {
    return false
  }
}

const DEFAULT_VALIDATION_MESSAGES: Record<ValidationType, string> = {
  'has-categories': 'Crea al menos una categoría para continuar.',
  'has-products': 'Crea al menos un producto para continuar.',
  'caja-open': 'Abre una caja para continuar al Punto de Venta.',
}

// ── Helper: find element and scroll into view ──────────

function findElement(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }
  return el
}

// ── Helper: get the bounding rect of the target, with padding ──

interface Rect {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

function getTargetRect(el: HTMLElement, padding = 8): Rect {
  const r = el.getBoundingClientRect()
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
    right: r.right + padding,
    bottom: r.bottom + padding,
  }
}

// ── Step builders per role ─────────────────────────────
//
// ADMIN FLOW (sistema recién instalado):
// 1. Bienvenida
// 2. Configurar Empresa (nombre, RIF, etc.)
// 3. Configurar Moneda (tasa de cambio)
// 4. Configurar IVA
// 5. Crear Categorías (VALIDAR: ≥1 categoría)
// 6. Crear Productos (VALIDAR: ≥1 producto)
// 7. Abrir Caja (VALIDAR: caja abierta)
// 8. Punto de Venta (buscar, agregar, cobrar)
// 9. Dashboard, Clientes, Proveedores, Gastos, Sucursales, Usuarios, Roles, Sistema, Apariencia
// 10. Completado

function buildAdminSteps(): TourStep[] {
  const steps: TourStep[] = []

  // ═══════════════════════════════════════════════════════
  // FASE 1: BIENVENIDA
  // ═══════════════════════════════════════════════════════
  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Tu sistema está recién instalado. Antes de poder vender, necesitamos configurar los datos básicos. Te guiaremos paso a paso para que en unos minutos estés operando.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Menú de Navegación',
    description: 'Desde aquí accedes a todas las secciones del sistema. Vamos a ir moviéndonos por cada una según la necesites.',
    side: 'right',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 2: CONFIGURACION INICIAL
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-settings"]',
    title: 'Vamos a Configurar',
    description: 'Primero vamos a la sección de Configuración para poner los datos de tu empresa, las tasas de cambio y demás datos antes de empezar a vender.',
    side: 'right',
    navigateTo: 'settings',
    icon: <Building2 className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="settings-tab-empresa"]',
    title: 'Datos de la Empresa',
    description: 'Registra aquí el nombre de tu negocio, identificación fiscal, correo, teléfono y dirección. Estos datos aparecen en tus comprobantes de venta y reportes.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <Building2 className="h-5 w-5" />,
    switchTab: 'empresa',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-moneda"]',
    title: 'Tasa de Cambio',
    description: 'Configura la moneda de referencia y la tasa de cambio. Puedes actualizar con las tasas oficiales o ingresar una manualmente. Esto es clave para los precios.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <DollarSign className="h-5 w-5" />,
    switchTab: 'moneda',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-iva"]',
    title: 'Impuesto I.V.A.',
    description: 'Activa o desactiva el IVA y define el porcentaje (por defecto 16%). Si tu negocio cobra IVA, activa esta opción antes de la primera venta.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <Percent className="h-5 w-5" />,
    switchTab: 'iva',
  })

  // --- Categorías (VALIDADO) ---
  steps.push({
    target: '[data-tutorial="settings-tab-categorias"]',
    title: 'Crear Categorías',
    description: 'Define las categorías para organizar tu catálogo: Alimentos, Bebidas, Limpieza, etc. Se usan como filtros en el Punto de Venta. Haz clic en "Nueva" para crear una.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <Tag className="h-5 w-5" />,
    switchTab: 'categorias',
    validation: 'has-categories',
    validationMessage: 'Crea al menos una categoría para continuar. Presiona "Nueva" en esta sección.',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 3: PRODUCTOS (VALIDADO)
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-products"]',
    title: 'Crear Productos',
    description: 'Sin productos no hay nada que vender. Vamos a la sección de Productos para crear tu catálogo.',
    side: 'right',
    navigateTo: 'products',
    icon: <Package className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="products-new-btn"]',
    title: 'Boton "Nuevo" Producto',
    description: 'Presiona este botón para registrar un nuevo producto. Completa nombre, SKU, precio, categoría y stock. Repite para todos tus productos.',
    side: 'left',
    navigateTo: 'products',
    validation: 'has-products',
    validationMessage: 'Crea al menos un producto para continuar.',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 4: CAJA (VALIDADO)
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Abrir Caja',
    description: 'El último paso antes de vender. Sin caja abierta el Punto de Venta está bloqueado.',
    side: 'right',
    navigateTo: 'cash',
    icon: <Wallet className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="cash-open-btn"]',
    title: 'Pulsa "Abrir Caja"',
    description: 'Haz clic aquí para registrar la apertura. Indica el monto inicial y asigna un cajero. Una vez abierta, el POS se desbloqueará.',
    side: 'right',
    navigateTo: 'cash',
    validation: 'caja-open',
    validationMessage: 'Abre una caja para continuar al Punto de Venta.',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 5: PUNTO DE VENTA
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Ahora sí, tu sistema está listo. Aquí procesarás todas las ventas diarias.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre o marca del producto para encontrarlo rápido. También puedes escanear el código de barras.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Tu Catálogo',
    description: 'Aquí se muestran todos tus productos con precio y stock. Haz clic para agregar al carrito.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Cobrar',
    description: 'Presiona aquí para procesar el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 6: RESTO DEL SISTEMA
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-dashboard"]',
    title: 'Dashboard Financiero',
    description: 'Aquí verás el panorama completo de todo tu panel administrativo.',
    side: 'right',
    navigateTo: 'dashboard',
  })

  steps.push({
    target: '[data-tutorial="nav-clients"]',
    title: 'Clientes',
    description: 'Registra clientes, vincúlalos a ventas y genera estados de cuenta para control de pagos a crédito.',
    side: 'right',
    navigateTo: 'clients',
  })

  steps.push({
    target: '[data-tutorial="nav-suppliers"]',
    title: 'Proveedores',
    description: 'Gestiona proveedores, registra compras y controla cuentas por pagar con pagos parciales.',
    side: 'right',
    navigateTo: 'suppliers',
  })

  steps.push({
    target: '[data-tutorial="nav-expenses"]',
    title: 'Gastos',
    description: 'Registra gastos operativos: servicios, compras menores y otros egresos. Se reflejan en el cierre de caja y dashboard.',
    side: 'right',
    navigateTo: 'expenses',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-sucursales"]',
    title: 'Sucursales',
    description: 'Si tienes más de una sede, crea sucursales aquí. Cada una con su propio inventario y cajas.',
    side: 'bottom',
    navigateTo: 'settings',
    switchTab: 'sucursales',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-usuarios"]',
    title: 'Usuarios',
    description: 'Crea cuentas para tu equipo: cajeros, vendedores y gerentes con permisos diferentes.',
    side: 'bottom',
    navigateTo: 'settings',
    switchTab: 'usuarios',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-roles"]',
    title: 'Permisos por Rol',
    description: 'Personaliza qué vistas y acciones puede realizar cada rol según las necesidades de tu negocio.',
    side: 'bottom',
    navigateTo: 'settings',
    switchTab: 'roles',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-sistema"]',
    title: 'Sistema',
    description: 'Ajusta la duración de las sesiones de usuario y administra las notificaciones.',
    side: 'bottom',
    navigateTo: 'settings',
    switchTab: 'sistema',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-apariencia"]',
    title: 'Apariencia',
    description: 'Personaliza los colores del sistema para que coincidan con la identidad visual de tu negocio.',
    side: 'bottom',
    navigateTo: 'settings',
    switchTab: 'apariencia',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Tu sistema está listo para operar. Recuerda: abre caja al inicio del turno, ciérrala al final. Puedes ver este tutorial de nuevo desde tu menú de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

function buildGerenteSteps(): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Hola Gerente. Te mostraremos las funciones principales a las que tienes acceso y cómo usar el sistema diariamente.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Menú de Navegación',
    description: 'Desde aquí accedes a todas las secciones disponibles para tu rol.',
    side: 'right',
  })

  // Products (validated)
  steps.push({
    target: '[data-tutorial="nav-products"]',
    title: 'Productos e Inventario',
    description: 'Aquí puedes crear y gestionar productos. Es importante tener productos registrados para poder vender.',
    side: 'right',
    navigateTo: 'products',
    icon: <Package className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="products-new-btn"]',
    title: 'Crear un Producto',
    description: 'Presiona "Nuevo" para registrar un producto con nombre, precio, categoria y stock.',
    side: 'left',
    navigateTo: 'products',
    validation: 'has-products',
    validationMessage: 'Crea al menos un producto para continuar.',
  })

  // Caja (validated)
  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Caja',
    description: 'Para poder vender necesitas una caja abierta. Presiona "Abrir Caja" con el monto inicial del día.',
    side: 'right',
    navigateTo: 'cash',
    icon: <Wallet className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="cash-open-btn"]',
    title: 'Abrir Caja',
    description: 'Indica el monto inicial y el cajero asignado. Sin caja abierta el POS estará bloqueado.',
    side: 'right',
    navigateTo: 'cash',
    validation: 'caja-open',
    validationMessage: 'Abre una caja para continuar al Punto de Venta.',
  })

  // POS
  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Con productos y caja abierta, estás listo para vender.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre o usa el scanner para encontrar productos.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Catálogo de Productos',
    description: 'Productos con precio y stock. Haz clic para agregar al carrito.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Boton de Cobrar',
    description: 'Procesa el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  // Rest
  steps.push({
    target: '[data-tutorial="nav-dashboard"]',
    title: 'Dashboard Financiero',
    description: 'Revisa ingresos, gastos, utilidades y gráficas de ventas.',
    side: 'right',
    navigateTo: 'dashboard',
  })

  steps.push({
    target: '[data-tutorial="nav-clients"]',
    title: 'Clientes',
    description: 'Registra clientes y genera estados de cuenta para créditos.',
    side: 'right',
    navigateTo: 'clients',
  })

  steps.push({
    target: '[data-tutorial="nav-suppliers"]',
    title: 'Proveedores',
    description: 'Gestiona proveedores, compras y cuentas por pagar.',
    side: 'right',
    navigateTo: 'suppliers',
  })

  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Caja (Revision)',
    description: 'Aquí puedes registrar movimientos, retiros de excedente y cerrar al final del turno.',
    side: 'right',
    navigateTo: 'cash',
  })

  steps.push({
    target: '[data-tutorial="nav-expenses"]',
    title: 'Gastos',
    description: 'Registra gastos operativos. Se reflejan en el cierre de caja y dashboard.',
    side: 'right',
    navigateTo: 'expenses',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya conoces las funciones principales. No tienes acceso a Configuración ni Usuarios. Puedes ver este tutorial de nuevo desde tu menú de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

function buildCajeroSteps(): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Hola Cajero. Te mostraremos cómo usar el Punto de Venta para procesar ventas rápidamente.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Tu Menú',
    description: 'Como cajero tienes acceso al Punto de Venta y a la sección de Caja (solo lectura).',
    side: 'right',
  })

  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Aquí procesas todas las ventas. Si la caja no está abierta, verás un mensaje de bloqueo. Contacta al administrador.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre o escanea el código de barras para agregarlo a la venta.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Productos Disponibles',
    description: 'Haz click en un producto para agregarlo al carrito de la venta.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Cobrar',
    description: 'Cuando tengas productos en el carrito, presiona aquí para procesar el pago.',
    side: 'left',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Tu Caja',
    description: 'Puedes ver el resumen de tu caja abierta y consultar movimientos. Solo el admin puede abrir, cerrar o hacer movimientos.',
    side: 'right',
    navigateTo: 'cash',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya estás listo para procesar ventas. Si la caja se cierra, contacta a un administrador. Puedes ver este tutorial de nuevo desde tu menú de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

function buildVendedorSteps(): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Hola Vendedor. Te mostraremos como usar el sistema para registrar ventas y gestionar clientes.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Tu Menú',
    description: 'Como vendedor tienes acceso al Punto de Venta, Productos y Clientes.',
    side: 'right',
  })

  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Aquí procesas las ventas. Si no hay caja abierta, verás un bloqueo. Contacta a un admin o gerente.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Busca productos por nombre o con el scanner de código de barras.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Catálogo de Productos',
    description: 'Haz click en un producto para agregarlo al carrito de la venta.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Cobrar',
    description: 'Procesa el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="nav-products"]',
    title: 'Productos',
    description: 'Consulta el catálogo completo, precios y stock por sucursal.',
    side: 'right',
    navigateTo: 'products',
    icon: <Package className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="nav-clients"]',
    title: 'Clientes',
    description: 'Registra clientes, consulta sus datos y genera estados de cuenta para ventas a credito.',
    side: 'right',
    navigateTo: 'clients',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya sabes lo fundamental. Registra clientes, busca productos y procesa ventas. Puedes ver este tutorial de nuevo desde tu menú de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

// ── Master builder ─────────────────────────────────────

function buildSteps(userRole: string): TourStep[] {
  switch (userRole) {
    case 'admin':
      return buildAdminSteps()
    case 'gerente':
      return buildGerenteSteps()
    case 'cajero':
      return buildCajeroSteps()
    case 'vendedor':
      return buildVendedorSteps()
    default:
      return buildCajeroSteps()
  }
}

// ── Tour Component ─────────────────────────────────────

export function OnboardingTutorial() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const { user } = useAuth()

  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; side: string }>({
    top: 0,
    left: 0,
    side: 'bottom',
  })

  // Validation state
  const [isValidated, setIsValidated] = useState(true)
  const [isValidating, setIsValidating] = useState(false)

  const stepsRef = useRef<TourStep[]>([])
  const waitForViewRef = useRef(false)
  const validationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const role = user?.role || 'cajero'
  const steps = stepsRef.current
  const currentStep = steps[stepIndex]
  const totalSteps = steps.length
  const isFirst = stepIndex === 0
  const isLast = stepIndex === totalSteps - 1
  const hasTarget = !!currentStep?.target
  const needsValidation = !!currentStep?.validation

  // ── Highlight logic ──────────────────────────────────

  const updateHighlight = useCallback((step: TourStep) => {
    if (!step.target) {
      setTargetRect(null)
      setPopoverPos({ top: window.innerHeight / 2, left: window.innerWidth / 2, side: 'bottom' })
      return
    }

    // If this step needs to switch a Settings tab, dispatch the custom event
    if (step.switchTab) {
      window.dispatchEvent(new CustomEvent('tutorial-switch-tab', { detail: step.switchTab }))
      // Wait for the tab content to render, then highlight
      setTimeout(() => {
        const el = findElement(step.target!)
        if (el) {
          const rect = getTargetRect(el)
          setTargetRect(rect)
          positionPopover(rect, step.side || 'bottom')
        }
      }, 300)
      return
    }

    // Try to find the element, retry if view hasn't loaded yet
    let el = findElement(step.target)
    if (!el) {
      requestAnimationFrame(() => {
        el = findElement(step.target!)
        if (el) {
          const rect = getTargetRect(el)
          setTargetRect(rect)
          positionPopover(rect, step.side || 'bottom')
        }
      })
      return
    }

    // Small delay to let scrollIntoView finish
    setTimeout(() => {
      const rect = getTargetRect(el!)
      setTargetRect(rect)
      positionPopover(rect, step.side || 'bottom')
    }, 100)
  }, [])

  function positionPopover(rect: Rect, side: string) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const popoverW = 360
    const popoverH = 260 // approximate (slightly larger for validation msg)
    const gap = 12

    let top = 0
    let left = 0
    const resolvedSide = side

    switch (side) {
      case 'right': {
        left = rect.right + gap
        top = rect.top + rect.height / 2 - popoverH / 2
        if (left + popoverW > vw - 16) {
          left = rect.left - popoverW - gap
        }
        break
      }
      case 'left': {
        left = rect.left - popoverW - gap
        top = rect.top + rect.height / 2 - popoverH / 2
        if (left < 16) {
          left = rect.right + gap
        }
        break
      }
      case 'bottom': {
        left = rect.left + rect.width / 2 - popoverW / 2
        top = rect.bottom + gap
        if (top + popoverH > vh - 16) {
          top = rect.top - popoverH - gap
        }
        break
      }
      case 'top': {
        left = rect.left + rect.width / 2 - popoverW / 2
        top = rect.top - popoverH - gap
        if (top < 16) {
          top = rect.bottom + gap
        }
        break
      }
    }

    left = Math.max(16, Math.min(left, vw - popoverW - 16))
    top = Math.max(16, Math.min(top, vh - popoverH - 16))

    setPopoverPos({ top, left, side: resolvedSide })
  }

  // ── Validation polling ───────────────────────────────

  useEffect(() => {
    // Clear previous polling
    if (validationTimerRef.current) {
      clearInterval(validationTimerRef.current)
      validationTimerRef.current = null
    }

    if (!isOpen || !currentStep?.validation) {
      setIsValidated(true)
      setIsValidating(false)
      return
    }

    // Start validation
    const runValidation = async () => {
      setIsValidating(true)
      const result = await checkValidation(currentStep.validation!)
      setIsValidated(result)
      setIsValidating(false)
    }

    // Check immediately
    runValidation()

    // Then poll every 3 seconds
    validationTimerRef.current = setInterval(runValidation, 3000)

    return () => {
      if (validationTimerRef.current) {
        clearInterval(validationTimerRef.current)
        validationTimerRef.current = null
      }
    }
  }, [isOpen, stepIndex, currentStep?.validation])

  // ── Navigation ───────────────────────────────────────

  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= steps.length) return

    const step = steps[index]

    // Navigate to the required view first
    if (step.navigateTo) {
      const currentView = useAppStore.getState().activeView
      if (currentView !== step.navigateTo) {
        setActiveView(step.navigateTo)
        waitForViewRef.current = true
        setStepIndex(index)
        return
      }
    }

    setStepIndex(index)
    updateHighlight(step)
  }, [steps, setActiveView, updateHighlight])

  // When step index changes and we're NOT waiting for a view, highlight
  useEffect(() => {
    if (!isOpen) return
    if (waitForViewRef.current) {
      const timer = setTimeout(() => {
        waitForViewRef.current = false
        const step = steps[stepIndex]
        if (step) updateHighlight(step)
      }, 400) // slightly longer to account for tab click + content render
      return () => clearTimeout(timer)
    }
    const step = steps[stepIndex]
    if (step) updateHighlight(step)
  }, [stepIndex, isOpen, steps, updateHighlight])

  // Recalculate on resize
  useEffect(() => {
    if (!isOpen || !hasTarget) return
    const handleResize = () => {
      const step = steps[stepIndex]
      if (step?.target) updateHighlight(step)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, stepIndex, steps, hasTarget, updateHighlight])

  // ── Start / Stop ─────────────────────────────────────

  const startTour = useCallback((fromStep?: number) => {
    stepsRef.current = buildSteps(role)
    const savedStep = fromStep ?? parseInt(localStorage.getItem('jo-admin-tutorial-step') || '0', 10)
    setStepIndex(isNaN(savedStep) ? 0 : Math.min(savedStep, stepsRef.current.length - 1))
    setIsOpen(true)
  }, [role])

  const stopTour = useCallback((markCompleted = true) => {
    if (markCompleted) {
      localStorage.setItem('jo-admin-tutorial-completed', 'true')
      localStorage.removeItem('jo-admin-tutorial-step')
    } else {
      // Save current step for later resumption
      localStorage.setItem('jo-admin-tutorial-step', String(stepIndex))
    }
    setIsOpen(false)
    setTargetRect(null)
  }, [stepIndex])

  // Auto-start on first visit (or resume from saved step)
  useEffect(() => {
    const completed = localStorage.getItem('jo-admin-tutorial-completed')
    if (!completed) {
      const savedStep = parseInt(localStorage.getItem('jo-admin-tutorial-step') || '0', 10)
      const timer = setTimeout(async () => {
        // Check if auto-show is enabled in settings
        try {
          const settings = await api.get<{ tutorialTexts: Record<string, unknown> }>('/api/settings')
          const raw = settings?.tutorialTexts
          if (raw && typeof raw === 'object') {
            const config = (raw as Record<string, unknown>)._config as { autoShow?: boolean } | undefined
            if (config && config.autoShow === false) {
              // Auto-show is disabled — mark as completed so we don't check again
              localStorage.setItem('jo-admin-tutorial-completed', 'true')
              return
            }
          }
        } catch {
          // If settings can't be loaded, default to showing tutorial
        }

        stepsRef.current = buildSteps(role)
        setStepIndex(isNaN(savedStep) ? 0 : Math.min(savedStep, stepsRef.current.length - 1))
        setIsOpen(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [role])

  // Persist current step on every change
  useEffect(() => {
    if (isOpen) {
      localStorage.setItem('jo-admin-tutorial-step', String(stepIndex))
    }
  }, [stepIndex, isOpen])

  // Expose restart function
  useEffect(() => {
    ;(window as unknown as Record<string, () => void>).__restartTutorial = startTour
    return () => {
      const w = window as unknown as Record<string, () => void>
      delete w.__restartTutorial
    }
  }, [startTour])

  if (!isOpen || !currentStep) return null

  // ── Render ───────────────────────────────────────────

  const canAdvance = !needsValidation || isValidated

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Dark overlay with spotlight hole — ONLY for non-validation steps.
          For validation steps we hide the overlay entirely so the user can freely
          interact with buttons, forms, and modals (e.g. "Abrir Caja" dialog). */}
      {hasTarget && !needsValidation && (
        <svg className="absolute inset-0 w-full h-full pointer-events-auto" aria-hidden="true">
          <defs>
            <mask id="tour-spotlight">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left}
                  y={targetRect.top}
                  width={targetRect.width}
                  height={targetRect.height}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.65)"
            mask="url(#tour-spotlight)"
          />
        </svg>
      )}

      {/* Highlighted element border glow — only for non-validation steps */}
      {targetRect && !needsValidation && (
        <div
          className="absolute rounded-lg border-2 border-white/80 shadow-[0_0_0_4px_rgba(59,130,246,0.5)] transition-all duration-300 pointer-events-none"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Popover — fixed bottom-right for validation steps to avoid blocking centered modals */}
      <div
        className={cn(
          'z-[10000] pointer-events-auto w-[360px] rounded-xl border bg-popover p-5 shadow-2xl transition-all duration-300',
          // Centered for welcome/finish (no target)
          !hasTarget && 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          // Fixed bottom-right for validation steps (stays out of the way of modals)
          needsValidation && hasTarget && 'fixed bottom-4 right-4',
          // Absolute positioned near target for normal steps
          hasTarget && !needsValidation && 'absolute'
        )}
        style={
          hasTarget && !needsValidation
            ? { top: popoverPos.top, left: popoverPos.left }
            : undefined
        }
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted rounded-t-xl overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={() => stopTour(true)}
          className="absolute top-3 right-3 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          {currentStep.icon && (
            <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2 text-primary mt-0.5">
              {currentStep.icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold pr-6">{currentStep.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">
              {currentStep.description}
            </p>

            {/* Validation message */}
            {needsValidation && !isValidated && (
              <div className={cn(
                'mt-3 rounded-lg p-2.5 text-sm flex items-start gap-2',
                isValidated
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400'
              )}>
                {isValidated
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  : <Loader2 className="h-4 w-4 flex-shrink-0 mt-0.5 animate-spin" />
                }
                <span>{currentStep.validationMessage || DEFAULT_VALIDATION_MESSAGES[currentStep.validation!]}</span>
              </div>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="mt-4 space-y-2">
          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>
          {/* Step counter + dots */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary whitespace-nowrap">
              Paso {stepIndex + 1} de {totalSteps}
            </span>
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-1">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 rounded-full transition-all duration-200 flex-shrink-0',
                      i === stepIndex
                        ? 'w-3 bg-primary'
                        : i < stepIndex
                          ? 'w-1 bg-primary/40'
                          : 'w-1 bg-muted-foreground/20'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => stopTour(true)}
            className="text-xs text-muted-foreground h-8"
          >
            Omitir
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToStep(stepIndex - 1)}
                className="h-8"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Atrás
              </Button>
            )}
            <Button
              size="sm"
              className={cn(
                'h-8',
                canAdvance
                  ? 'bg-primary hover:bg-primary/90 text-white'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
              disabled={!canAdvance && !isLast}
              onClick={() => {
                if (isLast) {
                  stopTour()
                } else if (canAdvance) {
                  goToStep(stepIndex + 1)
                }
              }}
            >
              {isLast ? 'Finalizar' : 'Siguiente'}
              {!isLast && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Public API ─────────────────────────────────────────

export function startTutorial() {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, (fromStep?: number) => void>
    if (w.__restartTutorial) {
      w.__restartTutorial()
    } else {
      localStorage.removeItem('jo-admin-tutorial-completed')
      window.location.reload()
    }
  }
}

/** Start tutorial from a specific step (for per-view help). */
export function startTutorialFromStep(viewName: string) {
  if (typeof window !== 'undefined') {
    const completed = localStorage.getItem('jo-admin-tutorial-completed')
    if (completed) {
      // Allow opening tutorial even if completed, for per-view help
      localStorage.removeItem('jo-admin-tutorial-completed')
    }
    const w = window as unknown as Record<string, (fromStep?: number) => void>
    if (w.__restartTutorial) {
      w.__restartTutorial()
    } else {
      window.location.reload()
    }
  }
}
