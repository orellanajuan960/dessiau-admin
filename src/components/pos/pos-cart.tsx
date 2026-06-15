'use client'

import { useState, useMemo } from 'react'
import { usePosStore, type PausedSale } from '@/stores/use-pos-store'
import { useSetting, useAppStore } from '@/stores/use-app-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Minus, Plus, Trash2, ShoppingCart, Pause, Play,
  Clock, UserCircle, X, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/hooks/use-currency'
import { getCurrencyForCountry } from '@/lib/country-currency'
import { convertToRefCurrency, calcCartTotals } from '@/lib/currency-conversion'

interface PosCartProps {
  onPayment: () => void
}

function formatPausedTime(isoDate: string) {
  const d = new Date(isoDate)
  return d.toLocaleString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  })
}

export function PosCart({ onPayment }: PosCartProps) {
  const {
    items, updateQuantity, removeItem, getTotal, getItemCount,
    pauseSale, resumeSale, deletePausedSale,
    pausedSales, setClientId, clientId,
  } = usePosStore()

  // Defensive: ensure pausedSales is always an array (old localStorage may lack it)
  const safePausedSales = Array.isArray(pausedSales) ? pausedSales : []

  const exchangeRate = useSetting('exchangeRate')
  const referenceCurrency = useSetting('referenceCurrency')
  const ivaEnabled = useSetting('ivaEnabled')
  const ivaRate = useSetting('ivaRate')
  const country = useSetting('country') || 'VE'
  const eurRate = useSetting('eurRate')
  const usdRate = useSetting('usdRate')

  const localInfo = getCurrencyForCountry(country)
  const localCode = localInfo?.code || ''

  const { sym: refSym, baseSym, fmt, fmtBase, multiEnabled, refCode } = useCurrency()

  const count = getItemCount()

  // Convert each item to reference currency and compute totals
  const { subtotalRef, subtotalLocal } = useMemo(() => {
    if (!multiEnabled || exchangeRate <= 0) {
      // Single currency mode — sum raw values
      const rawTotal = getTotal()
      return { subtotalRef: rawTotal, subtotalLocal: rawTotal }
    }

    // Multi-currency: convert each item's lineTotal to reference currency
    // Also compute local subtotal directly to avoid round-trip precision loss
    let ref = 0
    let local = 0
    items.forEach((item) => {
      const itemInRef = convertToRefCurrency(
        item.lineTotal,
        item.currencyCode,
        referenceCurrency || 'USD',
        localCode,
        exchangeRate,
        eurRate || 0,
        usdRate || 0,
      )
      ref += itemInRef

      // For local total: if item is already in local currency, sum directly;
      // otherwise convert from ref to local (only for non-local items)
      if (item.currencyCode === localCode || !item.currencyCode) {
        local += item.lineTotal
      } else {
        local += itemInRef * exchangeRate
      }
    })
    // Round to avoid floating point issues
    ref = Math.round(ref * 100) / 100
    local = Math.round(local * 100) / 100
    return { subtotalRef: ref, subtotalLocal: local }
  }, [items, multiEnabled, exchangeRate, referenceCurrency, localCode, eurRate, usdRate, getTotal])

  const ivaAmountLocal = ivaEnabled ? Math.round(subtotalLocal * (ivaRate / 100) * 100) / 100 : 0
  const totalLocal = Math.round((subtotalLocal + ivaAmountLocal) * 100) / 100

  const [showPaused, setShowPaused] = useState(false)
  const [qtyEdit, setQtyEdit] = useState<Record<string, string>>({})
  const hasPaused = safePausedSales.length > 0

  const handlePause = () => {
    if (items.length === 0) return
    pauseSale('Cliente general')
    toast.success('Venta pausada correctamente')
  }

  const handleResume = (sale: PausedSale) => {
    const hadActiveItems = usePosStore.getState().items.length > 0
    const success = resumeSale(sale.id)
    if (success) {
      setShowPaused(false)
      if (hadActiveItems) {
        toast.success('Venta activa pausada automáticamente', {
          description: 'La venta que tenías en curso fue guardada en pausadas.',
        })
      }
      toast.success('Venta restaurada')
    } else {
      toast.error('No se puede restaurar: la venta pertenece a otra sucursal')
    }
  }

  const handleDelete = (saleId: string) => {
    deletePausedSale(saleId)
    toast.success('Venta pausada eliminada')
  }

  const cartContent = (
    <div className="flex w-full max-w-sm flex-col rounded-lg border bg-card shadow-sm md:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          <span className="font-semibold">Carrito</span>
        </div>
        <div className="flex items-center gap-2">
          {hasPaused && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => setShowPaused(true)}
            >
              <Pause className="h-3 w-3 mr-1" />
              {safePausedSales.length}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{count} items</span>
        </div>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1 p-2" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Carrito vacío</p>
            <p className="text-xs text-muted-foreground/70">Agrega productos para comenzar</p>
            {hasPaused && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-amber-600 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30"
                onClick={() => setShowPaused(true)}
              >
                <Play className="h-3 w-3 mr-1.5" />
                Reanudar venta pausada
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              // Convert this item's lineTotal to reference currency for display
              const itemInRef = multiEnabled
                ? convertToRefCurrency(
                    item.lineTotal,
                    item.currencyCode,
                    referenceCurrency || 'USD',
                    localCode,
                    exchangeRate,
                    eurRate || 0,
                    usdRate || 0,
                  )
                : item.lineTotal
              // For local display: use lineTotal directly if item is in local currency
              // to avoid round-trip precision loss (local → ref → local)
              const itemInLocal = (item.currencyCode === localCode || !item.currencyCode)
                ? item.lineTotal
                : itemInRef * exchangeRate
              // Show mixed currency indicator when item currency differs from reference
              const isDifferentCurrency = multiEnabled && item.currencyCode && item.currencyCode !== (referenceCurrency || 'USD')
              const atMaxStock = item.quantity >= item.maxStock
              return (
                <div key={item.productId} className="rounded-md border p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.currencySymbol}{item.unitPrice.toFixed(2)}{item.displayUnit ? ` /${item.displayUnit}` : ' c/u'}
                        {isDifferentCurrency && (
                          <span className="ml-1 text-[10px] text-amber-600 font-medium">
                            ({item.currencyCode})
                          </span>
                        )}
                      </p>
                      {atMaxStock && (
                        <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                          Stock máximo alcanzado ({item.maxStock})
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-10 h-6 text-center text-sm font-medium bg-transparent border border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={qtyEdit[item.productId] ?? String(item.quantity)}
                        onFocus={() => setQtyEdit(prev => ({ ...prev, [item.productId]: String(item.quantity) }))}
                        onChange={(e) => setQtyEdit(prev => ({ ...prev, [item.productId]: e.target.value.replace(/[^0-9]/g, '') }))}
                        onBlur={() => {
                          const val = parseInt(qtyEdit[item.productId]) || 0
                          if (val <= 0) removeItem(item.productId)
                          else if (val > item.maxStock) updateQuantity(item.productId, item.maxStock)
                          else if (val !== item.quantity) updateQuantity(item.productId, val)
                          setQtyEdit(prev => { const next = { ...prev }; delete next[item.productId]; return next })
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        disabled={atMaxStock}
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        title={atMaxStock ? `Stock máximo: ${item.maxStock}` : 'Agregar uno más'}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right">
                      {multiEnabled ? (
                        <>
                          <span className="text-sm font-bold text-primary dark:text-primary">
                            {refSym}{itemInRef.toFixed(2)}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {baseSym} {itemInLocal.toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-primary dark:text-primary">
                          {item.currencySymbol}{item.lineTotal.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3 space-y-2">
        <div className="space-y-1">
          {multiEnabled && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Subtotal ({referenceCurrency || 'USD'})</span>
                <span className="text-sm font-medium">
                  {refSym}{subtotalRef.toFixed(2)}
                </span>
              </div>
              {ivaEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{`Subtotal (${baseSym})`}</span>
                    <span className="text-sm font-medium">
                      {baseSym} {subtotalLocal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">I.V.A. ({(ivaRate ?? 0).toFixed(2)}%)</span>
                    <span className="text-sm font-medium text-blue-600">
                      +{baseSym} {ivaAmountLocal.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
          {multiEnabled && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total {ivaEnabled ? '(con I.V.A.)' : `(${baseSym})`}
              </span>
              <span className="text-2xl font-bold text-primary dark:text-primary">
                {baseSym} {totalLocal.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:hover:bg-amber-950/30 dark:hover:text-amber-400"
            disabled={items.length === 0}
            onClick={handlePause}
          >
            <Pause className="mr-1.5 h-4 w-4" />
            Pausar
          </Button>
          <Button
            className="flex-[2] bg-primary hover:bg-primary/90 text-white"
            size="lg"
            disabled={items.length === 0}
            onClick={onPayment}
            data-tutorial="pos-pay"
          >
            Cobrar {multiEnabled ? `${baseSym} ${totalLocal.toFixed(2)}` : `${fmt(getTotal())}`}
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {cartContent}

      {/* Paused Sales Dialog */}
      <Dialog open={showPaused} onOpenChange={setShowPaused}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pause className="h-5 w-5 text-amber-600" />
              Ventas Pausadas
            </DialogTitle>
            <DialogDescription>
              {safePausedSales.length} venta{safePausedSales.length !== 1 ? 's' : ''} en espera. Selecciona una para continuar.
            </DialogDescription>
          </DialogHeader>

          {safePausedSales.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No hay ventas pausadas</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto -mx-6 px-6">
              <div className="space-y-2">
                {safePausedSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/30 hover:bg-muted/50 transition-colors"
                  >
                    {/* Product preview */}
                    <div className="flex -space-x-2 shrink-0">
                      {sale.items.slice(0, 3).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex h-9 w-9 items-center justify-center rounded-md bg-muted border text-[10px] font-medium text-muted-foreground"
                        >
                          {sale.items.length > 3 && idx === 2
                            ? `+${sale.items.length - 2}`
                            : sale.items.length > 3 && idx === 1
                              ? `${sale.items[1].quantity}`
                              : `${item.quantity}x`}
                        </div>
                      ))}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{sale.clientName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {sale.itemCount} producto{sale.itemCount !== 1 ? 's' : ''} · {formatPausedTime(sale.pausedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">
                        {refSym}{sale.total.toFixed(2)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        onClick={() => handleResume(sale)}
                        title="Reanudar"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(sale.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {safePausedSales.length > 0 && (
            <div className="pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={() => {
                  usePosStore.setState({ pausedSales: [] })
                  setShowPaused(false)
                  toast.success('Todas las ventas pausadas fueron eliminadas')
                }}
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Eliminar todas
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}