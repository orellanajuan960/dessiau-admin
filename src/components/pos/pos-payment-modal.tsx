'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { usePosStore } from '@/stores/use-pos-store'
import { useAuth } from '@/hooks/use-auth'
import { useSetting } from '@/stores/use-app-store'
import { api } from '@/lib/api'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Clock,
  Smartphone,
  CircleDollarSign,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  UserPlus,
  User,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/hooks/use-currency'
import { FALLBACK_METHODS } from '@/lib/payment-methods'
import { calcCartTotals, formatRefPrecision } from '@/lib/currency-conversion'
import { getCurrencyForCountry } from '@/lib/country-currency'
import { getCachedMethods, getCachedCurrencies, getCachedOpenRegId, setCachedMethods, setCachedCurrencies, setCachedOpenRegId } from '@/lib/pos-cache'

interface PosPaymentModalProps {
  onClose: () => void
}

interface PaymentMethodItem {
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
}

interface ClientOption {
  id: string
  name: string
  phone: string | null
  email: string | null
}

interface PaymentEntry {
  tempId: string
  method: string
  amount: string
  reference: string
}

// Icon resolver
const ICON_MAP: Record<string, LucideIcon> = {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Clock,
  Smartphone,
  CircleDollarSign,
}

function getIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || CircleDollarSign
}

export function PosPaymentModal({ onClose }: PosPaymentModalProps) {
  const { items, getTotal, clearCart, clientId, setClientId } = usePosStore()
  const { user } = useAuth()
  const exchangeRate = useSetting('exchangeRate')
  const baseCurrencyId = useSetting('baseCurrencyId')
  const country = useSetting('country') || 'VE'
  const referenceCurrency = useSetting('referenceCurrency') || 'USD'
  const eurRate = useSetting('eurRate') || 0
  const usdRate = useSetting('usdRate') || 0
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [currencies, setCurrencies] = useState<{ id: string; code: string; symbol: string; isBase: boolean }[]>(() => getCachedCurrencies() || [])
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(() => getCachedOpenRegId())
  const [dbMethods, setDbMethods] = useState<PaymentMethodItem[]>(() => getCachedMethods() || [])

  // Hybrid payment state
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([])
  const isHybrid = method === 'hibrido'

  // Client selection
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)

  const ivaEnabled = useSetting('ivaEnabled')
  const ivaRate = Number(useSetting('ivaRate')) || 0
  const multiEnabledSetting = useSetting('multiCurrencyEnabled') as boolean
  const localInfo = getCurrencyForCountry(country)
  const localCode = localInfo?.code || ''

  // Calculate cart totals with per-item currency conversion
  const { subtotalRef, subtotalLocal } = useMemo(() => {
    return calcCartTotals(items, {
      multiEnabled: multiEnabledSetting,
      exchangeRate: exchangeRate as number,
      referenceCurrency: referenceCurrency,
      localCode,
      eurRate,
      usdRate,
    })
  }, [items, exchangeRate, referenceCurrency, localCode, eurRate, usdRate, multiEnabledSetting])

  const subtotal = subtotalRef
  const ivaAmountLocal = ivaEnabled ? Math.round(subtotalLocal * (ivaRate / 100) * 100) / 100 : 0
  const totalLocal = Math.round((subtotalLocal + ivaAmountLocal) * 100) / 100
  // Total in reference currency = (subtotal local + iva local) / exchangeRate
  const total = exchangeRate > 0 ? (totalLocal / exchangeRate) : subtotal
  const { sym: currencySymbol, baseSym, refCode, fmt, fmtBase, multiEnabled } = useCurrency()

  // Keep refs of total values so the useEffect can read them without adding them as dependencies
  const totalRef = useRef(total)
  const totalLocalRef = useRef(totalLocal)
  useEffect(() => { totalRef.current = total }, [total])
  useEffect(() => { totalLocalRef.current = totalLocal }, [totalLocal])

  // Only enabled methods (excluding virtual 'hibrido')
  const paymentMethods = useMemo(() => dbMethods.filter(m => m.enabled), [dbMethods])

  const selectedMethod = paymentMethods.find(pm => pm.code === method)

  // Determine if current method uses local currency (needed before resolvedCurrencyId)
  const isLocalMethod = !isHybrid ? (multiEnabled ? (selectedMethod?.isLocalCurrency ?? false) : false) : false

  // Resolve currencyId based on payment method type
  const baseId = baseCurrencyId || currencies.find(c => c.isBase)?.id || ''
  const refId = currencies.find(c => c.code === referenceCurrency)?.id || currencies[0]?.id || ''
  const resolvedCurrencyId = isLocalMethod ? baseId : refId
  const hasNoCurrency = !resolvedCurrencyId && currencies.length > 0

  // Show client selector when credit is selected
  const showClientSelector = selectedMethod?.isCredit === true

  // Filtered clients for search
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients
    const q = clientSearch.toLowerCase()
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    )
  }, [clients, clientSearch])

  // When METHOD changes, set default amount in the correct currency.
  // Does NOT depend on total/totalLocal to avoid resetting user edits.
  const prevMethodRef = useRef(method)
  useEffect(() => {
    if (method !== prevMethodRef.current) {
      prevMethodRef.current = method
      if (isHybrid) {
        // Initialize first entry for hybrid mode
        const firstNonCredit = paymentMethods.find(m => !m.isCredit)
        const firstCode = firstNonCredit?.code || ''
        const firstIsLocal = multiEnabled ? (firstNonCredit?.isLocalCurrency ?? false) : false
        setPaymentEntries([{
          tempId: crypto.randomUUID(),
          method: firstCode,
          amount: firstIsLocal ? totalLocalRef.current.toFixed(2) : formatRefPrecision(totalRef.current),
          reference: '',
        }])
      } else if (isLocalMethod) {
        setAmount(totalLocalRef.current.toFixed(2))
      } else {
        setAmount(formatRefPrecision(totalRef.current))
      }
    }
  }, [method, isLocalMethod, isHybrid, paymentMethods, multiEnabled])

  // Load clients on mount; methods, currencies & register come from localStorage cache
  useEffect(() => {
    api.get<ClientOption[]>('/api/clients')
      .then((clients) => { if (Array.isArray(clients)) setClients(clients) })
      .catch(() => {})
  }, [])

  // Set default method once from cache (only if none selected yet)
  useEffect(() => {
    if (!method && dbMethods.length > 0) {
      const enabled = dbMethods.filter(m => m.enabled)
      if (enabled.length > 0) setMethod(enabled[0].code)
    }
  }, [dbMethods, method])

  // Create new client
  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }
    setCreatingClient(true)
    try {
      const newClient = await api.post<ClientOption>('/api/clients', {
        name: newClientName.trim(),
        phone: newClientPhone.trim() || undefined,
        email: newClientEmail.trim() || undefined,
      })
      setClients(prev => [...prev, newClient])
      setClientId(newClient.id)
      setShowNewClient(false)
      setNewClientName('')
      setNewClientPhone('')
      setNewClientEmail('')
      setTimeout(() => {
        const el = document.querySelector(`[data-client-id="${newClient.id}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
      toast.success(`Cliente "${newClient.name}" creado`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear cliente'
      toast.error(msg)
    } finally {
      setCreatingClient(false)
    }
  }

  // ── Hybrid payment management ──
  const getMethodCurrency = (methodCode: string) => {
    const m = paymentMethods.find(pm => pm.code === methodCode)
    return multiEnabled ? (m?.isLocalCurrency ?? false) : false
  }

  const convertEntryToRef = (entryAmount: number, isLocal: boolean): number => {
    if (isLocal && exchangeRate > 0) return entryAmount / exchangeRate
    return entryAmount
  }

  const convertRefToEntry = (refAmount: number, isLocal: boolean): string => {
    if (isLocal && exchangeRate > 0) return (refAmount * exchangeRate).toFixed(2)
    return formatRefPrecision(refAmount)
  }

  const hybridTotalInRef = useMemo(() => {
    return paymentEntries.reduce((sum, e) => {
      return sum + convertEntryToRef(parseFloat(e.amount) || 0, getMethodCurrency(e.method))
    }, 0)
  }, [paymentEntries, exchangeRate, paymentMethods, multiEnabled])

  const hybridRemaining = total - hybridTotalInRef
  const hybridRemainingLocal = exchangeRate > 0 ? hybridRemaining * exchangeRate : 0

  const addPaymentEntry = () => {
    // Find a method not yet used (prefer unused non-credit methods)
    const usedMethods = new Set(paymentEntries.map(e => e.method))
    const nextMethod = paymentMethods.find(m => !m.isCredit && !usedMethods.has(m.code))
      || paymentMethods.find(m => !m.isCredit)
      || paymentMethods[0]
    if (!nextMethod) return

    const nextIsLocal = multiEnabled ? (nextMethod.isLocalCurrency ?? false) : false
    const remaining = Math.max(0, hybridRemaining)
    setPaymentEntries(prev => [...prev, {
      tempId: crypto.randomUUID(),
      method: nextMethod.code,
      amount: convertRefToEntry(remaining, nextIsLocal),
      reference: '',
    }])
  }

  const removePaymentEntry = (tempId: string) => {
    setPaymentEntries(prev => prev.filter(e => e.tempId !== tempId))
  }

  const updatePaymentEntry = (tempId: string, field: 'method' | 'amount' | 'reference', value: string) => {
    setPaymentEntries(prev => prev.map(e => {
      if (e.tempId !== tempId) return e
      if (field === 'method') return { ...e, method: value, reference: '' }
      return { ...e, [field]: value }
    }))
  }

  // Convert displayed amount to reference currency for submission (single method only)
  const amountInRefCurrency = useMemo(() => {
    const parsed = parseFloat(amount) || 0
    if (isLocalMethod) {
      return exchangeRate > 0 ? (parsed / exchangeRate) : parsed
    }
    return parsed
  }, [amount, isLocalMethod, exchangeRate])

  const handlePay = async () => {
    // Build payments array from either hybrid entries or single method
    let finalPayments: Array<{ method: string; amount: number; currencyId: string; reference?: string }> = []

    if (isHybrid) {
      // Validate hybrid entries
      if (paymentEntries.length === 0) {
        toast.error('Agregue al menos un metodo de pago')
        return
      }
      for (const entry of paymentEntries) {
        if (!entry.method) {
          toast.error('Seleccione un metodo para cada pago')
          return
        }
        const amt = parseFloat(entry.amount) || 0
        if (amt <= 0) {
          toast.error('Cada pago debe tener un monto mayor a cero')
          return
        }
        const eMethod = paymentMethods.find(m => m.code === entry.method)
        if (eMethod?.needsReference && !entry.reference.trim()) {
          toast.error(`La referencia es obligatoria para ${eMethod.name}`)
          return
        }
        const eIsLocal = multiEnabled ? (eMethod?.isLocalCurrency ?? false) : false
        const eCurrencyId = eIsLocal ? baseId : refId
        finalPayments.push({
          method: entry.method,
          amount: amt,
          currencyId: eCurrencyId,
          reference: entry.reference.trim() || undefined,
        })
      }
      // Check that payments cover the total
      const totalPaymentsRef = finalPayments.reduce((sum, p) => {
        return sum + convertEntryToRef(p.amount, getMethodCurrency(p.method))
      }, 0)
      if (totalPaymentsRef < total - 0.01) {
        toast.error('Los pagos no cubren el total de la venta')
        return
      }
    } else {
      // Single method validation
      if (parseFloat(amount) <= 0) {
        toast.error('El monto debe ser mayor a cero')
        return
      }
      // No limit on payment amount — Math.min caps the stored amount at total.
      // Overpayment is allowed (e.g. paying $2 with a divisa when total is $1.82).
      if (!resolvedCurrencyId) {
        toast.error('No se pudo determinar la moneda. Verifica la configuracion o crea una moneda en el sistema.')
        return
      }
      if (selectedMethod?.needsReference && !reference.trim()) {
        toast.error(`La referencia es obligatoria para ${selectedMethod.name}`)
        return
      }
      if (selectedMethod?.isCredit && !clientId) {
        toast.error('Debe seleccionar un cliente para ventas a credito')
        return
      }

      const paymentAmount = isLocalMethod
        ? parseFloat(amount) || 0
        : Math.min(parseFloat(amount) || 0, total)

      finalPayments = [{
        method,
        amount: paymentAmount,
        currencyId: resolvedCurrencyId,
        reference: reference.trim() || undefined,
      }]
    }

    setLoading(true)
    try {
      await api.post('/api/sales', {
        clientId: clientId || null,
        cashRegId: openCashRegId,
        userId: user?.id || '',
        ivaEnabled: !!ivaEnabled,
        ivaRate,
        lines: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
        })),
        payments: finalPayments,
      })
      setSuccess(true)
      setTimeout(() => {
        clearCart()
        onClose()
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la venta'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Calculate change in the displayed currency (single method only)
  const changeAmount = useMemo(() => {
    if (isHybrid) return 0
    const parsed = parseFloat(amount) || 0
    // Show change for cash and divisas (methods where overpayment with physical money is normal)
    if (selectedMethod?.isCash || selectedMethod?.code === 'divisas') {
      const limit = isLocalMethod ? totalLocal : total
      if (parsed > limit) {
        return parsed - limit
      }
    }
    return 0
  }, [amount, method, isLocalMethod, totalLocal, total, selectedMethod, isHybrid])

  const amountLabel = isLocalMethod ? `Monto (${baseSym})` : 'Monto'
  const changeLabel = isLocalMethod ? baseSym : currencySymbol

  return (
    <Dialog open onOpenChange={() => !success && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar</DialogTitle>
          <DialogDescription>
            Total: {currencySymbol}{formatRefPrecision(total)}
            {multiEnabled && <span className="ml-2">· {baseSym} {totalLocal.toFixed(2)}</span>}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="rounded-full bg-primary/10 p-4 dark:bg-primary/10">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-primary dark:text-primary">¡Venta Exitosa!</h3>
            <p className="text-sm text-muted-foreground">Cerrando automáticamente...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {!openCashRegId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                No hay caja abierta. Las ventas no se asociarán a un registro de caja.
              </div>
            )}
            {!baseCurrencyId && resolvedCurrencyId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                Moneda base no configurada. Se usará la moneda predeterminada del sistema. Ve a Configuración → Moneda para definir la moneda base.
              </div>
            )}

            {/* Method Selection */}
            <RadioGroup value={method} onValueChange={(v) => { setMethod(v); setReference('') }} className="grid grid-cols-2 gap-3">
              {paymentMethods.map((pm) => {
                const Icon = getIcon(pm.icon)
                return (
                  <label
                    key={pm.code}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                      method === pm.code
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <RadioGroupItem value={pm.code} className="sr-only" />
                    <Icon className={`h-5 w-5 ${method === pm.code ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-xs font-medium ${method === pm.code ? 'text-primary dark:text-primary' : ''}`}>
                      {pm.name}
                    </span>
                  </label>
                )
              })}

              {/* Hybrid payment option */}
              <label
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                  isHybrid
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <RadioGroupItem value="hibrido" className="sr-only" />
                <Plus className={`h-5 w-5 ${isHybrid ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-xs font-medium ${isHybrid ? 'text-primary dark:text-primary' : ''}`}>
                  Híbrido
                </span>
              </label>
            </RadioGroup>

            {paymentMethods.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-2">
                No hay métodos de pago activos. Ve a Configuración → Métodos de Pago para activarlos.
              </p>
            )}

            {/* Client selector — shown when credit is selected */}
            {showClientSelector && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Cliente
                  </Label>
                  {!showNewClient && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => setShowNewClient(true)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Nuevo cliente
                    </Button>
                  )}
                </div>

                {!showNewClient ? (
                  <>
                    <Input
                      placeholder="Buscar por nombre, teléfono o email..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="text-sm"
                    />
                    <div className="max-h-48 overflow-y-auto rounded-md border">
                      {filteredClients.length > 0 ? (
                        filteredClients.slice(0, 30).map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            data-client-id={client.id}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-b-0 flex items-center gap-2 ${
                              clientId === client.id
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => {
                              setClientId(client.id)
                              setClientSearch('')
                            }}
                          >
                            <User className={`h-3.5 w-3.5 shrink-0 ${clientId === client.id ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="truncate flex-1">{client.name}</span>
                            {client.phone && (
                              <span className="text-xs text-muted-foreground shrink-0">{client.phone}</span>
                            )}
                            {clientId === client.id && (
                              <span className="text-xs text-primary font-medium shrink-0">✓</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          No se encontraron clientes
                        </p>
                      )}
                    </div>
                    {!clientId && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Seleccione un cliente para vender a crédito
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground">Registrar nuevo cliente</p>
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Nombre *"
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          className="text-sm"
                          autoFocus
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Teléfono"
                            value={newClientPhone}
                            onChange={(e) => setNewClientPhone(e.target.value)}
                            className="text-sm"
                          />
                          <Input
                            placeholder="Email"
                            value={newClientEmail}
                            onChange={(e) => setNewClientEmail(e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 bg-primary hover:bg-primary/90 text-white"
                          onClick={handleCreateClient}
                          disabled={creatingClient || !newClientName.trim()}
                        >
                          {creatingClient ? (
                            <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Creando...</>
                          ) : (
                            <><UserPlus className="mr-1 h-3 w-3" /> Crear</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowNewClient(false)
                            setNewClientName('')
                            setNewClientPhone('')
                            setNewClientEmail('')
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <Separator />

            {/* ── Hybrid payment entries ── */}
            {isHybrid ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Pagos parciales</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addPaymentEntry}
                    disabled={paymentEntries.length >= 5}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Agregar metodo
                  </Button>
                </div>

                {/* Remaining balance */}
                <div className={`rounded-md p-2.5 text-sm font-medium text-center ${
                  hybridRemaining > 0.01
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                    : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                }`}>
                  Restante: {currencySymbol}{formatRefPrecision(Math.max(0, hybridRemaining))}
                  {multiEnabled && <span className="ml-2">({baseSym}{Math.max(0, hybridRemainingLocal).toFixed(2)})</span>}
                </div>

                {/* Payment entry cards */}
                {paymentEntries.map((entry, idx) => {
                  const eMethod = paymentMethods.find(m => m.code === entry.method)
                  const eIsLocal = multiEnabled ? (eMethod?.isLocalCurrency ?? false) : false
                  return (
                    <div key={entry.tempId} className="rounded-md border p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Pago #{idx + 1}
                        </span>
                        {paymentEntries.length > 1 && (
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700 transition-colors p-0.5"
                            onClick={() => removePaymentEntry(entry.tempId)}
                            title="Eliminar este pago"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Method selector */}
                      <Select
                        value={entry.method}
                        onValueChange={(v) => updatePaymentEntry(entry.tempId, 'method', v)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Metodo de pago" />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.filter(m => !m.isCredit).map(m => {
                            const Icon = getIcon(m.icon)
                            return (
                              <SelectItem key={m.code} value={m.code}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5" />
                                  {m.name}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>

                      {/* Amount */}
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={eIsLocal ? `Monto (${baseSym})` : 'Monto ($)'}
                          value={entry.amount}
                          onChange={(e) => updatePaymentEntry(entry.tempId, 'amount', e.target.value)}
                          className="text-sm pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {eIsLocal ? baseSym : '$'}
                        </span>
                      </div>

                      {/* Reference */}
                      {eMethod?.needsReference && (
                        <Input
                          placeholder="Referencia"
                          value={entry.reference}
                          onChange={(e) => updatePaymentEntry(entry.tempId, 'reference', e.target.value)}
                          className="text-sm"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                {/* ── Single method: Amount ── */}
                <div className="space-y-2">
                  <Label htmlFor="amount">{amountLabel}</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {multiEnabled && isLocalMethod && (
                    <p className="text-xs text-muted-foreground">
                      Equivale a {currencySymbol}{formatRefPrecision(amountInRefCurrency)} (Tasa: {exchangeRate.toFixed(2)} {baseSym}/{refCode})
                    </p>
                  )}
                  {changeAmount > 0 && (
                    <p className="text-sm text-primary font-medium">
                      Cambio: {changeLabel}{isLocalMethod ? changeAmount.toFixed(2) : formatRefPrecision(changeAmount)}
                    </p>
                  )}
                </div>

                {/* ── Single method: Reference ── */}
                {selectedMethod?.needsReference && (
                  <div className="space-y-2">
                    <Label htmlFor="reference">Referencia</Label>
                    <Input
                      id="reference"
                      placeholder='Numero de referencia'
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {/* Action */}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              size="lg"
              onClick={handlePay}
              disabled={loading || (!isHybrid && !resolvedCurrencyId) || (selectedMethod?.isCredit && !clientId) || !method}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>Confirmar Pago {isHybrid
                  ? `${currencySymbol}${formatRefPrecision(total)}`
                  : isLocalMethod ? `${baseSym}${parseFloat(amount || '0').toFixed(2)}` : `${currencySymbol}${parseFloat(amount || '0')}`
                }</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}