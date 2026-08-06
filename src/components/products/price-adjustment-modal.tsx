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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, Percent, Undo2, X, Search, Check, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface BranchItem {
  id: string
  name: string
}

interface ProductData {
  id: string
  name: string
  currency: {
    code: string
    symbol: string
    isBase: boolean
  }
  price: number
  inventories: Array<{
    branchId: string
    price: number
  }>
}

interface PriceRow {
  productId: string
  productName: string
  currencySymbol: string
  currentPrice: number
  newPrice: number
  hadInventoryPrice: boolean
}

interface RecentAdjustment {
  id: string
  branchId: string
  percentage: number
  createdAt: string
  branch: { id: string; name: string }
  user: { id: string; name: string } | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: BranchItem[]
  mainBranchId: string
  onSaved: () => void
}

export function PriceAdjustmentModal({ open, onOpenChange, branches, mainBranchId, onSaved }: Props) {
  const [percentage, setPercentage] = useState('')
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([mainBranchId])
  const [activeTab, setActiveTab] = useState(mainBranchId)
  const [products, setProducts] = useState<ProductData[]>([])
  // branchId -> productId -> PriceRow
  const [priceMap, setPriceMap] = useState<Record<string, Record<string, PriceRow>>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)
  const [recentAdjustments, setRecentAdjustments] = useState<RecentAdjustment[]>([])

  // Track manually edited prices: "branchId:productId"
  const manualEdits = useRef<Set<string>>(new Set())

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    setPercentage('')
    setSearch('')
    setSaved(false)
    setSelectedBranchIds([mainBranchId])
    setActiveTab(mainBranchId)
    setPriceMap({})
    manualEdits.current = new Set()
    fetchProducts()
    fetchRecentAdjustments()
  }, [open])

  // Compute price rows from products + percentage
  const recalculate = useCallback((pctValue: number) => {
    const localProducts = products.filter(p => p.currency?.isBase !== false)
    const next: Record<string, Record<string, PriceRow>> = {}
    for (const bid of selectedBranchIds) {
      next[bid] = {}
      for (const p of localProducts) {
        const editKey = `${bid}:${p.id}`
        if (manualEdits.current.has(editKey)) continue
        const inv = p.inventories.find(i => i.branchId === bid)
        const currentPrice = (inv && inv.price > 0) ? inv.price : p.price
        const newPrice = Math.round(currentPrice * (1 + pctValue / 100) * 100) / 100
        next[bid][p.id] = {
          productId: p.id,
          productName: p.name,
          currencySymbol: p.currency?.symbol || '',
          currentPrice,
          newPrice,
          hadInventoryPrice: !!(inv && inv.price > 0),
        }
      }
    }
    setPriceMap(prev => {
      const merged: Record<string, Record<string, PriceRow>> = {}
      for (const bid of selectedBranchIds) {
        merged[bid] = {}
        // Keep manual edits
        if (prev[bid]) {
          for (const pid of Object.keys(prev[bid])) {
            if (manualEdits.current.has(`${bid}:${pid}`)) {
              merged[bid][pid] = prev[bid][pid]
            }
          }
        }
        // Overlay auto-calculated
        if (next[bid]) {
          for (const [pid, row] of Object.entries(next[bid])) {
            merged[bid][pid] = row
          }
        }
      }
      return merged
    })
  }, [products, selectedBranchIds])

  // When percentage changes, recalculate
  useEffect(() => {
    if (!percentage) {
      setPriceMap(prev => {
        const merged: Record<string, Record<string, PriceRow>> = {}
        for (const bid of selectedBranchIds) {
          merged[bid] = {}
          if (prev[bid]) {
            for (const pid of Object.keys(prev[bid])) {
              if (manualEdits.current.has(`${bid}:${pid}`)) {
                merged[bid][pid] = prev[bid][pid]
              }
            }
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
  }, [percentage, recalculate, selectedBranchIds])

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
      params.set('allInventories', 'true')
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

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds(prev => {
      const next = prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId]
      if (next.length > 0 && !next.includes(activeTab)) {
        setActiveTab(next[0])
      }
      return next
    })
    if (percentage) {
      const pct = parseFloat(percentage)
      if (!isNaN(pct)) setTimeout(() => recalculate(pct), 0)
    }
  }

  const handlePriceChange = (branchId: string, productId: string, value: string) => {
    const num = parseFloat(value)
    const editKey = `${branchId}:${productId}`
    if (!isNaN(num) && num > 0) {
      manualEdits.current.add(editKey)
    } else {
      manualEdits.current.delete(editKey)
    }
    setPriceMap(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [productId]: {
          ...(prev[branchId]?.[productId] || { productId, productName: '', currencySymbol: '', currentPrice: 0, newPrice: 0, hadInventoryPrice: false }),
          newPrice: isNaN(num) ? 0 : Math.round(num * 100) / 100,
        },
      },
    }))
  }

  const getFilteredRows = (branchId: string) => {
    const rows = Object.values(priceMap[branchId] || {})
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.productName.toLowerCase().includes(q))
  }

  const handleSave = async () => {
    if (selectedBranchIds.length === 0) {
      toast.error('Seleccione al menos una sucursal')
      return
    }
    setSaving(true)
    try {
      const adjustments: Array<{
        productId: string
        newPrice: number
        previousPrice: number
      }> = []

      // Collect unique product adjustments (same product.price for all branches)
      const seen = new Set<string>()
      for (const bid of selectedBranchIds) {
        for (const row of Object.values(priceMap[bid] || {})) {
          if (row.newPrice > 0 && !seen.has(row.productId)) {
            seen.add(row.productId)
            adjustments.push({
              productId: row.productId,
              newPrice: row.newPrice,
              previousPrice: row.currentPrice,
            })
          }
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
          branchIds: selectedBranchIds,
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

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id.slice(0, 8)
  const totalByBranch = (branchId: string) => Object.values(priceMap[branchId] || {}).length
  const usdCount = products.filter(p => p.currency?.isBase === false).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ajustar Precios por Porcentaje</DialogTitle>
          <DialogDescription>
            Ingrese el porcentaje de aumento y seleccione las sucursales. Solo se ajustan productos en moneda local (Bs).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Top controls */}
          <div className="flex flex-col sm:flex-row gap-3">
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

            {/* Branch selector */}
            <div className="flex-1 flex flex-wrap items-center gap-2">
              {selectedBranchIds.map(bid => (
                <Badge key={bid} variant="secondary" className="pl-2 pr-1 py-1 gap-1 cursor-default">
                  {branchName(bid)}
                  <button
                    onClick={() => toggleBranch(bid)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {branches.filter(b => !selectedBranchIds.includes(b.id)).length > 0 && (
                <select
                  className="text-sm border rounded-md px-2 py-1 bg-background"
                  value=""
                  onChange={e => {
                    if (e.target.value) toggleBranch(e.target.value)
                  }}
                >
                  <option value="">+ Sucursal</option>
                  {branches.filter(b => !selectedBranchIds.includes(b.id)).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Cargando productos...</span>
            </div>
          ) : selectedBranchIds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-muted-foreground">
              Seleccione al menos una sucursal
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start">
                {selectedBranchIds.map(bid => (
                  <TabsTrigger key={bid} value={bid}>
                    {branchName(bid)}
                    <span className="ml-1 text-xs text-muted-foreground">({totalByBranch(bid)})</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {selectedBranchIds.map(bid => (
                <TabsContent key={bid} value={bid} className="flex-1 flex flex-col min-h-0">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar producto..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>

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
                        {getFilteredRows(bid).map(row => (
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
                                  onChange={e => handlePriceChange(bid, row.productId, e.target.value)}
                                  className="w-24 text-right border rounded px-2 py-1 text-sm bg-background"
                                  step="0.01"
                                  min="0"
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                        {getFilteredRows(bid).length === 0 && (
                          <tr>
                            <td colSpan={3} className="text-center py-8 text-muted-foreground">
                              {search ? 'Sin resultados' : 'No hay productos en moneda local (Bs)'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}

          {!loading && usdCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              <span>{usdCount} producto{usdCount !== 1 ? 's' : ''} en USD excluido{usdCount !== 1 ? 's' : ''} del ajuste</span>
            </div>
          )}

          {recentAdjustments.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Ajustes recientes</p>
              <div className="flex flex-wrap gap-2">
                {recentAdjustments.slice(0, 5).map(adj => {
                  const d = new Date(adj.createdAt)
                  const dateStr = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={adj.id} className="flex items-center gap-2 border rounded-md px-2 py-1 text-xs">
                      <span className="text-muted-foreground">{adj.branch?.name || 'Global'}</span>
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

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedBranchIds.length} sucursal{selectedBranchIds.length !== 1 ? 'es' : ''}
            {percentage ? ' · ' + percentage + '% de aumento' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !percentage || selectedBranchIds.length === 0}
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
