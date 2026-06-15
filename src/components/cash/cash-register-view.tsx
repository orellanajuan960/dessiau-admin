'use client'

import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useCurrency } from '@/hooks/use-currency'
import { useAppStore, useSetting } from '@/stores/use-app-store'
import { getCurrencyForCountry } from '@/lib/country-currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Wallet, Plus, ArrowUpCircle, ArrowDownCircle, Lock, Eye, Loader2,
  UserCircle, AlertTriangle, Banknote, ClipboardCheck, CheckCircle2,
  Clock, ShoppingCart, Building2, TrendingUp, CircleDollarSign,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface CashRegister {
  id: string
  name: string | null
  openingDate: string
  closingDate: string | null
  initialAmt: number
  currentAmt: number
  status: string
  user: { id: string; name: string }
  branch: { id: string; name: string }
  _count: { sales: number; movements: number }
}

interface BranchItem {
  id: string
  name: string
  isMain: boolean
  active: boolean
}

// Denominaciones por país (billetes y monedas más comunes)
const DENOMINATIONS_BY_COUNTRY: Record<string, Array<{ value: number; label: string; type: string }>> = {
  VE: [
    { value: 100, label: 'Bs 100', type: 'billete' },
    { value: 50, label: 'Bs 50', type: 'billete' },
    { value: 20, label: 'Bs 20', type: 'billete' },
    { value: 10, label: 'Bs 10', type: 'billete' },
    { value: 5, label: 'Bs 5', type: 'billete' },
    { value: 1, label: 'Bs 1', type: 'billete' },
    { value: 0.5, label: 'Bs 0,50', type: 'moneda' },
    { value: 0.25, label: 'Bs 0,25', type: 'moneda' },
  ],
  CO: [
    { value: 100000, label: '$100.000', type: 'billete' },
    { value: 50000, label: '$50.000', type: 'billete' },
    { value: 20000, label: '$20.000', type: 'billete' },
    { value: 10000, label: '$10.000', type: 'billete' },
    { value: 5000, label: '$5.000', type: 'billete' },
    { value: 2000, label: '$2.000', type: 'billete' },
    { value: 1000, label: '$1.000', type: 'billete' },
    { value: 500, label: '$500', type: 'moneda' },
    { value: 200, label: '$200', type: 'moneda' },
    { value: 100, label: '$100', type: 'moneda' },
    { value: 50, label: '$50', type: 'moneda' },
  ],
  MX: [
    { value: 1000, label: '$1.000', type: 'billete' },
    { value: 500, label: '$500', type: 'billete' },
    { value: 200, label: '$200', type: 'billete' },
    { value: 100, label: '$100', type: 'billete' },
    { value: 50, label: '$50', type: 'billete' },
    { value: 20, label: '$20', type: 'billete' },
    { value: 10, label: '$10', type: 'moneda' },
    { value: 5, label: '$5', type: 'moneda' },
    { value: 2, label: '$2', type: 'moneda' },
    { value: 1, label: '$1', type: 'moneda' },
  ],
  AR: [
    { value: 100000, label: '$100.000', type: 'billete' },
    { value: 50000, label: '$50.000', type: 'billete' },
    { value: 20000, label: '$20.000', type: 'billete' },
    { value: 10000, label: '$10.000', type: 'billete' },
    { value: 5000, label: '$5.000', type: 'billete' },
    { value: 2000, label: '$2.000', type: 'billete' },
    { value: 1000, label: '$1.000', type: 'billete' },
    { value: 500, label: '$500', type: 'moneda' },
    { value: 200, label: '$200', type: 'moneda' },
    { value: 100, label: '$100', type: 'moneda' },
  ],
  PE: [
    { value: 200, label: 'S/ 200', type: 'billete' },
    { value: 100, label: 'S/ 100', type: 'billete' },
    { value: 50, label: 'S/ 50', type: 'billete' },
    { value: 20, label: 'S/ 20', type: 'billete' },
    { value: 10, label: 'S/ 10', type: 'billete' },
    { value: 5, label: 'S/ 5', type: 'moneda' },
    { value: 2, label: 'S/ 2', type: 'moneda' },
    { value: 1, label: 'S/ 1', type: 'moneda' },
  ],
  CL: [
    { value: 20000, label: '$20.000', type: 'billete' },
    { value: 10000, label: '$10.000', type: 'billete' },
    { value: 5000, label: '$5.000', type: 'billete' },
    { value: 2000, label: '$2.000', type: 'billete' },
    { value: 1000, label: '$1.000', type: 'billete' },
    { value: 500, label: '$500', type: 'moneda' },
    { value: 100, label: '$100', type: 'moneda' },
    { value: 50, label: '$50', type: 'moneda' },
    { value: 10, label: '$10', type: 'moneda' },
    { value: 5, label: '$5', type: 'moneda' },
    { value: 1, label: '$1', type: 'moneda' },
  ],
  BR: [
    { value: 200, label: 'R$ 200', type: 'billete' },
    { value: 100, label: 'R$ 100', type: 'billete' },
    { value: 50, label: 'R$ 50', type: 'billete' },
    { value: 20, label: 'R$ 20', type: 'billete' },
    { value: 10, label: 'R$ 10', type: 'billete' },
    { value: 5, label: 'R$ 5', type: 'moneda' },
    { value: 2, label: 'R$ 2', type: 'moneda' },
    { value: 1, label: 'R$ 1', type: 'moneda' },
    { value: 0.50, label: 'R$ 0,50', type: 'moneda' },
    { value: 0.25, label: 'R$ 0,25', type: 'moneda' },
    { value: 0.10, label: 'R$ 0,10', type: 'moneda' },
  ],
  // Default for USD-using countries (US, EC, PA, SV)
  US: [
    { value: 100, label: '$100', type: 'billete' },
    { value: 50, label: '$50', type: 'billete' },
    { value: 20, label: '$20', type: 'billete' },
    { value: 10, label: '$10', type: 'billete' },
    { value: 5, label: '$5', type: 'billete' },
    { value: 2, label: '$2', type: 'billete' },
    { value: 1, label: '$1', type: 'billete' },
    { value: 0.50, label: '$0,50', type: 'moneda' },
    { value: 0.25, label: '$0,25', type: 'moneda' },
    { value: 0.10, label: '$0,10', type: 'moneda' },
    { value: 0.05, label: '$0,05', type: 'moneda' },
    { value: 0.01, label: '$0,01', type: 'moneda' },
  ],
  // Euro zone
  ES: [
    { value: 500, label: '€500', type: 'billete' },
    { value: 200, label: '€200', type: 'billete' },
    { value: 100, label: '€100', type: 'billete' },
    { value: 50, label: '€50', type: 'billete' },
    { value: 20, label: '€20', type: 'billete' },
    { value: 10, label: '€10', type: 'billete' },
    { value: 5, label: '€5', type: 'billete' },
    { value: 2, label: '€2', type: 'moneda' },
    { value: 1, label: '€1', type: 'moneda' },
    { value: 0.50, label: '€0,50', type: 'moneda' },
    { value: 0.20, label: '€0,20', type: 'moneda' },
    { value: 0.10, label: '€0,10', type: 'moneda' },
    { value: 0.05, label: '€0,05', type: 'moneda' },
    { value: 0.02, label: '€0,02', type: 'moneda' },
    { value: 0.01, label: '€0,01', type: 'moneda' },
  ],
}

// Fallback denominations for countries not explicitly listed
const DEFAULT_DENOMINATIONS = [
  { value: 1000, label: '$1.000', type: 'billete' },
  { value: 500, label: '$500', type: 'billete' },
  { value: 200, label: '$200', type: 'billete' },
  { value: 100, label: '$100', type: 'billete' },
  { value: 50, label: '$50', type: 'billete' },
  { value: 20, label: '$20', type: 'billete' },
  { value: 10, label: '$10', type: 'moneda' },
  { value: 5, label: '$5', type: 'moneda' },
  { value: 1, label: '$1', type: 'moneda' },
]

function getDenominations(country: string): Array<{ value: number; label: string; type: string }> {
  // Map USD-based countries to US denominations
  const usdCountries = ['EC', 'PA', 'SV']
  const eurCountries = ['DE', 'FR', 'IT', 'ES']
  const key = usdCountries.includes(country) ? 'US' 
    : eurCountries.includes(country) ? 'ES' 
    : country
  return DENOMINATIONS_BY_COUNTRY[key] || DEFAULT_DENOMINATIONS
}

const MAX_INITIAL = 500000

/** Helper to filter numeric input (digits, comma, period only) and enforce max */
const numericFilter = (value: string) => {
  const cleaned = value.replace(/[^0-9.,]/g, '')
  const num = parseFloat(cleaned.replace(/,/g, '')) || 0
  if (num > MAX_INITIAL) {
    // If exceeds max, clamp to max
    return MAX_INITIAL.toString()
  }
  return cleaned
}

export function CashRegisterView() {
  const { user, permissions } = useAuth()
  const { branches, selectedBranchId, setSelectedBranchId } = useAppStore()
  const canManageCash = permissions.canManageCash
  const { fmtBase } = useCurrency()
  const country = useSetting('country')

  const denominations = useMemo(() => getDenominations(country || 'VE'), [country])

  /** Format number with thousands separator for display */
  const fmt = (val: number) => val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBranchId, setFilterBranchId] = useState<string>(selectedBranchId || '')
  const [showOpen, setShowOpen] = useState(false)
  const [showMovement, setShowMovement] = useState(false)
  const [movementRegId, setMovementRegId] = useState<string | null>(null)
  const [showClose, setShowClose] = useState(false)
  const [closeRegId, setCloseRegId] = useState<string | null>(null)
  const [initialAmt, setInitialAmt] = useState('100')
  const [registerName, setRegisterName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [availableUsers, setAvailableUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [moveType, setMoveType] = useState('entrada')
  const [moveAmount, setMoveAmount] = useState('')
  const [moveConcept, setMoveConcept] = useState('')
  const [saving, setSaving] = useState(false)
  const [closeActual, setCloseActual] = useState('')
  const [closingAll, setClosingAll] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [showCloseAllConfirm, setShowCloseAllConfirm] = useState(false)

  // Retiro de Excedente state
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [withdrawalRegId, setWithdrawalRegId] = useState<string | null>(null)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalConcept, setWithdrawalConcept] = useState('')

  // Arqueo de Caja state
  const [showAudit, setShowAudit] = useState(false)
  const [auditRegId, setAuditRegId] = useState<string | null>(null)
  const [auditBreakdown, setAuditBreakdown] = useState<Record<string, string>>({})
  const [auditNotes, setAuditNotes] = useState('')
  const [auditResult, setAuditResult] = useState<{ counted: number; expected: number; difference: number } | null>(null)

  // Register closure alert for cashiers
  const [showClosedAlert, setShowClosedAlert] = useState(false)
  const [closedInfo, setClosedInfo] = useState<{ name: string | null; branchName: string; actual: number; cutDate: string } | null>(null)

  const fetchData = async (branchOverride?: string) => {
    try {
      const branchParam = branchOverride || filterBranchId || selectedBranchId || ''
      const url = branchParam
        ? `/api/cash-register?branchId=${branchParam}`
        : '/api/cash-register'
      const regs = await api.get<CashRegister[]>(url)
      setRegisters(regs)

      if (canManageCash) {
        const users = await api.get<{ id: string; name: string; role: string; active: boolean }[]>('/api/users?role=cajero')
        setAvailableUsers(users.filter(u => u.active))
      }
    } catch {
      toast.error('Error al cargar caja')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const mainBranch = branches.find(b => b.isMain && b.active)
    const targetBranch = selectedBranchId || mainBranch?.id || ''
    if (targetBranch && targetBranch !== filterBranchId) {
      setFilterBranchId(targetBranch)
    }
  }, [selectedBranchId, branches])

  useEffect(() => {
    const mainBranch = branches.find(b => b.isMain && b.active)
    const defaultBranch = selectedBranchId || mainBranch?.id || ''
    setFilterBranchId(defaultBranch)
  }, [])

  useEffect(() => {
    if (filterBranchId) {
      fetchData(filterBranchId)
    }
  }, [filterBranchId])

  useEffect(() => {
    if (canManageCash || !user?.id) return
    api.get<{ wasClosed: boolean; register?: { name: string | null; branchName: string; closingDate: string; actual: number; cutDate: string } }>(`/api/cash-register/check?userId=${user.id}`)
      .then((result) => {
        if (result.wasClosed && result.register) {
          setClosedInfo(result.register)
          setShowClosedAlert(true)
        }
      })
      .catch(() => {})
  }, [canManageCash, user?.id])

  const openRegisters = registers.filter(r => r.status === 'abierta')
  const closedRegisters = registers.filter(r => r.status === 'cerrada')
  const totalOpenAmt = openRegisters.reduce((sum, r) => sum + r.currentAmt, 0)
  const totalSales = openRegisters.reduce((sum, r) => sum + r._count.sales, 0)

  // Fix 6: Filter out users that already have an open register
  const usersWithOpenBox = new Set(openRegisters.map(r => r.user.id))
  const filteredUsers = availableUsers.filter(u => !usersWithOpenBox.has(u.id))

  // Fix 14/19: Auto-refresh every 30s when there are open registers
  useEffect(() => {
    if (openRegisters.length === 0) return
    const interval = setInterval(() => { fetchData(filterBranchId) }, 30000)
    return () => clearInterval(interval)
  }, [openRegisters.length, filterBranchId])

  // Fix 14/19: Refresh when user returns to the tab
  useEffect(() => {
    const onFocus = () => { if (openRegisters.length > 0) fetchData(filterBranchId) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [openRegisters.length, filterBranchId])

  const openCreateDialog = () => {
    setInitialAmt('')
    setRegisterName('')
    setSelectedUserId('')
    setShowOpen(true)
  }

  const openRegister = async () => {
    setSaving(true)
    try {
      const effectiveUserId = selectedUserId || user?.id || ''
      if (!effectiveUserId) {
        toast.error('Debe seleccionar un cajero')
        setSaving(false)
        return
      }
      const targetBranch = filterBranchId || selectedBranchId || ''
      if (!targetBranch) {
        toast.error('No hay sucursal seleccionada')
        setSaving(false)
        return
      }
      const amt = parseFloat(initialAmt) || 0
      // Fix 1: Cap initial amount at MAX_INITIAL
      if (amt > MAX_INITIAL) {
        toast.error(`El monto inicial no puede exceder Bs ${MAX_INITIAL.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
        setSaving(false)
        return
      }
      await api.post('/api/cash-register/open', {
        userId: effectiveUserId,
        initialAmt: amt,
        name: registerName.trim() || undefined,
        branchId: targetBranch,
      })
      toast.success('Caja abierta exitosamente')
      setShowOpen(false)
      setRegisterName('')
      setSelectedUserId('')
      setInitialAmt('') // Fix 5: Reset initial amount after success
      fetchData(targetBranch)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al abrir caja'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const addMovement = async () => {
    if (!moveAmount || !moveConcept) {
      toast.error('Monto y concepto son obligatorios')
      return
    }
    if (!movementRegId) {
      toast.error('No se seleccionó caja')
      return
    }
    setSaving(true)
    try {
      const currencies = await api.get<Array<{ id: string; isBase: boolean }>>('/api/currencies')
      const baseCurrency = currencies.find(c => c.isBase)
      await api.post('/api/cash-register/movement', {
        cashRegId: movementRegId,
        type: moveType,
        amount: parseFloat(moveAmount),
        concept: moveConcept,
        currencyId: baseCurrency?.id || currencies[0]?.id || '',
        userId: user?.id || '',
      })
      toast.success('Movimiento registrado')
      setShowMovement(false)
      setMoveAmount('')
      setMoveConcept('')
      setMovementRegId(null)
      fetchData(filterBranchId)
    } catch {
      toast.error('Error al registrar movimiento')
    } finally {
      setSaving(false)
    }
  }

  const closeRegister = async () => {
    if (!closeRegId) return
    // Fix 17: Validate closeActual is provided
    if (!closeActual || parseFloat(closeActual) < 0) {
      toast.error('Debe ingresar el monto real en caja')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/cash-register/close', {
        cashRegId: closeRegId,
        actual: parseFloat(closeActual),
      })
      toast.success('Caja cerrada exitosamente')
      setShowClose(false)
      setCloseRegId(null)
      setCloseActual('')
      fetchData(filterBranchId)
    } catch {
      toast.error('Error al cerrar caja')
    } finally {
      setSaving(false)
    }
  }

  const handleWithdrawal = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast.error('El monto debe ser mayor a cero')
      return
    }
    if (!withdrawalRegId) {
      toast.error('No se seleccionó caja')
      return
    }
    setSaving(true)
    try {
      const currencies = await api.get<Array<{ id: string; isBase: boolean }>>('/api/currencies')
      const baseCurrency = currencies.find(c => c.isBase)
      const result = await api.post<{ amount: number }>('/api/cash-register/withdrawal', {
        cashRegId: withdrawalRegId,
        amount: parseFloat(withdrawalAmount),
        concept: withdrawalConcept.trim() || undefined,
        currencyId: baseCurrency?.id || currencies[0]?.id || '',
        userId: user?.id || '',
      })
      // Fix 9: Use fmt() in withdrawal toast
      toast.success(`Retiro de excedente por ${fmtBase(result.amount)} registrado`)
      setShowWithdrawal(false)
      setWithdrawalAmount('')
      setWithdrawalConcept('')
      setWithdrawalRegId(null)
      fetchData(filterBranchId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar retiro'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleAudit = async () => {
    if (!auditRegId) {
      toast.error('No se seleccionó caja')
      return
    }
    setSaving(true)
    try {
      const numericBreakdown: Record<string, number> = {}
      for (const [key, val] of Object.entries(auditBreakdown)) {
        const num = parseFloat(val) || 0
        if (num > 0) numericBreakdown[key] = num
      }
      if (Object.keys(numericBreakdown).length === 0) {
        toast.error('Debe ingresar al menos una denominación')
        setSaving(false)
        return
      }
      const result = await api.post<{ counted: number; expected: number; difference: number }>(
        '/api/cash-register/audit',
        {
          cashRegId: auditRegId,
          userId: user?.id || '',
          breakdown: numericBreakdown,
          notes: auditNotes.trim() || undefined,
        }
      )
      setAuditResult(result)
      toast.success('Arqueo de caja registrado')
      // Fix 12: Refresh main view after audit
      fetchData(filterBranchId)
      // Fix 11: Auto-close audit dialog after 3 seconds
      setTimeout(() => { resetAuditDialog() }, 3000)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar arqueo'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const resetAuditDialog = () => {
    setShowAudit(false)
    setAuditRegId(null)
    setAuditBreakdown({})
    setAuditNotes('')
    setAuditResult(null)
  }

  const closeAllRegisters = async () => {
    setClosingAll(true)
    setShowCloseAllConfirm(false)
    try {
      const result = await api.post<{ message: string }>('/api/cash-register/close-all', {
        branchId: filterBranchId || undefined,
      })
      toast.success(result.message)
      fetchData(filterBranchId)
    } catch {
      toast.error('Error al cerrar todas las cajas')
    } finally {
      setClosingAll(false)
    }
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTimeShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-5">

      {/* Register Closure Alert for Cashiers */}
      {showClosedAlert && closedInfo && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4">
            <div className="rounded-full bg-red-100 dark:bg-red-900/50 p-4">
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-700 dark:text-red-400">Tu Caja Ha Sido Cerrada</h2>
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                La caja &quot;{closedInfo.name || 'Sin nombre'}&quot; en la sucursal &quot;{closedInfo.branchName}&quot;
                ha sido cerrada por un administrador.
              </p>
              <div className="mt-3 rounded-md bg-white dark:bg-gray-900 p-3 text-sm">
                {/* Fix 9: Use fmt() in cashier alert */}
                <p className="text-muted-foreground">Monto final: <span className="font-bold">{fmtBase(closedInfo.actual)}</span></p>
                <p className="text-muted-foreground">Fecha de cierre: {new Date(closedInfo.cutDate).toLocaleString('es-VE')}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => {
              setShowClosedAlert(false)
              setClosedInfo(null)
              fetchData(filterBranchId)
            }}>
              Entendido
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== MAIN HEADER: Summary + Actions ===== */}
      <Card className="overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Left: Main summary */}
          <div className="flex-1 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent p-5 lg:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 max-w-full">
                {/* Fix 7: Changed label to "Efectivo Global en Cajas" */}
                <p className="text-sm text-muted-foreground font-medium">Efectivo Global en Cajas</p>
                {/* Fix 3: Use fmt() + Fix 4: tabular-nums truncate */}
                <p className="text-3xl font-bold tracking-tight text-primary tabular-nums truncate max-w-full">
                  {fmtBase(totalOpenAmt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CircleDollarSign className="h-4 w-4" />
                <span>
                  {openRegisters.length > 0
                    ? `${openRegisters.length} caja${openRegisters.length > 1 ? 's' : ''} abierta${openRegisters.length > 1 ? 's' : ''}`
                    : 'Sin cajas abiertas'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShoppingCart className="h-4 w-4" />
                <span>{totalSales} venta{totalSales !== 1 ? 's' : ''}</span>
              </div>
              {openRegisters.length > 0 && (
                <div className={`flex items-center gap-1.5 font-medium ${openRegisters.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  <div className={`h-2 w-2 rounded-full ${openRegisters.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                  Operativa
                </div>
              )}
            </div>
            {/* Fix 7: Breakdown when multiple open registers */}
            {openRegisters.length > 1 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                {openRegisters.map(r => (
                  <span key={r.id}>{r.name || r.user.name}: {fmtBase(r.currentAmt)}</span>
                ))}
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="border-t lg:border-t-0 lg:border-l p-4 lg:p-6 bg-muted/30 flex flex-col gap-2 justify-center min-w-[200px]">
            {canManageCash && (
              <>
                <Button data-tutorial="cash-open-btn" className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-white" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" /> Abrir Caja
                </Button>
                {openRegisters.length > 0 && (
                  <>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => {
                      if (openRegisters.length === 1) setMovementRegId(openRegisters[0].id)
                      setShowMovement(true)
                    }}>
                      <ArrowDownCircle className="h-4 w-4" /> Movimiento
                    </Button>
                    {/* Fix 18: Show AlertDialog confirmation before closing all */}
                    <Button variant="outline" className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setShowCloseAllConfirm(true)} disabled={closingAll}>
                      {closingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Cerrar Todas
                    </Button>
                  </>
                )}
              </>
            )}
            {!canManageCash && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <UserCircle className="h-4 w-4" />
                Modo cajero - solo lectura
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ===== OPEN REGISTERS (Card layout) ===== */}
      {openRegisters.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Cajas Abiertas
            </h2>
          </div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {openRegisters.map((reg) => {
              const earnings = reg.currentAmt - reg.initialAmt
              const isPositive = earnings >= 0
              return (
                <Card key={reg.id} className="relative overflow-hidden border-l-4 border-l-emerald-500">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base truncate">
                          {reg.name || 'Sin nombre'}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                          <UserCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{reg.user.name}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 shrink-0">
                        Abierta
                      </Badge>
                    </div>

                    {/* Amounts - Fix 3: Use fmt() + Fix 4: tabular-nums */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Inicial</p>
                        <p className="text-sm font-semibold tabular-nums">{fmtBase(reg.initialAmt)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Actual</p>
                        <p className="text-lg font-bold text-primary tabular-nums">{fmtBase(reg.currentAmt)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                          <TrendingUp className="h-3 w-3 inline" />
                        </p>
                        <p className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                          {isPositive ? '+' : ''}{fmt(earnings)}
                        </p>
                      </div>
                    </div>

                    {/* Meta info - Fix 8: Added movements count */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Apertura: {formatTimeShort(reg.openingDate)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {reg.branch.name}
                      </div>
                      <div className="flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3" />
                        {reg._count.sales} venta{reg._count.sales !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-1">
                        <ArrowUpCircle className="h-3 w-3" />
                        {reg._count.movements} movimiento{reg._count.movements !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <Separator />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {canManageCash && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 px-2.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30" onClick={() => {
                                setMovementRegId(reg.id)
                                setShowMovement(true)
                              }}>
                                <ArrowDownCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Movimiento</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 px-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => {
                                setCloseRegId(reg.id)
                                setCloseActual('')
                                setShowClose(true)
                              }}>
                                <Lock className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cerrar Caja</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 px-2.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30" onClick={() => {
                            setWithdrawalRegId(reg.id)
                            setShowWithdrawal(true)
                          }}>
                            <Banknote className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Retiro de Excedente</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 px-2.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={() => {
                            setAuditRegId(reg.id)
                            setShowAudit(true)
                          }}>
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Arqueo de Caja</TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* No registers open - Empty state */}
      {openRegisters.length === 0 && canManageCash && (
        <Card className="border-dashed">
          <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="rounded-full bg-muted p-4">
              <Wallet className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground">No hay cajas abiertas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Abre una nueva caja para comenzar a registrar ventas y movimientos.
              </p>
            </div>
            <Button data-tutorial="cash-open-btn" className="bg-primary hover:bg-primary/90 text-white" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" /> Abrir Caja
            </Button>
          </CardContent>
        </Card>
      )}

      {openRegisters.length === 0 && !canManageCash && (
        <Card className="border-dashed">
          <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="rounded-full bg-muted p-4">
              <Wallet className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground">No hay cajas abiertas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Un administrador debe abrir una caja para que puedas operar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== HISTORY ===== */}
      {closedRegisters.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Historial de Cajas
            </h2>
            <Badge variant="secondary" className="text-xs">
              {closedRegisters.length} registro{closedRegisters.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {closedRegisters.map((reg) => {
                  const isExpanded = expandedHistory === reg.id
                  const earnings = reg.currentAmt - reg.initialAmt
                  const isPositive = earnings >= 0
                  return (
                    <div key={reg.id}>
                      {/* Collapsible header */}
                      <button
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                        onClick={() => setExpandedHistory(isExpanded ? null : reg.id)}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        }
                        <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{reg.name || 'Sin nombre'}</p>
                            <p className="text-xs text-muted-foreground">{reg.user.name}</p>
                          </div>
                          <div className="hidden sm:block text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {formatTime(reg.openingDate)}
                          </div>
                          {/* Fix 3: Use fmt() in history list */}
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">{fmtBase(reg.currentAmt)}</p>
                            <p className={`text-xs tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isPositive ? '+' : ''}{fmt(earnings)}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700">
                              {reg.branch?.name || '—'}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              <ShoppingCart className="h-3 w-3 inline mr-1" />
                              {reg._count.sales} venta{reg._count.sales !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pl-10">
                          {/* Fix 3: Use fmt() in history expanded details */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-md bg-muted/50 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Cajero</p>
                              <p className="font-medium">{reg.user.name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Sucursal</p>
                              <p className="font-medium">{reg.branch?.name || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Apertura</p>
                              <p className="font-medium">{formatTime(reg.openingDate)}</p>
                            </div>
                            {reg.closingDate && (
                              <div>
                                <p className="text-xs text-muted-foreground">Cierre</p>
                                <p className="font-medium">{formatTime(reg.closingDate)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-muted-foreground">Monto Inicial</p>
                              <p className="font-medium tabular-nums">{fmtBase(reg.initialAmt)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Monto Final</p>
                              <p className="font-bold tabular-nums">{fmtBase(reg.currentAmt)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Diferencia</p>
                              <p className={`font-bold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                {isPositive ? '+' : ''}{fmt(earnings)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Ventas</p>
                              <p className="font-medium">{reg._count.sales}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Show all in table if there are no closed registers but there are registers */}
      {closedRegisters.length === 0 && registers.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No hay registros de caja
          </CardContent>
        </Card>
      )}

      {/* ===== DIALOGS ===== */}

      {/* Open Dialog */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Abrir Caja
            </DialogTitle>
            <DialogDescription>Selecciona el cajero y el monto inicial para abrir una nueva caja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cajero Asignado *</Label>
              {/* Fix 6: Use filteredUsers instead of availableUsers */}
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cajero" /></SelectTrigger>
                <SelectContent>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="flex items-center gap-2">
                          <UserCircle className="h-3 w-3" />
                          {u.name}
                        </span>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {availableUsers.length > 0
                        ? 'Todos los cajeros tienen una caja abierta'
                        : 'No hay cajeros disponibles'}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {/* Fix 6: Note when all cashiers have open boxes */}
              {filteredUsers.length === 0 && availableUsers.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Todos los cajeros disponibles ya tienen una caja abierta.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="regname">Nombre de la Caja (opcional)</Label>
              <Input id="regname" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Ej: Caja Principal, Caja 2..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial">Monto Inicial</Label>
              {/* Fix 1: max="500000" + Fix 2: text inputMode numeric + cash-input */}
              <Input
                id="initial"
                type="text"
                inputMode="numeric"
                className={`cash-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] ${parseFloat(initialAmt.replace(/,/g, '')) >= MAX_INITIAL ? 'border-amber-500 focus-visible:ring-amber-500' : ''}`}
                value={initialAmt}
                onChange={(e) => setInitialAmt(numericFilter(e.target.value))}
                placeholder="0.00"
              />
              <p className={`text-xs ${parseFloat(initialAmt.replace(/,/g, '')) >= MAX_INITIAL ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}`}>Máximo permitido: Bs 500.000,00</p>
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={openRegister} disabled={saving || !selectedUserId}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Abriendo...</> : 'Abrir Caja'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={showMovement} onOpenChange={(open) => {
        if (!open) {
          setShowMovement(false)
          setMovementRegId(null)
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-blue-600" />
              Registrar Movimiento
            </DialogTitle>
            <DialogDescription>Registra una entrada o salida de efectivo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openRegisters.length > 1 && (
              <div className="space-y-2">
                <Label>Caja</Label>
                <Select value={movementRegId || ''} onValueChange={setMovementRegId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        {/* Fix 3: Use fmt() in movement select label */}
                        {reg.name || reg.user.name} — {fmtBase(reg.currentAmt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={moveType} onValueChange={setMoveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">
                    <span className="flex items-center gap-2">
                      <ArrowUpCircle className="h-3 w-3 text-emerald-600" /> Entrada
                    </span>
                  </SelectItem>
                  <SelectItem value="salida">
                    <span className="flex items-center gap-2">
                      <ArrowDownCircle className="h-3 w-3 text-red-600" /> Salida
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mamt">Monto</Label>
              {/* Fix 2: text inputMode numeric + cash-input */}
              <Input
                id="mamt"
                type="text"
                inputMode="numeric"
                className="cash-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                value={moveAmount}
                onChange={(e) => setMoveAmount(numericFilter(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mconcept">Concepto *</Label>
              <Input id="mconcept" value={moveConcept} onChange={(e) => setMoveConcept(e.target.value)} placeholder="Descripción del movimiento" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={addMovement} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando...</> : 'Registrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Dialog */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-600" />
              Cerrar Caja
            </DialogTitle>
            <DialogDescription>Confirma el monto real en caja para cerrar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {closeRegId && (() => {
              const reg = registers.find(r => r.id === closeRegId)
              return reg ? (
                <div className="rounded-md bg-muted p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-medium">{reg.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cajero:</span>
                    <span className="font-medium">{reg.user.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto esperado:</span>
                    {/* Fix 3: Use fmt() in close dialog */}
                    <span className="font-bold tabular-nums">{fmtBase(reg.currentAmt)}</span>
                  </div>
                </div>
              ) : null
            })()}
            <div className="space-y-2">
              <Label htmlFor="closeamt">Monto Real en Caja *</Label>
              {/* Fix 2: text inputMode numeric + cash-input */}
              {/* Fix 15: Use correct register for placeholder */}
              <Input
                id="closeamt"
                type="text"
                inputMode="numeric"
                className="cash-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                value={closeActual}
                onChange={(e) => setCloseActual(numericFilter(e.target.value))}
                placeholder={closeRegId ? fmt(registers.find(r => r.id === closeRegId)?.currentAmt || 0) : '0,00'}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Se enviará un correo electrónico al administrador con el resumen del cierre.
            </p>
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white" onClick={closeRegister} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cerrando...</> : 'Confirmar Cierre'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retiro de Excedente Dialog */}
      <Dialog open={showWithdrawal} onOpenChange={(open) => {
        if (!open) {
          setShowWithdrawal(false)
          setWithdrawalRegId(null)
          setWithdrawalAmount('')
          setWithdrawalConcept('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-orange-600" />
              Retiro de Excedente
            </DialogTitle>
            <DialogDescription>Retira el efectivo excedente de la caja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openRegisters.length > 1 && (
              <div className="space-y-2">
                <Label>Caja</Label>
                <Select value={withdrawalRegId || ''} onValueChange={setWithdrawalRegId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        {/* Fix 3: Use fmt() in withdrawal select label */}
                        {reg.name || reg.user.name} — {fmtBase(reg.currentAmt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {withdrawalRegId && (() => {
              const reg = registers.find(r => r.id === withdrawalRegId)
              if (!reg) return null
              return (
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-medium">{reg.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo actual:</span>
                    {/* Fix 3: Use fmt() in withdrawal card */}
                    <span className="font-bold text-primary tabular-nums">{fmtBase(reg.currentAmt)}</span>
                  </div>
                </div>
              )
            })()}
            <div className="space-y-2">
              <Label htmlFor="wamt">Monto a Retirar</Label>
              {/* Fix 2: text inputMode numeric + cash-input */}
              <Input
                id="wamt"
                type="text"
                inputMode="numeric"
                className="cash-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                min="0"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(numericFilter(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wconcept">Concepto (opcional)</Label>
              <Input
                id="wconcept"
                value={withdrawalConcept}
                onChange={(e) => setWithdrawalConcept(e.target.value)}
                placeholder="Razón del retiro..."
              />
            </div>
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleWithdrawal}
              disabled={saving || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0}
            >
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando...</> : 'Registrar Retiro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arqueo de Caja Dialog */}
      <Dialog open={showAudit} onOpenChange={(open) => {
        if (!open) resetAuditDialog()
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              Arqueo de Caja
            </DialogTitle>
            <DialogDescription>Verificación del efectivo en caja por denominación.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openRegisters.length > 1 && (
              <div className="space-y-2">
                <Label>Caja</Label>
                <Select value={auditRegId || ''} onValueChange={setAuditRegId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        {/* Fix 3: Use fmt() in audit select label */}
                        {reg.name || reg.user.name} — {fmtBase(reg.currentAmt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {auditRegId && (() => {
              const reg = registers.find(r => r.id === auditRegId)
              if (!reg) return null
              return (
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-medium">{reg.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto esperado:</span>
                    {/* Fix 3: Use fmt() in audit card */}
                    <span className="font-bold text-primary tabular-nums">{fmtBase(reg.currentAmt)}</span>
                  </div>
                </div>
              )
            })()}

            <div className="space-y-3">
              {/* Denominations for the configured country */}
              <Label className="text-sm font-medium">Denominaciones ({country || 'VE'})</Label>
              <div className="grid grid-cols-2 gap-2">
                {denominations.map((denom) => (
                  <div key={denom.value} className="flex items-center gap-2">
                    <span className="text-xs font-mono w-16 text-right shrink-0 text-muted-foreground">
                      {denom.label}
                    </span>
                    {/* Fix 2: text inputMode numeric + cash-input */}
                    <Input
                      type="text"
                      inputMode="numeric"
                      min="0"
                      className="h-8 text-sm cash-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                      placeholder="0"
                      value={auditBreakdown[denom.value.toString()] || ''}
                      onChange={(e) =>
                        setAuditBreakdown((prev) => ({
                          ...prev,
                          [denom.value.toString()]: numericFilter(e.target.value),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total contado:</span>
                {/* Fix 3: Use fmt() for audit total */}
                <span className="font-bold text-lg tabular-nums">
                  {fmtBase(Object.entries(auditBreakdown).reduce(
                    (sum, [denom, qty]) => sum + parseFloat(denom) * (parseFloat(qty) || 0),
                    0
                  ))}
                </span>
              </div>
              {auditRegId && (() => {
                const reg = registers.find(r => r.id === auditRegId)
                if (!reg) return null
                const counted = Object.entries(auditBreakdown).reduce(
                  (sum, [denom, qty]) => sum + parseFloat(denom) * (parseFloat(qty) || 0),
                  0
                )
                const diff = counted - reg.currentAmt
                return (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Diferencia:</span>
                    {/* Fix 3: Use fmt() for audit difference */}
                    <span className={`font-bold tabular-nums ${diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? '+' : ''}{fmt(diff)}
                      {diff > 0 && ' (Sobrante)'}
                      {diff < 0 && ' (Faltante)'}
                      {diff === 0 && ' (Cuadrado)'}
                    </span>
                  </div>
                )
              })()}
            </div>

            {auditResult && (
              <div className={`rounded-md p-4 text-center ${
                auditResult.difference === 0
                  ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                  : auditResult.difference > 0
                    ? 'bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                    : 'bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800'
              }`}>
                {auditResult.difference === 0 ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
                    <p className="font-bold text-emerald-700 dark:text-emerald-400">Cuadrado</p>
                  </>
                ) : auditResult.difference > 0 ? (
                  <p className="font-bold text-amber-700 dark:text-amber-400">
                    {/* Fix 3: Use fmt() for audit result amounts */}
                    Sobrante: {fmtBase(auditResult.difference)}
                  </p>
                ) : (
                  <p className="font-bold text-red-700 dark:text-red-400">
                    Faltante: {fmtBase(Math.abs(auditResult.difference))}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <p>Esperado: {fmtBase(auditResult.expected)}</p>
                  <p>Contado: {fmtBase(auditResult.counted)}</p>
                </div>
                {/* Fix 10: Show message when difference detected */}
                {auditResult.difference !== 0 && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Se detectó diferencia. El saldo actualizado se reflejará en el próximo cierre.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="auditnotes">Notas (opcional)</Label>
              <Textarea
                id="auditnotes"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                placeholder="Observaciones del arqueo..."
                rows={2}
              />
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleAudit}
              disabled={saving}
            >
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando...</> : auditResult ? 'Registrar Nuevo Arqueo' : 'Registrar Arqueo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fix 18: Close All Confirm AlertDialog */}
      <AlertDialog open={showCloseAllConfirm} onOpenChange={setShowCloseAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-600" />
              Cerrar Todas las Cajas
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de cerrar todas las cajas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caja</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead className="text-right">Monto Actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openRegisters.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell className="font-medium">{reg.name || 'Sin nombre'}</TableCell>
                    <TableCell>{reg.user.name}</TableCell>
                    {/* Fix 3: Use fmt() in close all confirmation */}
                    <TableCell className="text-right font-semibold tabular-nums">{fmtBase(reg.currentAmt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between font-bold">
                <span>Total global:</span>
                <span className="tabular-nums">{fmtBase(totalOpenAmt)}</span>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={closeAllRegisters}
              disabled={closingAll}
            >
              {closingAll ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cerrando...</> : 'Confirmar Cierre'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </TooltipProvider>
  )
}
