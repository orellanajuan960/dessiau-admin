'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus, Search, Edit, Trash2, Package, Eye, EyeOff, Upload, ImageIcon, X, Loader2, Printer, Barcode, AlertTriangle, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { ProductImportDialog } from './product-import-dialog'
import { BarcodeLabelSelector } from './barcode-label-selector'
import { useAuth } from '@/hooks/use-auth'
import { useCurrency } from '@/hooks/use-currency'
import { useSetting } from '@/stores/use-app-store'
import { getCurrencyForCountry } from '@/lib/country-currency'

// ── Interfaces ──────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku: string | null
  type: string
  costAvg: number
  price: number
  imageUrl: string
  active: boolean
  currency: { id: string; symbol: string; code: string }
  category: { id: string; name: string } | null
  inventories: Array<{ id: string; stock: number; minStock: number; branchId: string; price: number }>
}

interface Category {
  id: string
  name: string
  _count: { products: number }
}

interface Currency {
  id: string
  code: string
  symbol: string
  isBase: boolean
}

interface BranchItem {
  id: string
  name: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtStock(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('es-VE')
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

// ── Component ───────────────────────────────────────────────────────────────

export function ProductsTable() {
  const { permissions } = useAuth()
  const canManage = permissions.canManageProducts
  const { multiEnabled, refCode, sym: currencySym, fmt: fmtCurrency, baseCode } = useCurrency()
  const country = useSetting('country') || 'VE'
  const localCurrencyInfo = getCurrencyForCountry(country)
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const branches = useAppStore((s) => s.branches)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('__all__')
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState(false)
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false)
  const [hardDeleteResult, setHardDeleteResult] = useState<{ dependencies: string[]; canHardDelete: boolean } | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formSku, setFormSku] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formCost, setFormCost] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formCurrency, setFormCurrency] = useState('')
  const [formStock, setFormStock] = useState('')
  const [formMinStock, setFormMinStock] = useState('')
  const [formBranchPrice, setFormBranchPrice] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formImageUrl, setFormImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const activeParam = showInactive ? 'all' : 'true'
      const branchParam = selectedBranchId ? `&branchId=${selectedBranchId}` : ''
      const requests: Promise<unknown>[] = [
        api.get<{ products: Product[] }>(`/api/products?active=${activeParam}${branchParam}`),
        api.get<Category[]>('/api/categories'),
      ]
      if (multiEnabled) {
        requests.push(api.get<Currency[]>('/api/currencies'))
      }
      const results = await Promise.all(requests)
      setProducts((results[0] as { products: Product[] }).products)
      setCategories(results[1] as Category[])
      if (multiEnabled) {
        setCurrencies(results[2] as Currency[])
      }
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [showInactive, selectedBranchId, multiEnabled])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
    const matchCat =
      catFilter === '__all__' || p.category?.id === catFilter
    return matchSearch && matchCat
  })

  const activeCount = products.filter((p) => p.active).length
  const inactiveCount = products.filter((p) => !p.active).length

  // ── Get branch-specific stock ────────────────────────────────────────────

  const getBranchStock = (product: Product): { stock: number; minStock: number; branchPrice: number; label: string } => {
    if (selectedBranchId) {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      if (branchInv) {
        return { stock: branchInv.stock, minStock: branchInv.minStock, branchPrice: branchInv.price, label: '' }
      }
      return { stock: 0, minStock: 0, branchPrice: 0, label: 'N/A' }
    }
    // No branch selected — show total stock
    const totalStock = product.inventories.reduce((sum, i) => sum + i.stock, 0)
    return { stock: totalStock, minStock: 0, branchPrice: 0, label: 'Total' }
  }

  // ── Get effective price (branch-specific or global) ─────────────────────

  const getEffectivePrice = (product: Product): number => {
    const { branchPrice } = getBranchStock(product)
    return branchPrice > 0 ? branchPrice : product.price
  }

  // ── Dialog helpers ───────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormName('')
    setFormSku('')
    setFormPrice('')
    setFormCost('0')
    setFormStock('')
    setFormMinStock('')
    setFormBranchPrice('')
    setFormCategory('')
    setFormCurrency('')
    setFormActive(true)
    setFormImageUrl('')
    setEditProduct(null)
  }, [])

  const openCreate = useCallback(() => {
    resetForm()
    // Default to the base currency (company's country currency)
    const baseCurr = currencies.find(c => c.isBase)
    setFormCurrency(baseCurr?.id || '')
    setDialogOpen(true)
  }, [currencies, refCode, resetForm])

  const openEdit = useCallback(
    (product: Product) => {
      setEditProduct(product)
      setFormName(product.name)
      setFormSku(product.sku || '')
      setFormPrice(product.price.toString())
      setFormCost(product.costAvg.toString())
      setFormCategory(product.category?.id || '__none__')
      setFormCurrency(product.currency.id)
      setFormActive(product.active)
      setFormImageUrl(product.imageUrl || '')
      // Set branch-specific values
      if (selectedBranchId) {
        const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
        setFormStock(branchInv?.stock?.toString() || '')
        setFormMinStock(branchInv?.minStock?.toString() || '')
        setFormBranchPrice((branchInv?.price ?? 0) > 0 ? branchInv!.price.toString() : '')
      } else {
        setFormStock(product.inventories[0]?.stock?.toString() || '')
        setFormMinStock(product.inventories[0]?.minStock?.toString() || '')
        setFormBranchPrice('')
      }
      setDialogOpen(true)
    },
    [selectedBranchId]
  )

  const openDeleteConfirm = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteDialogOpen(true)
  }, [])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const price = parseFloat(formPrice)
    if (isNaN(price) || price <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    setSaving(true)
    try {
      const body = {
        name: formName.trim(),
        sku: formSku.trim() || null,
        price,
        costAvg: parseFloat(formCost) || 0,
        currencyId: multiEnabled ? formCurrency : undefined,
        categoryId: formCategory && formCategory !== '__none__' ? formCategory : null,
        type: 'simple',
        imageUrl: formImageUrl || undefined,
        branchId: selectedBranchId || undefined,
        branchPrice: formBranchPrice !== '' ? parseFloat(formBranchPrice) : undefined,
      }

      if (editProduct) {
        const res = await fetch(`/api/products/${editProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            active: formActive,
            initialStock: formStock !== '' ? parseInt(formStock) : undefined,
            minStock: formMinStock !== '' ? parseInt(formMinStock) : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Error al actualizar producto')
          return
        }
        toast.success('Producto actualizado')
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            initialStock: formStock !== '' ? parseInt(formStock) : undefined,
            minStock: formMinStock !== '' ? parseInt(formMinStock) : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Error al crear producto')
          return
        }
        toast.success('Producto creado')
      }
      setDialogOpen(false)
      fetchData()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Error al guardar producto'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!productToDelete) return
    try {
      await api.del(`/api/products/${productToDelete.id}`)
      toast.success(`"${productToDelete.name}" desactivado`)
      setDeleteDialogOpen(false)
      setProductToDelete(null)
      fetchData()
    } catch {
      toast.error('Error al desactivar producto')
    }
  }

  const handlePrintLabel = async (product: Product) => {
    setGeneratingLabel(true)
    try {
      const res = await fetch('/api/products/barcode-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: [{ productId: product.id, quantity: 1 }] }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiqueta_${product.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Etiqueta generada')
    } catch {
      toast.error('Error al generar etiqueta')
    } finally {
      setGeneratingLabel(false)
    }
  }

  const handleToggleActive = async (product: Product) => {
    const newActive = !product.active
    try {
      if (selectedBranchId && !newActive) {
        // Per-branch disable: set stock to 0 in this branch only
        await api.put(`/api/products/${product.id}`, {
          disableInBranch: true,
          branchId: selectedBranchId,
        })
        toast.success(`"${product.name}" desactivado en esta sucursal (stock = 0)`)
      } else if (selectedBranchId && newActive) {
        // Per-branch enable: restore stock in this branch
        await api.put(`/api/products/${product.id}`, {
          enableInBranch: true,
          branchId: selectedBranchId,
          stock: 1,
        })
        toast.success(`"${product.name}" reactivado en esta sucursal`)
      } else {
        // No branch selected — global toggle
        await api.put(`/api/products/${product.id}`, {
          name: product.name,
          sku: product.sku,
          type: product.type,
          costAvg: product.costAvg,
          price: product.price,
          currencyId: product.currency.id,
          categoryId: product.category?.id || null,
          active: newActive,
        })
        toast.success(newActive ? `"${product.name}" activado` : `"${product.name}" desactivado`)
      }
      fetchData()
    } catch {
      toast.error('Error al cambiar estado del producto')
    }
  }

  const handleHardDeleteCheck = async () => {
    if (!productToDelete) return
    try {
      const delRes = await fetch(`/api/products/${productToDelete.id}?hard=true`, { method: 'DELETE' })
      const data = await delRes.json()
      if (!delRes.ok && data.dependencies) {
        setHardDeleteResult({ dependencies: data.dependencies, canHardDelete: false })
      } else {
        setHardDeleteResult({ dependencies: [], canHardDelete: true })
      }
      setHardDeleteDialogOpen(true)
    } catch {
      toast.error('Error al verificar dependencias')
    }
  }

  const handleHardDelete = async () => {
    if (!productToDelete) return
    try {
      const res = await fetch(`/api/products/${productToDelete.id}?hard=true`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setHardDeleteResult({ dependencies: data.dependencies || [], canHardDelete: false })
        return
      }
      toast.success(`"${productToDelete.name}" eliminado permanentemente`)
      setHardDeleteDialogOpen(false)
      setProductToDelete(null)
      setDeleteDialogOpen(false)
      setHardDeleteResult(null)
      fetchData()
    } catch {
      toast.error('Error al eliminar producto')
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded bg-muted animate-pulse" />
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const branchName = branches.find(b => b.id === selectedBranchId)?.name

  return (
    <>
    {/* Global loader for label generation */}
    {generatingLabel && (
      <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
        <div className="bg-popover rounded-xl p-6 shadow-2xl flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Generando etiqueta...</p>
          <p className="text-xs text-muted-foreground">Por favor espera</p>
        </div>
      </div>
    )}
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive" className="cursor-pointer select-none">
              {showInactive ? <Eye className="inline h-4 w-4 mr-1" /> : <EyeOff className="inline h-4 w-4 mr-1" />}
              Inactivos ({inactiveCount})
            </Label>
          </div>
          {canManage && (
            <>
              <Button
                data-tutorial="products-new-btn"
                onClick={openCreate}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" /> Importar
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => setLabelsOpen(true)}
          >
            <Printer className="mr-2 h-4 w-4" /> Etiquetas
          </Button>
        </div>
      </div>

      {/* Branch indicator */}
      {branchName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="text-primary">Sucursal: {branchName}</Badge>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="secondary">{filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}</Badge>
        <Badge variant="outline" className="text-primary">{activeCount} activo{activeCount !== 1 ? 's' : ''}</Badge>
        {inactiveCount > 0 && (
          <Badge variant="outline" className="text-muted-foreground">{inactiveCount} inactivo{inactiveCount !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Stock</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const { stock, minStock, label } = getBranchStock(product)
                  const effectivePrice = getEffectivePrice(product)
                  const isLowStock = product.active && minStock > 0 && stock <= minStock
                  const hasBranchPrice = selectedBranchId && product.inventories.some(i => i.branchId === selectedBranchId && i.price > 0)
                  return (
                    <TableRow
                      key={product.id}
                      className={!product.active ? 'opacity-60' : ''}
                    >
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {product.sku || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.category?.name || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {product.currency?.symbol || currencySym}{fmt(product.costAvg)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {product.currency?.symbol || currencySym}{fmt(effectivePrice)}
                        {hasBranchPrice && (
                          <span className="ml-1 text-[10px] text-amber-600">★</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell tabular-nums">
                        <span className={isLowStock ? 'text-red-600 font-medium' : ''}>
                          {label === 'N/A' ? 'N/A' : fmtStock(stock)}
                        </span>
                        {label === 'Total' && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(total)</span>
                        )}
                        {isLowStock && (
                          <span className="ml-1 text-[10px] text-red-500">(mín: {fmtStock(minStock)})</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.active ? 'default' : 'secondary'}>
                          {product.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => handlePrintLabel(product)}
                            title="Etiqueta"
                          >
                            <Barcode className="h-3.5 w-3.5" />
                          </Button>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(product)}
                              title="Editar"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {product.active ? (
                            canManage ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => openDeleteConfirm(product)}
                                title="Desactivar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null
                          ) : (
                            canManage ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary"
                                onClick={() => handleToggleActive(product)}
                                title="Reactivar"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            ) : null
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) setDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </DialogTitle>
            <DialogDescription>
              {editProduct
                ? 'Modifica los datos del producto'
                : 'Completa los datos para crear un nuevo producto'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1">
            {/* Active toggle (only for edit) */}
            {editProduct && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Switch
                  id="form-active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
                <Label htmlFor="form-active" className="cursor-pointer select-none">
                  Producto {formActive ? 'activo' : 'inactivo'}
                </Label>
              </div>
            )}
            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Imagen del Producto</Label>
              <div className="flex items-center gap-3">
                {formImageUrl ? (
                  <div className="relative">
                    <img
                      src={formImageUrl}
                      alt="Producto"
                      className="h-14 w-14 rounded-lg object-cover border"
                    />
                    <button
                      type="button"
                      onClick={() => setFormImageUrl('')}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error('La imagen no debe superar 2MB')
                        return
                      }
                      setUploadingImage(true)
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('folder', 'productos')
                      try {
                        const res = await fetch('/api/upload', { method: 'POST', body: formData })
                        const data = await res.json()
                        if (data.url) {
                          setFormImageUrl(data.url)
                        } else {
                          toast.error(data.error || 'Error al subir imagen')
                        }
                      } catch {
                        toast.error('Error al subir imagen')
                      } finally {
                        setUploadingImage(false)
                      }
                      e.target.value = ''
                    }}
                    className="hidden"
                    id="product-image-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingImage}
                    onClick={() => document.getElementById('product-image-upload')?.click()}
                  >
                    {uploadingImage ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-3.5 w-3.5" />
                    )}
                    {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF o WebP. Máximo 2MB.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pname">Nombre *</Label>
              <Input
                id="pname"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nombre del producto"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="psku">SKU</Label>
                <Input
                  id="psku"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="EMP-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pcat">Categoría</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pcost">Costo Promedio</Label>
                <Input
                  id="pcost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pprice">Precio de Venta *</Label>
                <Input
                  id="pprice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
            </div>
            {selectedBranchId && (
              <div className="space-y-2">
                <Label htmlFor="pbranchprice">Precio Sucursal ({branchName})</Label>
                <Input
                  id="pbranchprice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formBranchPrice}
                  onChange={(e) => setFormBranchPrice(e.target.value)}
                  placeholder="Vacío = usar precio global"
                />
                <p className="text-xs text-muted-foreground">
                  Si se establece, este precio sobrescribe el precio global para esta sucursal
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pstock">Stock Inicial</Label>
                <Input
                  id="pstock"
                  type="number"
                  step="1"
                  min="0"
                  value={formStock}
                  onChange={(e) => setFormStock(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pminstock">Stock Mínimo</Label>
                <Input
                  id="pminstock"
                  type="number"
                  step="1"
                  min="0"
                  value={formMinStock}
                  onChange={(e) => setFormMinStock(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            {multiEnabled && (
              <div className="space-y-2">
                <Label htmlFor="pcurrency">Moneda</Label>
                <Select value={formCurrency} onValueChange={setFormCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const allowedCodes = ['USD', 'EUR']
                      if (localCurrencyInfo && !allowedCodes.includes(localCurrencyInfo.code)) {
                        allowedCodes.push(localCurrencyInfo.code)
                      }
                      return currencies.filter(c => allowedCodes.includes(c.code)).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} ({c.symbol})
                        </SelectItem>
                      ))
                    })()}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formPrice}
            >
              {saving ? 'Guardando...' : editProduct ? 'Actualizar' : 'Crear Producto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Qué deseas hacer?</AlertDialogTitle>
            <AlertDialogDescription>
              Elige cómo deseas tratar el producto <strong>&quot;{productToDelete?.name}&quot;</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setDeleteDialogOpen(false); setTimeout(() => handleHardDeleteCheck(), 100) }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar Permanentemente
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Solo Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hard Delete Result Dialog */}
      <AlertDialog open={hardDeleteDialogOpen} onOpenChange={setHardDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hardDeleteResult?.canHardDelete ? '¿Confirmar eliminación?' : 'No se puede eliminar'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {hardDeleteResult?.canHardDelete ? (
                  <p>El producto no tiene registros asociados. Se eliminará permanentemente.</p>
                ) : (
                  <div className="space-y-2">
                    <p>El producto tiene los siguientes registros asociados:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {hardDeleteResult?.dependencies.map((dep, i) => (
                        <li key={i}>{dep}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Debes eliminar los registros asociados primero, o usar la opción &quot;Solo Desactivar&quot;.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHardDeleteResult(null)}>Cerrar</AlertDialogCancel>
            {hardDeleteResult?.canHardDelete && (
              <AlertDialogAction
                onClick={handleHardDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Sí, Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <ProductImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={fetchData}
      />

      {/* Barcode Labels Dialog */}
      <Dialog open={labelsOpen} onOpenChange={setLabelsOpen}>
        <DialogContent className="sm:max-w-lg h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generador de Etiquetas</DialogTitle>
            <DialogDescription>
              Selecciona productos y la cantidad de etiquetas a generar
            </DialogDescription>
          </DialogHeader>
          <BarcodeLabelSelector
            products={products.map(p => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              price: getEffectivePrice(p),
              currency: p.currency,
              active: p.active,
            }))}
            onClose={() => setLabelsOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
    </>
  )
}
