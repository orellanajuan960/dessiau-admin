'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Percent, Undo2, Search, Check, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface ProductData {
  id: string
  name: string
  currency: {
    code: string
    symbol: string
    isBase: boolean
  }
  price: number
}

interface PriceRow {
  productId: string
  productName: string
  currencySymbol: string
  currentPrice: number
  newPrice: number
}

interface RecentAdjustment {
  id: string
  percentage: number
  createdAt: string
  user: { id: string; name: string } | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function PriceAdjustmentModal({ open, onOpenChange, onSaved }: Props) {
  const [percentage, setPercentage] = useState('')
  const [products, setProducts] = useState<ProductData[]>([])
  const [priceMap, setPriceMap] = useState<Record<string, PriceRow>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)
  const [recentAdjustments, setRecentAdjustments] = useState<RecentAdjustment[]>([])

  // Track which prices the user manually edited
  const manualEdits = useRef<Set<string>>(new Set())

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    setPercentage('')
    setSearch('')
    setSaved(false)
    setPriceMap({})
    manualEdits.current = new Set()
    fetchProducts()
    fetchRecentAdjustments()
  }, [open])

  // Compute price rows from products + percentage
  const recalculate = useCallback((pctValue: number) => {
    const localProducts = products.filter(p => p.currency?.isBase !== false)
    const next: Record<string, PriceRow> = {}
    for (const p of localProducts) {
      if (manualEdits.current.has(p.id)) continue
      const newPrice = Math.round(p.price * (1 + pctValue / 100) * 100) / 100
      next[p.id] = {
        productId: p.id,
        productName: p.name,
        currencySymbol: p.currency?.symbol || '',
        currentPrice: p.price,
        newPrice,
      }
    }
    setPriceMap(prev => {
      const merged: Record<string, PriceRow> = {}
      // Keep manually edited prices
      for (const pid of Object.keys(prev)) {
        if (manualEdits.current.has(pid)) {
          merged[pid] = prev[pid]
        }
      }
      // Overlay auto-calculated prices
      for (const [pid, row] of Object.entries(next)) {
        merged[pid] = row
      }
      return merged
    })
  }, [products])

  // When percentage changes, recalculate
  useEffect(() => {
    if (!percentage) {
      setPriceMap(prev => {
        const merged: Record<string, PriceRow> = {}
        for (const pid of Object.keys(prev)) {
          if (manualEdits.current.has(pid)) {
            merged[pid] = prev[pid]
          }
        }
        return merged
      })
      return
    }
    const pct = parseFloat(percentage)
    if (isNaN(pct)) return
    manualEdits.current = new Set()
    recalculate(pct)
  }, [percentage, recalculate])

  // When products finish loading, recalculate if there's a percentage
  useEffect(() => {
    if (products.length === 0) return
    if (!percentage) return
    const pct = parseFloat(percentage)
    if (isNaN(pct)) return
    recalculate(pct)
  }, [products.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('active', 'true')
      const res = await fetch('/api/products?' + params.toString(), { credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setProducts(data.products || [])
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentAdjustments = async () => {
    try {
      const res = await fetch('/api/products/price-adjustment', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setRecentAdjustments(data)
      }
    } catch {
      // ignore
    }
  }

  const handlePriceChange = (productId: string, value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num) && num > 0) {
      manualEdits.current.add(productId)
    } else {
      manualEdits.current.delete(productId)
    }
    setPriceMap(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { productId, productName: '', currencySymbol: '', currentPrice: 0, newPrice: 0 }),
        newPrice: isNaN(num) ? 0 : Math.round(num * 100) / 100,
      },
    }))
  }

  const getFilteredRows = () => {
    const rows = Object.values(priceMap)
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.productName.toLowerCase().includes(q))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const adjustments: Array<{
        productId: string
        newPrice: number
        previousPrice: number
      }> = []

      for (const row of Object.values(priceMap)) {
        if (row.newPrice > 0) {
          adjustments.push({
            productId: row.productId,
            newPrice: row.newPrice,
            previousPrice: row.currentPrice,
          })
        }
      }

      if (adjustments.length === 0) {
        toast.error('No hay productos para ajustar')
        setSaving(false)
        return
      }

      const res = await fetch('/api/products/batch-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          percentage: parseFloat(percentage) || 0,
          adjustments,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Precios actualizados correctamente')
      setSaved(true)
      onSaved()
      fetchRecentAdjustments()
    } catch {
      toast.error('Error al guardar ajuste de precios')
    } finally {
      setSaving(false)
    }
  }

  const handleRevert = async (adjustmentId: string) => {
    setReverting(adjustmentId)
    try {
      const res = await fetch('/api/products/price-adjustment/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ adjustmentId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Ajuste revertido correctamente')
      fetchProducts()
      fetchRecentAdjustments()
      onSaved()
    } catch {
      toast.error('Error al revertir ajuste')
    } finally {
      setReverting(null)
    }
  }

  const usdCount = products.filter(p => p.currency?.isBase === false).length
  const filteredRows = getFilteredRows()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ajustar Precios por Porcentaje</DialogTitle>
          <DialogDescription>
            Ingrese el porcentaje de aumento. Solo se ajustan productos en moneda local (Bs).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Percentage input */}
          <div className="relative w-36">
            <Input
              type="number"
              placeholder="%"
              value={percentage}
              onChange={e => setPercentage(e.target.value)}
              min="0"
              step="0.1"
              className="pr-8"
            />
            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Cargando productos...</span>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Product list */}
              <div className="flex-1 overflow-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Precio Actual</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Precio Nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => (
                      <tr key={row.productId} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-1.5">{row.productName}</td>
                        <td className="px-3 py-1.5 text-right">
                          {row.currencySymbol} {row.currentPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground text-xs">{row.currencySymbol}</span>
                            <input
                              type="number"
                              value={row.newPrice || ''}
                              onChange={e => handlePriceChange(row.productId, e.target.value)}
                              className="w-24 text-right border rounded px-2 py-1 text-sm bg-background"
                              step="0.01"
                              min="0"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-muted-foreground">
                          {search ? 'Sin resultados' : 'No hay productos en moneda local (Bs)'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Info about excluded USD products */}
          {!loading && usdCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              <span>{usdCount} producto{usdCount !== 1 ? 's' : ''} en USD excluido{usdCount !== 1 ? 's' : ''} del ajuste</span>
            </div>
          )}

          {/* Recent adjustments with revert */}
          {recentAdjustments.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Ajustes recientes</p>
              <div className="flex flex-wrap gap-2">
                {recentAdjustments.slice(0, 5).map(adj => {
                  const d = new Date(adj.createdAt)
                  const dateStr = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={adj.id} className="flex items-center gap-2 border rounded-md px-2 py-1 text-xs">
                      <Badge variant="outline">{adj.percentage}%</Badge>
                      <span className="text-muted-foreground">{dateStr}</span>
                      {adj.user && <span className="text-muted-foreground">por {adj.user.name}</span>}
                      <button
                        onClick={() => handleRevert(adj.id)}
                        disabled={reverting === adj.id}
                        className="ml-1 text-destructive hover:text-destructive/80 disabled:opacity-50"
                        title="Revertir este ajuste"
                      >
                        {reverting === adj.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {filteredRows.length} producto{filteredRows.length !== 1 ? 's' : ''}
            {percentage ? ' · ' + percentage + '% de aumento' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !percentage || filteredRows.length === 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saved ? <Check className="mr-2 h-4 w-4" /> : null}
              Guardar cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
