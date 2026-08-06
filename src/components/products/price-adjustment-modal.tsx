'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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
import { Loader2, Percent, Undo2, X, Search, Check } from 'lucide-react'
import { toast } from 'sonner'

interface BranchItem {
  id: string
  name: string
}

interface ProductData {
  id: string
  name: string
  currencyCode: string
  currencySymbol: string
  inventories: Array<{
    branchId: string
    price: number
  }>
  price: number
}

interface PriceRow {
  productId: string
  productName: string
  currencySymbol: string
  currentPrice: number
  newPrice: number
  hadInventory: boolean
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
  const [priceMap, setPriceMap] = useState<Record<string, Record<string, PriceRow>>>({})
  // branchId -> productId -> PriceRow
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)
  const [recentAdjustments, setRecentAdjustments] = useState<RecentAdjustment[]>([])

  // Fetch products when modal opens
  useEffect(() => {
    if (!open) return
    setPercentage('')
    setSearch('')
    setSaved(false)
    setSelectedBranchIds([mainBranchId])
    setActiveTab(mainBranchId)
    fetchProducts()
    fetchRecentAdjustments()
  }, [open])

  // Recalculate when percentage changes
  useEffect(() => {
    if (!percentage) {
      setPriceMap(prev => {
        const next: Record<string, Record<string, PriceRow>> = {}
        for (const bid of selectedBranchIds) {
          next[bid] = prev[bid] || {}
        }
        return next
      })
      return
    }
    const pct = parseFloat(percentage)
    if (isNaN(pct)) return
    setPriceMap(prev => {
      const next: Record<string, Record<string, PriceRow>> = {}
      for (const bid of selectedBranchIds) {
        next[bid] = {}
        for (const p of products) {
          const existing = prev[bid]?.[p.id]
          // If user manually edited a price, keep it
          if (existing && existing.newPrice !== 0) {
            const expectedAuto = Math.round(existing.currentPrice * (1 + pct / 100) * 100) / 100
            if (existing.newPrice !== expectedAuto) {
              next[bid][p.id] = existing
              continue
            }
          }
          const inv = p.inventories.find(i => i.branchId === bid)
          const currentPrice = inv && inv.price > 0 ? inv.price : p.price
          const newPrice = Math.round(currentPrice * (1 + pct / 100) * 100) / 100
          next[bid][p.id] = {
            productId: p.id,
            productName: p.name,
            currencySymbol: p.currencySymbol,
            currentPrice,
            newPrice,
            hadInventory: !!(inv && inv.price > 0),
          }
        }
      }
      return next
    })
  }, [percentage, selectedBranchIds, products])

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
  }

  const handlePriceChange = (branchId: string, productId: string, value: string) => {
    const num = parseFloat(value)
    setPriceMap(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [productId]: {
          ...(prev[branchId]?.[productId] || { productId, productName: '', currencySymbol: '', currentPrice: 0, newPrice: 0, hadInventory: false }),
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
        branchId: string
        productId: string
        newPrice: number
        previousPrice: number
        hadInventory: boolean
      }> = []

      for (const bid of selectedBranchIds) {
        for (const row of Object.values(priceMap[bid] || {})) {
          if (row.newPrice > 0) {
            adjustments.push({
              branchId: bid,
              productId: row.productId,
              newPrice: row.newPrice,
              previousPrice: row.currentPrice,
              hadInventory: row.hadInventory,
            })
          }
        }
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

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id.slice(0, 8)

  const totalByBranch = (branchId: string) => Object.values(priceMap[branchId] || {}).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ajustar Precios por Porcentaje</DialogTitle>
          <DialogDescription>
            Ingrese el porcentaje de aumento y seleccione las sucursales a las que desea aplicar el ajuste.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Top controls */}
          <div className="flex flex-col sm:flex-row gap-3">
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
                  {/* Search within branch */}
                  <div className="relative mb-2">
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
                              {search ? 'Sin resultados' : 'No hay productos'}
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
                      <span className="text-muted-foreground">{adj.branch.name}</span>
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
