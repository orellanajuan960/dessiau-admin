'use client'

import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Building2, Plus, Loader2, Eye, Pencil, DollarSign, CalendarDays, FileText, Trash2, Search, Phone, Mail, MapPin, UserCircle, Upload, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
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

const RIF_REGEX = /^[JVEG]-\d{8,9}-\d$/

interface Supplier {
  id: string
  name: string
  rif: string | null
  phone: string | null
  email: string | null
  address: string | null
  balance: number
  nextDueDate: string | null
}

interface PayableRecord {
  id: string
  amount: number
  pendingBalance: number
  status: string
  dueDate: string | null
  description: string | null
  createdAt: string
  invoiceNumber: string | null
  invoiceUrl: string | null
  purchase: {
    id: string
    date: string
    total: number
    lines: Array<{ product: { name: string } }>
  } | null
  payments: Array<{ amount: number; createdAt: string; user: { name: string } }>
}

export function SuppliersView() {
  const { user, permissions } = useAuth()
  const canManage = permissions.canManageSuppliers
  const baseCurrencyId = useAppStore((s) => s.settings?.baseCurrencyId || '')
  const { sym: currencySymbol, rate: exchangeRate, fmt } = useCurrency()
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])
  const country = useAppStore((s) => s.settings?.country || 'VE')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [rif, setRif] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')

  // Edit dialog state
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editName, setEditName] = useState('')
  const [editRif, setEditRif] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editing, setEditing] = useState(false)

  // Add Payable (Pedido) dialog state
  const [payableSupplier, setPayableSupplier] = useState<Supplier | null>(null)
  const [showPayableDialog, setShowPayableDialog] = useState(false)
  const [payableAmount, setPayableAmount] = useState('')
  const [payableDescription, setPayableDescription] = useState('')
  const [payableDueDate, setPayableDueDate] = useState('')
  const [payableInvoiceNumber, setPayableInvoiceNumber] = useState('')
  const [payableInvoiceUrl, setPayableInvoiceUrl] = useState('')
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [savingPayable, setSavingPayable] = useState(false)
  const invoiceFileRef = useRef<HTMLInputElement>(null)

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/suppliers?id=${deleteTarget.id}`)
      toast.success('Proveedor eliminado')
      fetchSuppliers()
    } catch {
      toast.error('Error al eliminar proveedor')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Debt/Payables dialog state
  const [debtSupplier, setDebtSupplier] = useState<Supplier | null>(null)
  const [payables, setPayables] = useState<PayableRecord[]>([])
  const [totalDebt, setTotalDebt] = useState(0)
  const [loadingDebt, setLoadingDebt] = useState(false)
  const [showDebtDialog, setShowDebtDialog] = useState(false)

  // Payment dialog state
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const data = await api.get<Supplier[]>('/api/suppliers')
      setSuppliers(data)
    } catch {
      toast.error('Error al cargar proveedores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSuppliers() }, [])

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

  const filtered = suppliers.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.rif && s.rif.toLowerCase().includes(search.toLowerCase())) ||
      (s.phone && s.phone.includes(search)) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
  )

  // --- Field Validation Helpers ---
  const validateSupplierFields = (
    fieldName: string,
    fieldValue: string
  ): string | null => {
    switch (fieldName) {
      case 'name': {
        const trimmed = fieldValue.trim()
        if (!trimmed) return 'El nombre del proveedor es obligatorio'
        if (trimmed.length < 2) return 'El nombre debe tener al menos 2 caracteres'
        return null
      }
      case 'rif': {
        const trimmed = fieldValue.trim()
        if (!trimmed) return null // optional
        if (!RIF_REGEX.test(trimmed)) return 'Formato de RIF inválido. Ejemplo: J-00000000-0'
        return null
      }
      case 'phone': {
        const trimmed = fieldValue.trim()
        if (!trimmed) return null // optional
        const digitsOnly = trimmed.replace(/\D/g, '')
        if (digitsOnly.length < 7) return 'El teléfono debe tener al menos 7 dígitos'
        return null
      }
      case 'email': {
        const trimmed = fieldValue.trim()
        if (!trimmed) return null // optional
        if (!trimmed.includes('@') || !trimmed.includes('.')) return 'Formato de email inválido'
        return null
      }
      case 'address': {
        const trimmed = fieldValue.trim()
        if (!trimmed) return null // optional
        if (trimmed.length < 3) return 'La dirección debe tener al menos 3 caracteres'
        return null
      }
      default:
        return null
    }
  }

  const openCreateDialog = () => {
    setName('')
    setRif('')
    setPhone('')
    setEmail('')
    setAddress('')
    setShowDialog(true)
  }

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setEditName(supplier.name)
    setEditRif(supplier.rif || '')
    setEditPhone(supplier.phone || '')
    setEditEmail(supplier.email || '')
    setEditAddress(supplier.address || '')
    setShowEditDialog(true)
  }

  const openPayableDialog = (supplier: Supplier) => {
    setPayableSupplier(supplier)
    setPayableAmount('')
    setPayableInvoiceNumber('')
    setPayableInvoiceUrl('')
    setPayableDescription('')
    setPayableDueDate('')
    setShowPayableDialog(true)
  }

  const openDebtDialog = async (supplier: Supplier) => {
    setDebtSupplier(supplier)
    setShowDebtDialog(true)
    setLoadingDebt(true)
    try {
      const data = await api.get<{ payables: PayableRecord[]; totalDebt: number }>(`/api/suppliers/${supplier.id}/payables`)
      setPayables(data.payables)
      setTotalDebt(data.totalDebt)
    } catch {
      toast.error('Error al cargar deudas')
    } finally {
      setLoadingDebt(false)
    }
  }

  const openPaymentDialog = (supplier: Supplier) => {
    setPaymentSupplier(supplier)
    const firstNonCredit = paymentMethods.find(m => !m.isCredit)
    setPaymentMethod(firstNonCredit?.code || paymentMethods[0]?.code || '')
    setPaymentReference('')
    setPaymentAmount(supplier.balance.toFixed(2))
    setShowPaymentDialog(true)
  }

  const handlePaymentMethodChange = (method: string) => {
    setPaymentMethod(method)
    setPaymentReference('')
  }

  // Current payment method for template conditions
  const currentPaymentPm = paymentMethods.find(m => m.code === paymentMethod)

  const handleSave = async () => {
    // Validate name
    const nameErr = validateSupplierFields('name', name)
    if (nameErr) { toast.error(nameErr); return }

    // Validate RIF
    const rifErr = validateSupplierFields('rif', rif)
    if (rifErr) { toast.error(rifErr); return }

    // Validate phone
    const phoneErr = validateSupplierFields('phone', phone)
    if (phoneErr) { toast.error(phoneErr); return }

    // Validate email
    const emailErr = validateSupplierFields('email', email)
    if (emailErr) { toast.error(emailErr); return }

    // Validate address
    const addrErr = validateSupplierFields('address', address)
    if (addrErr) { toast.error(addrErr); return }

    setSaving(true)
    try {
      await api.post('/api/suppliers', {
        name: name.trim(),
        rif: rif.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
      })
      toast.success('Proveedor creado exitosamente')
      setShowDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al crear proveedor'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleEditSave = async () => {
    if (!editingSupplier) return

    // Validate name
    const nameErr = validateSupplierFields('name', editName)
    if (nameErr) { toast.error(nameErr); return }

    // Validate RIF
    const rifErr = validateSupplierFields('rif', editRif)
    if (rifErr) { toast.error(rifErr); return }

    // Validate phone
    const phoneErr = validateSupplierFields('phone', editPhone)
    if (phoneErr) { toast.error(phoneErr); return }

    // Validate email
    const emailErr = validateSupplierFields('email', editEmail)
    if (emailErr) { toast.error(emailErr); return }

    // Validate address
    const addrErr = validateSupplierFields('address', editAddress)
    if (addrErr) { toast.error(addrErr); return }

    setEditing(true)
    try {
      await api.put(`/api/suppliers/${editingSupplier.id}`, {
        name: editName.trim(),
        rif: editRif.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
      })
      toast.success('Proveedor actualizado exitosamente')
      setShowEditDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al actualizar proveedor'
      toast.error(msg)
    } finally {
      setEditing(false)
    }
  }

  const handleUploadInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La factura no debe superar 5MB')
      return
    }
    setUploadingInvoice(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'facturas-proveedores')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) {
        setPayableInvoiceUrl(data.url)
      } else {
        toast.error(data.error || 'Error al subir factura')
      }
    } catch {
      toast.error('Error al subir factura')
    } finally {
      setUploadingInvoice(false)
      e.target.value = ''
    }
  }

  const handleCreatePayable = async () => {
    if (!payableSupplier) return
    const amt = parseFloat(payableAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (!payableInvoiceNumber.trim()) {
      toast.error('El número de factura es obligatorio')
      return
    }
    setSavingPayable(true)
    try {
      await api.post(`/api/suppliers/${payableSupplier.id}/payables`, {
        amount: amt,
        description: payableDescription.trim() || null,
        dueDate: payableDueDate || null,
        invoiceNumber: payableInvoiceNumber.trim(),
        invoiceUrl: payableInvoiceUrl || null,
      })
      toast.success(`Pedido por ${fmt(amt)} registrado`)
      setShowPayableDialog(false)
      fetchSuppliers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al crear pedido'
      toast.error(msg)
    } finally {
      setSavingPayable(false)
    }
  }

  const handlePayment = async () => {
    if (!paymentSupplier) return
    const amt = parseFloat(paymentAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (amt > paymentSupplier.balance) {
      toast.error(`El monto no puede ser mayor al balance (${fmt(paymentSupplier.balance)})`)
      return
    }
    const currentPm = paymentMethods.find(m => m.code === paymentMethod)
    const requiresRef = currentPm?.needsReference ?? false
    if (requiresRef && !paymentReference.trim()) {
      toast.error('La referencia es obligatoria para este método de pago')
      return
    }
    setSavingPayment(true)
    try {
      await api.post(`/api/suppliers/${paymentSupplier.id}/payment`, {
        amount: amt,
        method: paymentMethod,
        reference: paymentReference || undefined,
        cashRegId: openCashRegId || undefined,
        userId: user?.id || '',
        currencyId: baseCurrencyId || undefined,
      })
      toast.success(`Pago de ${fmt(amt)} registrado exitosamente`)
      setShowPaymentDialog(false)
      fetchSuppliers()
      // Refresh debt dialog if open
      if (debtSupplier && debtSupplier.id === paymentSupplier.id) {
        openDebtDialog(paymentSupplier)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar pago'
      toast.error(msg)
    } finally {
      setSavingPayment(false)
    }
  }

  const getDueDateBadge = (dueDate: string | null) => {
    if (!dueDate) return <span className="text-muted-foreground">—</span>
    const now = new Date()
    const due = new Date(dueDate)
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) {
      return (
        <Badge variant="destructive" className="text-xs">
          <CalendarDays className="mr-1 h-3 w-3" />
          Vencida
        </Badge>
      )
    }
    if (diffDays <= 3) {
      return (
        <Badge variant="outline" className="text-xs border-red-300 text-red-600">
          <CalendarDays className="mr-1 h-3 w-3" />
          {due.toLocaleDateString('es-VE')}
        </Badge>
      )
    }
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <CalendarDays className="h-3 w-3" />
        {due.toLocaleDateString('es-VE')}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        {canManage && (
          <Button onClick={openCreateDialog} className="bg-primary hover:bg-primary/90 text-white">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Proveedor
          </Button>
        )}
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No se encontraron proveedores</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((supplier) => {
            const isOverdue = supplier.nextDueDate && new Date(supplier.nextDueDate) < new Date()
            return (
              <Card key={supplier.id} className="relative overflow-hidden hover:shadow-md transition-shadow">
                <div className={`h-1 ${supplier.balance > 0 ? (isOverdue ? 'bg-orange-500' : 'bg-red-500') : 'bg-green-500'}`} />
                <CardContent className="p-4 space-y-3">
                  {/* Name + Balance badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{supplier.name}</h3>
                      {supplier.rif && (
                        <p className="text-xs text-muted-foreground font-mono">{supplier.rif}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${supplier.balance > 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                    }`}>
                      {supplier.balance > 0
                        ? `${fmt(supplier.balance)}`
                        : 'Sin deuda'
                      }
                    </span>
                  </div>

                  {/* Contact info */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {supplier.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{supplier.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Due date + balance summary */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {supplier.balance > 0 && (
                      <div className="text-red-600 font-medium">
                        Debe: {fmt(supplier.balance)}
                      </div>
                    )}
                    {supplier.nextDueDate && (
                      <div className="flex items-center">
                        {getDueDateBadge(supplier.nextDueDate)}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pt-2 border-t">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver Deudas" onClick={() => openDebtDialog(supplier)}>
                      <DollarSign className="h-3.5 w-3.5" />
                    </Button>
                    {supplier.balance > 0 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30" title="Pagar Deuda" onClick={() => openPaymentDialog(supplier)}>
                        <DollarSign className="mr-1 h-3 w-3" /> Pagar
                      </Button>
                    )}
                    {canManage && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-primary hover:text-primary" title="Agregar Pedido" onClick={() => openPayableDialog(supplier)}>
                        <Plus className="mr-1 h-3 w-3" /> Pedido
                      </Button>
                    )}
                    <div className="flex-1" />
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => openEditDialog(supplier)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" title="Eliminar" onClick={() => setDeleteTarget(supplier)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* New Supplier Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Proveedor</DialogTitle>
            <DialogDescription>Registra un nuevo proveedor para tu negocio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>RIF</Label>
                <Input value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-00000000-0" />
                <p className="text-xs text-muted-foreground">Formato: J-00000000-0</p>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+58 212-0000000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proveedor@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección del proveedor" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : 'Crear Proveedor'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
            <DialogDescription>Modifica los datos del proveedor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>RIF</Label>
                <Input value={editRif} onChange={(e) => setEditRif(e.target.value)} placeholder="J-00000000-0" />
                <p className="text-xs text-muted-foreground">Formato: J-00000000-0</p>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+58 212-0000000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="proveedor@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Dirección del proveedor" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleEditSave} disabled={editing}>
              {editing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Payable (Pedido) Dialog */}
      <Dialog open={showPayableDialog} onOpenChange={setShowPayableDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Pedido a {payableSupplier?.name}</DialogTitle>
            <DialogDescription>Registra un pedido / cuenta por pagar a este proveedor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {payableSupplier && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deuda actual:</span>
                  <span className="font-medium text-red-600">{fmt(payableSupplier.balance)}</span>
                </div>
              </div>
            )}

            {/* Invoice Number */}
            <div className="space-y-2">
              <Label htmlFor="pinvoice">Nº de Factura *</Label>
              <Input
                id="pinvoice"
                value={payableInvoiceNumber}
                onChange={(e) => setPayableInvoiceNumber(e.target.value)}
                placeholder="Ej: 001-0001234"
              />
            </div>

            {/* Invoice File Upload */}
            <div className="space-y-2">
              <Label>Factura (Archivo)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  ref={invoiceFileRef}
                  onChange={handleUploadInvoice}
                  className="hidden"
                  id="invoice-file-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingInvoice}
                  onClick={() => invoiceFileRef.current?.click()}
                >
                  {uploadingInvoice ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploadingInvoice ? 'Subiendo...' : 'Subir Factura'}
                </Button>
                {payableInvoiceUrl && (
                  <a
                    href={payableInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver factura
                  </a>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="pamount">Monto a Deber *</Label>
              <Input
                id="pamount"
                type="number"
                step="0.01"
                min="0"
                value={payableAmount}
                onChange={(e) => setPayableAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="pdesc">Descripción / Productos</Label>
              <Input
                id="pdesc"
                value={payableDescription}
                onChange={(e) => setPayableDescription(e.target.value)}
                placeholder="Ej: 10 cajas de cerveza Polar, 5 bolsas de harina PAN..."
              />
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="pduedate">Plazo de Pago</Label>
              <Input
                id="pduedate"
                type="date"
                value={payableDueDate}
                onChange={(e) => setPayableDueDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Fecha límite para realizar el pago</p>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleCreatePayable}
              disabled={savingPayable || !parseFloat(payableAmount) || parseFloat(payableAmount) <= 0 || !payableInvoiceNumber.trim()}
            >
              {savingPayable ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {savingPayable ? 'Registrando...' : 'Registrar Pedido'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Debt/Payables Dialog */}
      <Dialog open={showDebtDialog} onOpenChange={setShowDebtDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Deudas de {debtSupplier?.name}</DialogTitle>
            <DialogDescription>Cuentas por pagar pendientes</DialogDescription>
          </DialogHeader>
          {loadingDebt ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Deuda Total</p>
                    <p className="text-xl font-bold text-red-600">{fmt(totalDebt)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Cuentas Pendientes</p>
                    <p className="text-xl font-bold">
                      {payables.filter(p => p.status === 'pendiente' || p.status === 'parcial').length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Abonar Button */}
              {totalDebt > 0 && debtSupplier && (
                <Button
                  variant="outline"
                  className="w-full border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                  onClick={() => openPaymentDialog(debtSupplier)}
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Abonar a {debtSupplier.name}
                </Button>
              )}

              {/* Payables Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle de Deudas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {payables.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin deudas registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Nº Factura</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Pendiente</TableHead>
                            <TableHead>Vencimiento</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payables.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs">
                                {new Date(p.createdAt).toLocaleDateString('es-VE')}
                              </TableCell>
                              <TableCell className="text-xs">
                                {p.invoiceNumber ? (
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono">{p.invoiceNumber}</span>
                                    {p.invoiceUrl && (
                                      <a
                                        href={p.invoiceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                        title="Ver factura"
                                      >
                                        <FileText className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs max-w-[150px] truncate">
                                {p.description || p.purchase?.lines?.map(l => l.product.name).join(', ') || '—'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {fmt(p.amount)}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                <span className={p.pendingBalance > 0 ? 'text-red-600' : 'text-primary'}>
                                  {fmt(p.pendingBalance)}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">
                                {p.dueDate ? (
                                  <span className={new Date(p.dueDate) < new Date() && p.pendingBalance > 0 ? 'text-red-600 font-medium' : ''}>
                                    {new Date(p.dueDate).toLocaleDateString('es-VE')}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  p.status === 'pagada' ? 'default' :
                                  p.status === 'parcial' ? 'outline' : 'secondary'
                                }>
                                  {p.status === 'pagada' ? 'Pagada' :
                                   p.status === 'parcial' ? 'Parcial' : 'Pendiente'}
                                </Badge>
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

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar a {paymentSupplier?.name}</DialogTitle>
            <DialogDescription>Registrar un pago al proveedor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {paymentSupplier && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deuda total:</span>
                  <span className="font-medium text-red-600">{fmt(paymentSupplier.balance)}</span>
                </div>
              </div>
            )}

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(pm => (
                    <SelectItem key={pm.code} value={pm.code}>{pm.name}</SelectItem>
                  ))}
                  {paymentMethods.length === 0 && (
                    <SelectItem value="">Cargando métodos...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="spaymentAmt">Monto a Pagar</Label>
              <Input
                id="spaymentAmt"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              {paymentSupplier && (
                <p className="text-xs text-muted-foreground">
                  Saldo después del pago: {fmt((paymentSupplier.balance || 0) - (parseFloat(paymentAmount) || 0))}
                </p>
              )}
            </div>

            {/* Reference (required for certain methods) */}
            {currentPaymentPm?.needsReference && (
              <div className="space-y-2">
                <Label>Referencia *</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Número de referencia"
                />
              </div>
            )}

            {/* Cash register warning */}
            {currentPaymentPm?.isCash && !openCashRegId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                No hay caja abierta. El pago no se registrará como salida de caja.
              </div>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handlePayment}
              disabled={savingPayment || !parseFloat(paymentAmount) || parseFloat(paymentAmount) <= 0}
            >
              {savingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
              {savingPayment ? 'Procesando...' : 'Registrar Pago'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Proveedor</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar el proveedor "{deleteTarget?.name}"? Esta acción no se puede deshacer.
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
    </div>
  )
}
