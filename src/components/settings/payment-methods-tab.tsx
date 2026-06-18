'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Clock,
  Smartphone,
  CircleDollarSign,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { getCurrencyForCountry } from '@/lib/country-currency'
import { setCachedMethods } from '@/lib/pos-cache'

interface PaymentMethodItem {
  id: string
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
  sortOrder: number
  countries: string
  isDefault: boolean
}

const ICON_MAP: Record<string, React.ElementType> = {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Clock,
  Smartphone,
  CircleDollarSign,
}

const ICON_OPTIONS = [
  { value: 'Banknote', label: 'Billete' },
  { value: 'CreditCard', label: 'Tarjeta' },
  { value: 'ArrowLeftRight', label: 'Transferencia' },
  { value: 'Clock', label: 'Reloj (Crédito)' },
  { value: 'Smartphone', label: 'Teléfono' },
  { value: 'CircleDollarSign', label: 'Dólar' },
]

interface PaymentMethodsTabProps {
  country: string
}

export function PaymentMethodsTab({ country }: PaymentMethodsTabProps) {
  const [methods, setMethods] = useState<PaymentMethodItem[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Custom method dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('CircleDollarSign')
  const [newNeedsRef, setNewNeedsRef] = useState(false)
  const [newIsLocal, setIsLocal] = useState(false)
  const [newIsCash, setIsCash] = useState(false)
  const [newIsCredit, setIsCredit] = useState(false)
  const [creating, setCreating] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const localCurrency = getCurrencyForCountry(country)
  const localLabel = localCurrency ? `${localCurrency.code} (${localCurrency.symbol})` : 'moneda local'

  const fetchMethods = useCallback(async () => {
    try {
      const data = await api.get<PaymentMethodItem[]>(`/api/payment-methods?country=${country}`)
      setMethods(data)
    } catch {
      toast.error('Error al cargar métodos de pago')
    } finally {
      setLoading(false)
    }
  }, [country])

  useEffect(() => { fetchMethods() }, [fetchMethods])

  const handleToggle = async (method: PaymentMethodItem) => {
    setTogglingId(method.id)
    try {
      const updated = await api.put<PaymentMethodItem>('/api/payment-methods', {
        id: method.id,
        enabled: !method.enabled,
      })
      setMethods(prev => {
        const next = prev.map(m => m.id === updated.id ? updated : m)
        setCachedMethods(next)
        return next
      })
      toast.success(`${updated.name} ${updated.enabled ? 'activado' : 'desactivado'}`)
    } catch {
      toast.error('Error al actualizar método')
    } finally {
      setTogglingId(null)
    }
  }

  const handleCreate = async () => {
    if (!newCode.trim() || !newName.trim()) {
      toast.error('Código y nombre son obligatorios')
      return
    }
    if (methods.some(m => m.code === newCode.trim().toLowerCase())) {
      toast.error('Ya existe un método con ese código')
      return
    }
    setCreating(true)
    try {
      const created = await api.post<PaymentMethodItem>('/api/payment-methods', {
        code: newCode.trim().toLowerCase(),
        name: newName.trim(),
        icon: newIcon,
        needsReference: newNeedsRef,
        isLocalCurrency: newIsLocal,
        isCash: newIsCash,
        isCredit: newIsCredit,
        countries: 'ALL',
      })
      setMethods(prev => {
        const next = [...prev, created]
        setCachedMethods(next)
        return next
      })
      setShowCreateDialog(false)
      resetCreateForm()
      toast.success(`Método "${created.name}" creado`)
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear método')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/payment-methods?id=${deleteTarget.id}`)
      setMethods(prev => {
        const next = prev.filter(m => m.id !== deleteTarget.id)
        setCachedMethods(next)
        return next
      })
      toast.success(`${deleteTarget.name} eliminado`)
    } catch {
      toast.error('Error al eliminar método')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const resetCreateForm = () => {
    setNewCode('')
    setNewName('')
    setNewIcon('CircleDollarSign')
    setNewNeedsRef(false)
    setIsLocal(false)
    setIsCash(false)
    setIsCredit(false)
  }

  const getIcon = (iconName: string) => ICON_MAP[iconName] || CircleDollarSign

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm space-y-1">
            <p>
              Activa o desactiva los métodos de pago disponibles en el Punto de Venta, cobros a clientes y pagos a proveedores.
            </p>
            <p className="text-muted-foreground">
              País actual: <span className="font-medium">{country}</span> · Moneda local: <span className="font-medium">{localLabel}</span>
              {country !== 'VE' && (
                <span className="text-amber-600 dark:text-amber-400"> · Métodos como &quot;Pago Móvil&quot; (solo Venezuela) están ocultos</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Methods list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Métodos de Pago</CardTitle>
              <CardDescription>Arrastra para reordenar (próximamente) · Toca el switch para activar/desactivar</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Agregar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {methods.map((method) => {
              const Icon = getIcon(method.icon)
              const isCountrySpecific = method.countries !== 'ALL'

              return (
                <div
                  key={method.id}
                  className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                    method.enabled
                      ? 'bg-background'
                      : 'bg-muted/30 opacity-60'
                  }`}
                >
                  {/* Icon */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                    method.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{method.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {method.code}
                      </Badge>
                      {isCountrySpecific && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {method.countries}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {method.isLocalCurrency && (
                        <span className="text-xs text-muted-foreground">Moneda local ({localLabel})</span>
                      )}
                      {method.isCash && (
                        <span className="text-xs text-green-600 dark:text-green-400">Afecta caja registradora</span>
                      )}
                      {method.isCredit && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">Genera cuenta por cobrar</span>
                      )}
                      {method.needsReference && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">Requiere referencia</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Only show delete for custom methods (not the 6 defaults) */}
                    {!method.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(method)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => handleToggle(method)}
                    >
                      <span className="text-xs text-muted-foreground">
                        {togglingId === method.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          method.enabled ? 'ON' : 'OFF'
                        )}
                      </span>
                      <Switch
                        checked={method.enabled}
                        disabled={togglingId === method.id}
                        onCheckedChange={() => handleToggle(method)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Create Custom Method Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); resetCreateForm() } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Método de Pago</DialogTitle>
            <DialogDescription>Agrega un método de pago personalizado para tu negocio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input
                  placeholder="ej: nequi"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">Identificador interno (sin espacios)</p>
              </div>
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  placeholder="ej: Nequi"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ícono</Label>
              <Select value={newIcon} onValueChange={setNewIcon}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={newNeedsRef}
                  onChange={(e) => setNewNeedsRef(e.target.checked)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm font-medium">Requiere referencia</p>
                  <p className="text-xs text-muted-foreground">Nro. de referencia</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={newIsLocal}
                  onChange={(e) => setIsLocal(e.target.checked)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm font-medium">Moneda local</p>
                  <p className="text-xs text-muted-foreground">Usa {localLabel}</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={newIsCash}
                  onChange={(e) => setIsCash(e.target.checked)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm font-medium">Efectivo / Caja</p>
                  <p className="text-xs text-muted-foreground">Afecta caja registradora</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={newIsCredit}
                  onChange={(e) => setIsCredit(e.target.checked)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm font-medium">Crédito</p>
                  <p className="text-xs text-muted-foreground">Genera cuenta por cobrar</p>
                </div>
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-primary hover:bg-primary/90 text-white"
                onClick={handleCreate}
                disabled={creating || !newCode.trim() || !newName.trim()}
              >
                {creating ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Creando...</> : 'Crear Método'}
              </Button>
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm() }}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Este método de pago será eliminado permanentemente. Las ventas ya registradas con este método no se verán afectadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Eliminando...</> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}