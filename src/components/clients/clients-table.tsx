'use client'

import { useEffect, useState } from 'react'
import { api, fetcher } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Search, Users, DollarSign, Loader2, Receipt, Truck, X, Trash2, Printer, FileText, Mail, Pencil, Phone, MapPin, ShoppingCart, Eye, EyeOff, AlertTriangle, CircleDollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { useSetting } from '@/stores/use-app-store'
import { useCurrency } from '@/hooks/use-currency'
import { FALLBACK_METHODS } from '@/lib/payment-methods'

interface PaymentMethodOption {
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
}

interface Client {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  note: string | null
  deletedAt: string | null
  pendingBalance: number
  balanceByCurrency: Record<string, number>
  _count: { sales: number }
}

interface SaleRecord {
  id: string
  date: string
  total: number
  status: string
  user: { name: string }
  branch: { name: string }
  payments: Array<{ method: string; amount: number; currency: { code: string; symbol: string } }>
  lines: Array<{ product: { name: string; currency?: { code: string } }; quantity: number; unitPrice: number; lineTotal: number; currencyCode?: string }>
  receivables: Array<{ pendingBalance: number; status: string; dueDate: string | null; currency?: { code: string } }>
}

interface ProductOption {
  id: string
  name: string
  price: number
  currency: { symbol: string; code: string }
  inventories: Array<{ stock: number; branchId: string }>
}

interface DispatchLine {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  stock: number
  currencyCode: string
}

interface ClientPaymentRecord {
  id: string
  amount: number
  method: string
  reference: string | null
  createdAt: string
  user: { name: string }
  currency: { code: string; symbol: string } | null
}

export function ClientsTable() {
  const { user, permissions } = useAuth()
  const canManage = permissions.canManageClients
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNote, setFormNote] = useState('')

  // Sales/dispatch history dialog
  const [historyClient, setHistoryClient] = useState<Client | null>(null)
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)

  // Sale lines detail modal
  const [detailSale, setDetailSale] = useState<SaleRecord | null>(null)

  // Client payments list
  const [clientPayments, setClientPayments] = useState<ClientPaymentRecord[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<ClientPaymentRecord | null>(null)
  const [deleteSaleTarget, setDeleteSaleTarget] = useState<SaleRecord | null>(null)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)

  // Statement email
  const [sendingStatement, setSendingStatement] = useState<string | null>(null)

  // Payment dialog
  const [paymentClient, setPaymentClient] = useState<Client | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paying, setPaying] = useState(false)
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)
  const baseCurrencyId = useSetting('baseCurrencyId')
  const country = useSetting('country') || 'VE'
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])

  const referenceCurrency = useSetting('referenceCurrency')
  const { sym: currencySymbol, baseSym, baseCode, rate: exchangeRate, fmt, fmtWith } = useCurrency()
  const selectedPm = paymentMethods.find(m => m.code === paymentMethod)
  const isLocalMethod = selectedPm?.isLocalCurrency ?? false

  // Helper: format client debt with correct currency symbols
  const fmtDebt = (client: Client): string => {
    const byCurrency = client.balanceByCurrency || {}
    const entries = Object.entries(byCurrency).filter(([, amt]) => amt > 0)
    if (entries.length === 0) return fmtWith(client.pendingBalance, baseCode || undefined)
    return entries.map(([code, amt]) => fmtWith(amt, code || baseCode || undefined)).join(' + ')
  }

  // Helper: compute per-currency totals from sale lines
  const saleCurrencyTotals = (sale: SaleRecord): { code: string; total: number }[] => {
    const byCurrency: Record<string, number> = {}
    for (const line of sale.lines) {
      const code = (line as any).currencyCode || line.product?.currency?.code || ''
      if (!code) continue
      byCurrency[code] = (byCurrency[code] || 0) + line.lineTotal
    }
    return Object.entries(byCurrency).map(([code, total]) => ({
      code,
      total: Math.round(total * 100) / 100,
    }))
  }

  // Helper: format a sale's total with correct per-currency display
  const fmtSaleTotal = (sale: SaleRecord): string => {
    const currencies = saleCurrencyTotals(sale)
    if (currencies.length === 0) return fmtWith(sale.total, baseCode || undefined)
    return currencies.map(c => fmtWith(c.total, c.code || undefined)).join(' + ')
  }

  // Helper: format receivable pending balance in product currencies
  const fmtReceivableBalance = (sale: SaleRecord): string => {
    const recv = sale.receivables?.[0]
    if (!recv || recv.pendingBalance <= 0) return ''
    const lineTotals = saleCurrencyTotals(sale)
    const creditPayment = sale.payments.find(p => {
      const pm = paymentMethods.find(m => m.code === p.method)
      return pm?.isCredit
    })
    const creditAmount = creditPayment?.amount || 0
    if (lineTotals.length > 0 && creditAmount > 0) {
      const ratio = recv.pendingBalance / creditAmount
      return lineTotals
        .map(c => fmtWith(Math.round(c.total * ratio * 100) / 100, c.code || undefined))
        .join(' + ')
    }
    return fmtWith(recv.pendingBalance, recv.currency?.code || baseCode || undefined)
  }

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/clients?id=${deleteTarget.id}`)
      toast.success('Cliente eliminado')
      fetchClients()
    } catch {
      toast.error('Error al eliminar cliente')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Delete a client payment (reverse it)
  const handleDeletePayment = async () => {
    if (!historyClient || !deletePaymentTarget) return
    setDeletingPaymentId(deletePaymentTarget.id)
    try {
      await api.del(`/api/clients/${historyClient.id}/payments/${deletePaymentTarget.id}`)
      toast.success('Cobro eliminado. Saldos restaurados.')
      // Refresh payments list and clients
      const pData = await api.get<{ payments: ClientPaymentRecord[] }>(`/api/clients/${historyClient.id}/payments`)
      setClientPayments(pData.payments)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al eliminar cobro'
      toast.error(msg)
    } finally {
      setDeletingPaymentId(null)
      setDeletePaymentTarget(null)
    }
  }

  // Delete a credit sale
  const handleDeleteSale = async () => {
    if (!deleteSaleTarget) return
    setDeletingSaleId(deleteSaleTarget.id)
    try {
      await fetcher(`/api/sales/${deleteSaleTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId: user?.id }),
      })
      setSales(prev => prev.filter(s => s.id !== deleteSaleTarget.id))
      toast.success('Venta de credito eliminada')
      setDeleteSaleTarget(null)
      // Refresh clients to update balances
      fetchClients()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Error al eliminar venta'
      toast.error(msg)
    } finally {
      setDeletingSaleId(null)
    }
  }

  // Helper: get payment method display name
  const getPaymentMethodName = (code: string): string => {
    const pm = paymentMethods.find(m => m.code === code)
    if (pm) return pm.name
    // Common fallback names for legacy/migrated records
    const fallbacks: Record<string, string> = {
      efectivo: 'Efectivo',
      transferencia: 'Transferencia',
      pago_movil: 'Pago Movil',
      punto_de_venta: 'Punto de Venta',
      zelle: 'Zelle',
     debito: 'Tarjeta Debito',
      credito: 'Tarjeta Credito',
    }
    return fallbacks[code] || code.charAt(0).toUpperCase() + code.slice(1)
  }

  // Edit client
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  // Dispatch dialog
  const [dispatchClient, setDispatchClient] = useState<Client | null>(null)
  const [showDispatchDialog, setShowDispatchDialog] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [dispatchLines, setDispatchLines] = useState<DispatchLine[]>([])
  const [savingDispatch, setSavingDispatch] = useState(false)

  // Show deleted clients toggle
  const [showInactive, setShowInactive] = useState(false)

  const fetchClients = async () => {
    try {
      const params = showInactive ? '?includeDeleted=true' : ''
      const data = await api.get<Client[]>(`/api/clients${params}`)
      setClients(data)
    } catch {
      toast.error('Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClients() }, [showInactive])

  // React to pendingClientId from navigation (e.g. from notification click)
  const pendingClientId = useAppStore((s) => s.pendingClientId)
  const clearPendingClient = useAppStore((s) => s.clearPendingClient)

  useEffect(() => {
    if (!pendingClientId || clients.length === 0) return
    const client = clients.find(c => c.id === pendingClientId)
    if (client) {
      openHistory(client)
      clearPendingClient()
    }
  }, [pendingClientId, clients.length])

  // Fetch open cash register and payment methods
  useEffect(() => {
    api.get<Array<{ id: string; status: string }>>('/api/cash-register')
      .then(regs => {
        const openReg = regs?.find(r => r.status === 'abierta')
        if (openReg) setOpenCashRegId(openReg.id)
      })
      .catch(() => {})
    api.get<PaymentMethodOption[]>(`/api/payment-methods?country=${country}`)
      .then(methods => {
        if (Array.isArray(methods) && methods.length > 0) {
          setPaymentMethods(methods.filter(m => m.enabled && !m.isCredit))
        } else {
          setPaymentMethods(FALLBACK_METHODS.filter(m => m.enabled && !m.isCredit))
        }
      })
      .catch(() => {
        setPaymentMethods(FALLBACK_METHODS.filter(m => m.enabled && !m.isCredit))
      })
  }, [country])

  const inactiveCount = clients.filter((c) => c.deletedAt !== null).length

  const filtered = clients.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)) || (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  )

  const openCreate = () => {
    setEditingClient(null)
    setFormName('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNote('')
    setDialogOpen(true)
  }

  const openEdit = (client: Client) => {
    setEditingClient(client)
    setFormName(client.name)
    setFormPhone(client.phone || '')
    setFormEmail(client.email || '')
    setFormAddress(client.address || '')
    setFormNote(client.note || '')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    // Name validation
    const trimmedName = formName.trim()
    if (!trimmedName) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (trimmedName.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres')
      return
    }

    // Phone validation
    if (formPhone.trim()) {
      const digitsOnly = formPhone.trim().replace(/[\s\-()]/g, '')
      if (!/^\+?\d{7,}$/.test(digitsOnly)) {
        toast.error('El teléfono debe tener al menos 7 dígitos (solo números, se permite +)')
        return
      }
    }

    // Email validation
    if (formEmail.trim()) {
      if (!formEmail.trim().includes('@') || !formEmail.trim().includes('.')) {
        toast.error('El formato del email no es válido')
        return
      }
    }

    // Address validation
    if (formAddress.trim() && formAddress.trim().length < 3) {
      toast.error('La dirección debe tener al menos 3 caracteres')
      return
    }

    setSaving(true)
    try {
      if (editingClient) {
        await api.put('/api/clients', {
          id: editingClient.id,
          name: trimmedName,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          note: formNote.trim() || null,
        })
        toast.success('Cliente actualizado')
      } else {
        await api.post('/api/clients', {
          name: trimmedName,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          note: formNote.trim() || null,
        })
        toast.success('Cliente creado')
      }
      setDialogOpen(false)
      fetchClients()
    } catch {
      toast.error(editingClient ? 'Error al actualizar cliente' : 'Error al crear cliente')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadStatement = async (client: Client) => {
    try {
      const res = await fetch(`/api/clients/${client.id}/statement`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `estado_cuenta_${client.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Estado de cuenta descargado')
    } catch {
      toast.error('Error al descargar el estado de cuenta')
    }
  }

  const handleSendStatement = async (client: Client) => {
    if (!client.email) {
      toast.error('El cliente no tiene email registrado')
      return
    }
    setSendingStatement(client.id)
    try {
      const res = await fetch(`/api/clients/${client.id}/send-statement`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Estado de cuenta enviado a ${client.email}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar'
      toast.error(msg)
    } finally {
      setSendingStatement(null)
    }
  }

  const openHistory = async (client: Client) => {
    setHistoryClient(client)
    setShowHistoryDialog(true)
    setLoadingHistory(true)
    setLoadingPayments(true)
    setClientPayments([])
    try {
      const data = await api.get<{ sales: SaleRecord[] }>(`/api/clients/${client.id}/sales`)
      setSales(data.sales)
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setLoadingHistory(false)
    }
    try {
      const pData = await api.get<{ payments: ClientPaymentRecord[] }>(`/api/clients/${client.id}/payments`)
      setClientPayments(pData.payments)
    } catch {
      // Silently fail — payments section is secondary
    } finally {
      setLoadingPayments(false)
    }
  }

  const openPayment = (client: Client) => {
    setPaymentClient(client)
    // Set default to first available non-credit method
    const firstNonCredit = paymentMethods.find(m => !m.isCredit)
    setPaymentMethod(firstNonCredit?.code || paymentMethods[0]?.code || '')
    setPaymentReference('')
    // Set amount in reference currency by default
    setPaymentAmount(client.pendingBalance.toFixed(2))
    setShowPaymentDialog(true)
  }

  // When payment method changes, toggle between local and reference currency
  const handlePaymentMethodChange = (methodCode: string) => {
    setPaymentMethod(methodCode)
    setPaymentReference('')
    if (paymentClient) {
      const pm = paymentMethods.find(m => m.code === methodCode)
      const isLocal = pm?.isLocalCurrency ?? false
      if (isLocal && exchangeRate > 0) {
        setPaymentAmount((paymentClient.pendingBalance * exchangeRate).toFixed(2))
      } else {
        setPaymentAmount(paymentClient.pendingBalance.toFixed(2))
      }
    }
  }

  // Convert displayed amount to reference currency
  const paymentAmountInRef = (() => {
    const parsed = parseFloat(paymentAmount) || 0
    if (isLocalMethod && exchangeRate > 0) {
      return Math.round((parsed / exchangeRate) * 100) / 100
    }
    return parsed
  })()

  const openDispatch = async (client: Client) => {
    setDispatchClient(client)
    setDispatchLines([])
    setShowDispatchDialog(true)
    setLoadingProducts(true)
    try {
      const branchParam = selectedBranchId ? `?branchId=${selectedBranchId}` : ''
      const data = await api.get<{ products: ProductOption[] }>(`/api/products?active=true${branchParam}`)
      setProducts(data.products)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setLoadingProducts(false)
    }
  }

  const handlePayment = async () => {
    if (!paymentClient) return
    if (!user?.id) {
      toast.error('No se pudo identificar al usuario. Inicie sesión de nuevo.')
      return
    }
    if (!baseCurrencyId) {
      toast.error('No hay moneda base configurada. Configure la moneda base en ajustes.')
      return
    }
    const amt = parseFloat(paymentAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (paymentAmountInRef > paymentClient.pendingBalance) {
      toast.error(`El monto no puede ser mayor al saldo pendiente (${fmtDebt(paymentClient)})`)
      return
    }
    if (selectedPm?.isCash && !openCashRegId) {
      toast.error('No hay caja abierta. Abra una caja registradora antes de cobrar en efectivo.')
      return
    }
    setPaying(true)
    try {
      // Send display amount (as user sees it) for correct storage in ClientPayment
      const displayAmount = parseFloat(paymentAmount) || 0
      const displayCurrencyCode = isLocalMethod ? (baseCode || 'VES') : (referenceCurrency || 'USD')
      await api.post(`/api/clients/${paymentClient.id}/payment`, {
        amount: paymentAmountInRef,
        displayAmount,
        displayCurrencyCode,
        method: paymentMethod,
        reference: paymentReference || undefined,
        cashRegId: openCashRegId || undefined,
        userId: user.id,
        currencyId: baseCurrencyId,
      })
      const displayLabel = isLocalMethod ? `Bs. ${parseFloat(paymentAmount).toFixed(2)}` : `${fmt(paymentAmountInRef)}`
      toast.success(`Cobro de ${displayLabel} registrado exitosamente`)
      setShowPaymentDialog(false)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar cobro'
      toast.error(msg)
    } finally {
      setPaying(false)
    }
  }

  const addDispatchLine = (productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    const existingLine = dispatchLines.find(l => l.productId === productId)
    if (existingLine) {
      // Increment quantity
      if (existingLine.quantity >= existingLine.stock) {
        toast.error('Stock insuficiente')
        return
      }
      setDispatchLines(dispatchLines.map(l =>
        l.productId === productId
          ? { ...l, quantity: l.quantity + 1 }
          : l
      ))
    } else {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      const stock = branchInv?.stock ?? 0
      if (stock <= 0) {
        toast.error('Sin stock disponible')
        return
      }
      setDispatchLines([...dispatchLines, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        stock,
        currencyCode: product.currency?.code || '',
      }])
    }
  }

  const updateDispatchLineQty = (productId: string, qty: number) => {
    const line = dispatchLines.find(l => l.productId === productId)
    if (!line) return
    if (qty > line.stock) {
      toast.error(`Stock insuficiente. Máximo: ${line.stock}`)
      return
    }
    if (qty <= 0) {
      setDispatchLines(dispatchLines.filter(l => l.productId !== productId))
    } else {
      setDispatchLines(dispatchLines.map(l =>
        l.productId === productId ? { ...l, quantity: qty } : l
      ))
    }
  }

  const dispatchTotalByCurrency = dispatchLines.reduce<Record<string, number>>((acc, l) => {
    const code = l.currencyCode || baseCode || ''
    acc[code] = (acc[code] || 0) + l.unitPrice * l.quantity
    return acc
  }, {})
  const fmtDispatchTotal = Object.entries(dispatchTotalByCurrency)
    .map(([code, amt]) => fmtWith(Math.round(amt * 100) / 100, code || undefined))
    .join(' + ') || fmt(0)
  const dispatchTotalNum = dispatchLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)

  const handleDispatch = async () => {
    if (!dispatchClient || dispatchLines.length === 0) return
    setSavingDispatch(true)
    try {
      await api.post(`/api/clients/${dispatchClient.id}/dispatch`, {
        lines: dispatchLines.map(l => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        userId: user?.id || '',
        branchId: selectedBranchId || undefined,
      })
      toast.success(`Despacho registrado. Total: ${fmtDispatchTotal}`)
      setShowDispatchDialog(false)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar despacho'
      toast.error(msg)
    } finally {
      setSavingDispatch(false)
    }
  }

  const handleReactivate = async (client: Client) => {
    try {
      await api.put('/api/clients', { id: client.id, reactivate: true })
      toast.success(`Cliente "${client.name}" reactivado`)
      fetchClients()
    } catch {
      toast.error('Error al reactivar cliente')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch
            id="show-inactive-clients"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-clients" className="cursor-pointer select-none">
            {showInactive ? <Eye className="inline h-4 w-4 mr-1" /> : <EyeOff className="inline h-4 w-4 mr-1" />}
            Inactivos ({inactiveCount})
          </Label>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No se encontraron clientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <Card key={client.id} className={`relative overflow-hidden hover:shadow-md transition-shadow ${client.deletedAt ? 'opacity-60' : ''}`}>
              <div className={`h-1 ${client.pendingBalance > 0 ? 'bg-red-500' : 'bg-green-500'}`} />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate">{client.name}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {client.deletedAt && (
                      <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                        Deshabilitado
                      </Badge>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${client.pendingBalance > 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                    }`}>
                      {client.pendingBalance > 0
                        ? fmtDebt(client)
                        : 'Sin deuda'
                      }
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {client.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.phone}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span>{client._count.sales} venta{client._count.sales !== 1 ? 's' : ''}</span>
                  </div>
                  {client.pendingBalance > 0 && (
                    <div className="text-red-600 font-medium">
                      Debe: {fmtDebt(client)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-2 border-t">
                  {!client.deletedAt && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver Historial" onClick={() => openHistory(client)}>
                        <Receipt className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Estado de Cuenta (PDF)" onClick={() => handleDownloadStatement(client)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {client.email && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Enviar por Email" onClick={() => handleSendStatement(client)} disabled={sendingStatement === client.id}>
                          {sendingStatement === client.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Mail className="h-3.5 w-3.5" />
                          }
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Despachar" onClick={() => openDispatch(client)}>
                          <Truck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {client.pendingBalance > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-primary hover:text-primary" onClick={() => openPayment(client)}>
                          <DollarSign className="mr-1 h-3 w-3" /> Cobrar
                        </Button>
                      )}
                      <div className="flex-1" />
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => openEdit(client)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" title="Eliminar" onClick={() => setDeleteTarget(client)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {client.deletedAt && canManage && (
                    <>
                      <div className="flex-1" />
                      <Button size="sm" variant="outline" className="h-7 text-xs" title="Reactivar cliente" onClick={() => handleReactivate(client)}>
                        <Eye className="mr-1 h-3 w-3" /> Reactivar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            <DialogDescription>{editingClient ? 'Modifica los datos del cliente' : 'Registra un nuevo cliente en el sistema'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname">Nombre *</Label>
              <Input id="cname" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cphone">Teléfono</Label>
                <Input id="cphone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+58 412-0000000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail">Email</Label>
                <Input id="cemail" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="caddress">Dirección</Label>
              <Input id="caddress" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Dirección" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnote">Notas</Label>
              <Input id="cnote" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Notas internas" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingClient ? 'Actualizar Cliente' : 'Crear Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog */}
      <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Despachar a {dispatchClient?.name}</DialogTitle>
            <DialogDescription>Selecciona productos y cantidades para despachar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Product selector */}
            <div className="space-y-2">
              <Label>Agregar Producto</Label>
              <Select onValueChange={(v) => { addDispatchLine(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => {
                    const branchInv = p.inventories.find(i => i.branchId === selectedBranchId)
                    const stock = branchInv?.stock ?? 0
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={stock <= 0}>
                        {p.name} — {fmtWith(p.price, p.currency?.code || undefined)} (Stock: {stock})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Lines */}
            {dispatchLines.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Productos a Despachar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dispatchLines.map((line) => (
                      <div key={line.productId} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{line.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtWith(line.unitPrice, line.currencyCode || undefined)} c/u · Stock: {line.stock}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateDispatchLineQty(line.productId, line.quantity - 1)}
                          >
                            -
                          </Button>
                          <span className="text-sm font-medium w-8 text-center">{line.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateDispatchLineQty(line.productId, line.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>
                        <div className="text-right w-20">
                          <p className="text-sm font-semibold">{fmtWith(line.unitPrice * line.quantity, line.currencyCode || undefined)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600"
                          onClick={() => setDispatchLines(dispatchLines.filter(l => l.productId !== line.productId))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Total del Despacho:</span>
                      <span className="text-lg font-bold text-primary">{fmtDispatchTotal}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center">
                <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Selecciona productos arriba para agregar al despacho</p>
              </div>
            )}

            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-400">
              El despacho genera una venta a credito con vencimiento a 30 dias. El cliente podra pagar la factura desde la opcion &quot;Cobrar&quot;.
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleDispatch}
              disabled={savingDispatch || dispatchLines.length === 0}
            >
              {savingDispatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              {savingDispatch ? 'Procesando...' : `Confirmar Despacho (${fmtDispatchTotal})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales/Dispatch History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Historial de {historyClient?.name}</DialogTitle>
            <DialogDescription>Ventas y despachos realizados a este cliente</DialogDescription>
          </DialogHeader>
          {loadingHistory ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Ventas</p>
                    <p className="text-xl font-bold">{sales.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Comprado</p>
                    <p className="text-xl font-bold">
                      {(() => {
                        const byCurrency: Record<string, number> = {}
                        for (const sale of sales) {
                          for (const line of sale.lines) {
                            const code = (line as any).currencyCode || line.product?.currency?.code || baseCode || ''
                            if (!code) continue
                            byCurrency[code] = (byCurrency[code] || 0) + line.lineTotal
                          }
                        }
                        const entries = Object.entries(byCurrency).map(([code, amt]) => [code, Math.round(amt * 100) / 100] as const)
                        return entries.length > 0
                          ? entries.map(([code, amt]) => fmtWith(amt, code || undefined)).join(' + ')
                          : fmtWith(0, baseCode || undefined)
                      })()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle de Ventas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {sales.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin ventas registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N° Factura</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="hidden md:table-cell">Productos</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="hidden lg:table-cell">Método</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="w-20"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sales.map((sale) => {
                            const isCredit = sale.payments.some(p => {
                              const pm = paymentMethods.find(m => m.code === p.method)
                              return pm?.isCredit
                            }) || sale.receivables.some(r => r.status === 'pendiente' || r.status === 'parcial')
                            return (
                              <TableRow key={sale.id}>
                                <TableCell className="text-xs font-mono whitespace-nowrap">
                                  {sale.id.slice(0, 8)}
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap pr-4">
                                  {new Date(sale.date).toLocaleDateString('es-VE')}
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs text-muted-foreground hover:text-primary gap-1"
                                    title="Ver productos"
                                    onClick={() => setDetailSale(sale)}
                                  >
                                    <Eye className="h-3 w-3" />
                                    {sale.lines.length}
                                  </Button>
                                </TableCell>
                                <TableCell className="text-sm font-medium text-right whitespace-nowrap">
                                  {fmtSaleTotal(sale)}
                                </TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">
                                  {sale.payments.map(p => p.method).join(', ') || '—'}
                                </TableCell>
                                <TableCell>
                                  {isCredit ? (
                                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                                      {sale.receivables[0]?.pendingBalance > 0
                                        ? `Pendiente: ${fmtReceivableBalance(sale)}`
                                        : 'Credito'}
                                    </Badge>
                                  ) : (
                                    <Badge variant={sale.status === 'completada' ? 'default' : 'secondary'}>
                                      {sale.status}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-0.5">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      title="Imprimir Factura"
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/sales/${sale.id}/invoice`)
                                          if (!res.ok) throw new Error()
                                          const blob = await res.blob()
                                          const url = URL.createObjectURL(blob)
                                          const a = document.createElement('a')
                                          a.href = url
                                          a.download = `factura_${sale.id.slice(0, 8)}.pdf`
                                          a.click()
                                          URL.revokeObjectURL(url)
                                        } catch {
                                          toast.error('Error al generar factura')
                                        }
                                      }}
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                    {isCredit && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                        title="Eliminar venta de credito"
                                        disabled={deletingSaleId === sale.id}
                                        onClick={() => setDeleteSaleTarget(sale)}
                                      >
                                        {deletingSaleId === sale.id
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <Trash2 className="h-3.5 w-3.5" />
                                        }
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payments History */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CircleDollarSign className="h-4 w-4 text-green-600" />
                    Pagos Realizados
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingPayments ? (
                    <div className="h-24 rounded-lg bg-muted animate-pulse m-4" />
                  ) : clientPayments.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin cobros registrados</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead className="hidden sm:table-cell">Metodo</TableHead>
                            <TableHead className="hidden md:table-cell">Referencia</TableHead>
                            <TableHead className="hidden lg:table-cell">Registrado por</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientPayments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs whitespace-nowrap">
                                {new Date(p.createdAt).toLocaleDateString('es-VE')}
                                <br />
                                <span className="text-muted-foreground">
                                  {new Date(p.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm font-semibold text-green-600 whitespace-nowrap">
                                {fmtWith(p.amount, p.currency?.code || undefined)}
                              </TableCell>
                              <TableCell className="text-xs hidden sm:table-cell">
                                {getPaymentMethodName(p.method)}
                              </TableCell>
                              <TableCell className="text-xs hidden md:table-cell font-mono">
                                {p.reference || '—'}
                              </TableCell>
                              <TableCell className="text-xs hidden lg:table-cell text-muted-foreground">
                                {p.user?.name || '—'}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  title="Eliminar cobro"
                                  disabled={deletingPaymentId === p.id}
                                  onClick={() => setDeletePaymentTarget(p)}
                                >
                                  {deletingPaymentId === p.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />
                                  }
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sale Lines Detail Modal */}
      <Dialog open={!!detailSale} onOpenChange={(open) => { if (!open) setDetailSale(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Productos — Factura {detailSale?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              {detailSale ? new Date(detailSale.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
            </DialogDescription>
          </DialogHeader>
          {detailSale && (
            <div className="space-y-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailSale.lines.map((line, i) => {
                      const lineCode = (line as any).currencyCode || line.product?.currency?.code || detailSale.payments[0]?.currency?.code || baseCode || ''
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{line.product.name}</TableCell>
                          <TableCell className="text-sm text-center">{line.quantity}</TableCell>
                          <TableCell className="text-sm text-right">{fmtWith(line.unitPrice, lineCode || undefined)}</TableCell>
                          <TableCell className="text-sm text-right font-medium">{fmtWith(line.lineTotal, lineCode || undefined)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground">
                  {detailSale.lines.length} producto{detailSale.lines.length !== 1 ? 's' : ''}
                </span>
                <span className="text-base font-bold">
                  Total: {detailSale ? fmtSaleTotal(detailSale) : ''}
                </span>
              </div>
              {detailSale.receivables.length > 0 && detailSale.receivables[0].pendingBalance > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Saldo pendiente: {fmtReceivableBalance(detailSale)}
                  {detailSale.receivables[0].dueDate && ` — Vence: ${new Date(detailSale.receivables[0].dueDate).toLocaleDateString('es-VE')}`}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrar a {paymentClient?.name}</DialogTitle>
            <DialogDescription>
              Registrar pago de deuda pendiente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {paymentClient && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{paymentClient.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deuda pendiente:</span>
                  <span className="font-medium text-red-600">{fmtDebt(paymentClient)}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(pm => (
                    <SelectItem key={pm.code} value={pm.code}>
                      {pm.name}{pm.isLocalCurrency ? ` (${baseSym})` : ` (${currencySymbol})`}
                    </SelectItem>
                  ))}
                  {paymentMethods.length === 0 && (
                    <SelectItem value="">Cargando métodos...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpaymentAmt">Monto a Cobrar {isLocalMethod ? '(Bs.)' : `(${currencySymbol})`}</Label>
              <Input
                id="cpaymentAmt"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              {isLocalMethod && exchangeRate > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivale a {fmt(paymentAmountInRef)} (Tasa: {exchangeRate.toFixed(2)} {baseSym}/{referenceCurrency})
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Saldo después del cobro: {(() => {
                  const remaining = Math.max(0, (paymentClient?.pendingBalance || 0) - paymentAmountInRef)
                  return isLocalMethod && exchangeRate > 0
                    ? fmtWith(remaining * exchangeRate, baseCode || undefined)
                    : fmtWith(remaining, referenceCurrency || undefined)
                })()}
              </p>
            </div>
            {selectedPm?.needsReference && (
              <div className="space-y-2">
                <Label>Referencia</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Número de referencia"
                />
              </div>
            )}
            {selectedPm?.isCash && !openCashRegId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">No hay caja registradora abierta</p>
                  <p>Debe abrir una caja antes de registrar pagos en efectivo. El cobro no quedará registrado como entrada de caja.</p>
                </div>
              </div>
            )}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handlePayment}
              disabled={paying || !parseFloat(paymentAmount) || parseFloat(paymentAmount) <= 0}
            >
              {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
              {paying ? 'Procesando...' : 'Registrar Cobro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar el cliente "{deleteTarget?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Payment Confirmation Dialog */}
      <AlertDialog open={!!deletePaymentTarget} onOpenChange={(open) => { if (!open) setDeletePaymentTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Cobro</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara el cobro de {deletePaymentTarget ? fmtWith(deletePaymentTarget.amount, deletePaymentTarget.currency?.code || undefined) : ''} ({getPaymentMethodName(deletePaymentTarget?.method || '')}){deletePaymentTarget?.reference ? ` con referencia ${deletePaymentTarget.reference}` : ''}. Los saldos del cliente se restauraran automaticamente. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingPaymentId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeletePayment} disabled={!!deletingPaymentId}>
              {deletingPaymentId ? 'Eliminando...' : 'Eliminar Cobro'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Credit Sale Confirmation Dialog */}
      <AlertDialog open={!!deleteSaleTarget} onOpenChange={(open) => { if (!open) setDeleteSaleTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Venta de Credito</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara la venta de credito por {deleteSaleTarget ? fmtSaleTotal(deleteSaleTarget) : ''} a favor de {deleteSaleTarget?.client?.name || historyClient?.name || 'el cliente'}. El stock se restaurara automaticamente y la cuenta por cobrar sera eliminada. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingSaleId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteSale} disabled={!!deletingSaleId}>
              {deletingSaleId ? 'Eliminando...' : 'Eliminar Venta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
