'use client'

import { api } from '@/lib/api'
import { usePosStore } from '@/stores/use-pos-store'
import { useSetting, useAppStore } from '@/stores/use-app-store'
import { useAuth } from '@/hooks/use-auth'
import { PosCart } from './pos-cart'
import { PosPaymentModal } from './pos-payment-modal'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Search, ShoppingCart, AlertTriangle, ScanBarcode, X, Camera, Lock, Phone, Scale } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import { useCurrency } from '@/hooks/use-currency'
import { BarcodeScannerDialog } from './barcode-scanner-dialog'

interface ProductWithInventory {
  id: string
  name: string
  sku: string | null
  price: number
  costAvg: number
  currencyId: string
  categoryId: string | null
  imageUrl: string
  active: boolean
  currency: { symbol: string }
  category: { name: string; unitType: string } | null
  inventories: { stock: number; branchId: string; price: number; branch?: { id: string; name: string } }[]
}

interface Category {
  id: string
  name: string
  unitType: string
}

export function PosTerminal() {
  const { addItem, getCurrentQty, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, validateBranch } = usePosStore()
  const { items, getTotal, getItemCount } = usePosStore()
  const exchangeRate = useSetting('exchangeRate')
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const { user } = useAuth()
  const [products, setProducts] = useState<ProductWithInventory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showPayment, setShowPayment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [barcodeValue, setBarcodeValue] = useState('')
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  const [checkingCaja, setCheckingCaja] = useState(true)
  const [cajaOpen, setCajaOpen] = useState(true)
  const [barcodeMatches, setBarcodeMatches] = useState<ProductWithInventory[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const [showGerenteDialog, setShowGerenteDialog] = useState(false)
  const [gerenteReason, setGerenteReason] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const isMobile = useIsMobile()
  const { sym: currencySymbol } = useCurrency()

  // Unit quantity selector for weight/volume products
  const [unitProduct, setUnitProduct] = useState<ProductWithInventory | null>(null)
  const [unitAmount, setUnitAmount] = useState('')
  const unitType = unitProduct?.category?.unitType || 'unit'
  const unitLabel = unitType === 'weight' ? 'kg' : unitType === 'volume' ? 'L' : ''
  const unitSmallLabel = unitType === 'weight' ? 'g' : unitType === 'volume' ? 'ml' : ''
  const unitQuickOptions = unitType === 'weight'
    ? [0.1, 0.25, 0.5, 0.75, 1]
    : unitType === 'volume'
    ? [0.1, 0.25, 0.5, 0.75, 1]
    : []
  const isCashier = user?.role === 'cajero'

  // Check if there's an open cash register (blocks cashiers)
  useEffect(() => {
    if (!user?.id) return
    api.get<Array<{ id: string; status: string }>>('/api/cash-register')
      .then((registers) => {
        const hasOpen = registers?.some((r) => r.status === 'abierta') ?? false
        setCajaOpen(hasOpen)
      })
      .catch(() => setCajaOpen(false))
      .finally(() => setCheckingCaja(false))
  }, [user?.id, selectedBranchId])

  // Poll for caja status every 15s when blocked (auto-unblocks when admin opens caja)
  useEffect(() => {
    if (cajaOpen) return
    const interval = setInterval(() => {
      api.get<Array<{ id: string; status: string }>>('/api/cash-register')
        .then((registers) => {
          const hasOpen = registers?.some((r) => r.status === 'abierta') ?? false
          if (hasOpen) setCajaOpen(true)
        })
        .catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [cajaOpen])

  // Validate saved cart against current branch on mount
  useEffect(() => {
    if (selectedBranchId) {
      validateBranch(selectedBranchId)
    }
  }, [selectedBranchId, validateBranch])

  const fetchProducts = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<{ products: ProductWithInventory[] }>('/api/products?active=true&allInventories=true'),
      api.get<Category[]>('/api/categories'),
    ]).then(([res, cats]) => {
      setProducts(res.products)
      setCategories(cats)
      setLoading(false)
    }).catch(() => {
      toast.error('Error al cargar productos')
      setLoading(false)
    })
  }, [])

  // Fetch products only when caja is verified open
  useEffect(() => {
    if (checkingCaja || !cajaOpen) return
    fetchProducts()
  }, [fetchProducts, selectedBranchId, checkingCaja, cajaOpen])

  const filteredProducts = useMemo(() => {
    let result = products
    // Punto 6: Hide products with no stock in current branch
    if (selectedBranchId) {
      result = result.filter((p) => {
        const branchInv = p.inventories.find(i => i.branchId === selectedBranchId)
        return branchInv && branchInv.stock > 0
      })
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))
      )
    }
    if (categoryFilter) {
      result = result.filter((p) => p.category?.name === categoryFilter)
    }
    return result
  }, [searchQuery, categoryFilter, products, selectedBranchId])

  // Get stock and branch-specific price for the selected branch
  const getBranchInfo = (product: ProductWithInventory): { stock: number; branchName: string | null; effectivePrice: number } => {
    if (selectedBranchId) {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      if (branchInv) {
        const effectivePrice = branchInv.price > 0 ? branchInv.price : product.price
        return { stock: branchInv.stock, branchName: null, effectivePrice }
      }
    }
    // Fallback to first inventory
    const firstInv = product.inventories[0]
    return { stock: firstInv?.stock ?? 0, branchName: firstInv?.branch?.name || null, effectivePrice: product.price }
  }

  // Punto 4: SKU autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return []
    return filteredProducts.slice(0, 6)
  }, [searchQuery, filteredProducts])

  // Punto 2: Detect cart items whose stock dropped below requested quantity
  const stockIssues = useMemo(() => {
    return items.filter(item => {
      const product = products.find(p => p.id === item.productId)
      if (!product) return true
      const { stock } = getBranchInfo(product)
      return stock < item.quantity
    })
  }, [items, products, selectedBranchId, getBranchInfo])

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Punto 1+2: Request gerente assistance
  const handleRequestGerente = async () => {
    if (!gerenteReason.trim()) return
    try {
      await api.post('/api/notifications/request-manager', {
        reason: gerenteReason.trim(),
        context: stockIssues.length > 0
          ? `Problemas de stock: ${stockIssues.map(i => i.productName).join(', ')}`
          : 'Solicitud desde Punto de Venta',
      })
      toast.success('Gerente notificado correctamente')
      setShowGerenteDialog(false)
      setGerenteReason('')
    } catch {
      toast.error('Error al notificar al gerente')
    }
  }

  // Punto 2: Poll products every 30s to detect stock changes
  useEffect(() => {
    if (checkingCaja || !cajaOpen) return
    const interval = setInterval(() => {
      api.get<{ products: ProductWithInventory[] }>('/api/products?active=true&allInventories=true')
        .then(res => setProducts(res.products))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [checkingCaja, cajaOpen])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'F2' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    },
    []
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleAddProduct = (product: ProductWithInventory) => {
    const ut = product.category?.unitType
    if (ut === 'weight' || ut === 'volume') {
      setUnitProduct(product)
      setUnitAmount('')
      return
    }

    const { stock, effectivePrice } = getBranchInfo(product)

    if (stock <= 0) {
      const otherBranches = product.inventories.filter(i => i.stock > 0 && i.branch)
      if (otherBranches.length > 0) {
        toast.error(`Sin stock en esta sucursal. Disponible en: ${otherBranches.map(b => b.branch!.name).join(', ')}`)
      } else {
        toast.error('Sin stock disponible')
      }
      return
    }

    const currentQty = getCurrentQty(product.id)
    if (currentQty >= stock) {
      toast.error(`Solo hay ${stock} unidades disponibles. Ya tienes ${currentQty} en el carrito.`)
      return
    }

    const result = addItem({
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: effectivePrice,
      unitCost: product.costAvg,
      currencySymbol: product.currency.symbol,
      maxStock: stock,
    })

    if (!result) {
      toast.error('No se puede agregar más. Stock insuficiente.')
    }
  }

  // Handle barcode scan — find product by SKU and add to cart. Returns true on success.
  const addProductToCart = useCallback((product: ProductWithInventory) => {
    const { stock, effectivePrice } = getBranchInfo(product)
    if (stock <= 0) {
      toast.error(`Sin stock: ${product.name}`)
      return false
    }

    const currentQty = getCurrentQty(product.id)
    if (currentQty >= stock) {
      toast.error(`Stock máximo alcanzado: ${product.name} (${currentQty}/${stock})`)
      return false
    }

    const result = addItem({
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: effectivePrice,
      unitCost: product.costAvg,
      currencySymbol: product.currency.symbol,
      maxStock: stock,
    })

    if (result) {
      toast.success(`${product.name} agregado al carrito`, { description: product.sku || undefined })
      return true
    } else {
      toast.error('No se puede agregar. Stock insuficiente.')
      return false
    }
  }, [getCurrentQty, addItem, getBranchInfo])

  const handleBarcodeScan = useCallback((value: string): boolean => {
    const trimmed = value.trim()
    if (!trimmed) return false

    // Find ALL products matching the barcode/SKU
    const matches = products.filter(
      (p) => p.sku && p.sku.toLowerCase() === trimmed.toLowerCase()
    )

    if (matches.length === 0) {
      // Try partial match
      const partialMatches = products.filter(
        (p) => p.sku && p.sku.toLowerCase().includes(trimmed.toLowerCase())
      )
      if (partialMatches.length === 0) {
        toast.error(`Producto no encontrado: ${trimmed}`)
        return false
      }
      if (partialMatches.length === 1) {
        return addProductToCart(partialMatches[0])
      }
      // Multiple partial matches — show selection
      setBarcodeMatches(partialMatches)
      return false
    }

    if (matches.length === 1) {
      return addProductToCart(matches[0])
    }

    // Multiple exact matches — show selection dialog
    setBarcodeMatches(matches)
    return false
  }, [products, addProductToCart])

  const handleBarcodeKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBarcodeScan(barcodeValue)
      setBarcodeValue('')
      // Keep focus on barcode input for rapid consecutive scans
      setTimeout(() => barcodeRef.current?.focus(), 10)
    }
  }, [barcodeValue, handleBarcodeScan])

  const toggleBarcodeInput = useCallback(() => {
    setShowBarcodeInput((prev) => !prev)
    setTimeout(() => {
      if (!showBarcodeInput) {
        barcodeRef.current?.focus()
      } else {
        setBarcodeValue('')
      }
    }, 50)
  }, [showBarcodeInput])

  // After a successful sale, refresh products to show updated stock
  const handlePaymentSuccess = () => {
    setShowPayment(false)
    fetchProducts()
  }

  const itemCount = getItemCount()
  const total = getTotal()

  const cartContent = (
    <PosCart onPayment={() => {
      setCartOpen(false)
      setShowPayment(true)
    }} />
  )

  // Show loading while checking caja status
  if (checkingCaja) {
    return (
      <div className="flex h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verificando estado de caja...</p>
        </div>
      </div>
    )
  }

  // Block POS when no cash register is open
  if (!cajaOpen) {
    return (
      <div className="flex h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center space-y-4 max-w-sm mx-auto p-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/30">
            <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Caja Cerrada</h2>
            <p className="text-sm text-muted-foreground mt-1">
              No hay ninguna caja abierta. Debe abrir una caja antes de poder realizar ventas.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isCashier
              ? 'Contacta a un administrador o gerente para que abra una caja en la seccion de Caja.'
              : 'Ve a la seccion de Caja y abre un registro para comenzar a vender.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] gap-3 md:gap-4">
      {/* Product Grid */}
      <div className="flex flex-1 flex-col gap-3 min-h-0">
        {/* Search + Barcode + Mobile Cart Toggle */}
        <div className="flex gap-2">
          {showBarcodeInput ? (
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                ref={barcodeRef}
                placeholder="Escanear código de barras..."
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                className="pl-10 pr-9 border-primary/50 bg-primary/5 ring-primary/20"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { setShowBarcodeInput(false); setBarcodeValue('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title="Cerrar escáner"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 border-primary/30 hover:bg-primary/10 hover:text-primary"
              onClick={toggleBarcodeInput}
              title="Escanear con lector externo (SKU)"
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
          )}
          {/* Camera barcode scanner button */}
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
            onClick={() => setShowCameraScanner(true)}
            title="Escanear con camara"
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-orange-700 dark:hover:bg-orange-950/30 dark:hover:text-orange-400"
            onClick={() => setShowGerenteDialog(true)}
            title="Solicitar Gerente"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <div className="relative flex-1" ref={suggestionsRef}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Buscar producto o SKU (F2)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suggestions.length === 1) {
                  handleAddProduct(suggestions[0])
                  setSearchQuery('')
                  setShowSuggestions(false)
 }
              }}
              className="pl-10"
              data-tutorial="pos-search"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-64 overflow-auto">
                {suggestions.map((product) => {
                  const { stock, effectivePrice } = getBranchInfo(product)
                  return (
                    <button
                      key={product.id}
                      className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/50 text-left transition-colors border-b border-border/50 last:border-0"
                      onClick={() => {
                        handleAddProduct(product)
                        setSearchQuery('')
                        setShowSuggestions(false)
                        searchRef.current?.focus()
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.sku && <span className="font-mono">{product.sku}</span>}
                          {product.sku && ' · '}Stock: {stock}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary shrink-0">
                        {currencySymbol}{effectivePrice.toFixed(2)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {isMobile && (
            <Drawer open={cartOpen} onOpenChange={setCartOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" size="icon" className="relative h-10 w-10 shrink-0">
                  <ShoppingCart className="h-4 w-4" />
                  {itemCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                      {itemCount}
                    </span>
                  )}
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Carrito</DrawerTitle>
                  <DrawerDescription>{itemCount} productos · Total: {currencySymbol}{total.toFixed(2)}</DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-4 overflow-auto max-h-[60vh]">
                  {cartContent}
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={categoryFilter === '' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-primary/5 hover:text-primary"
            onClick={() => setCategoryFilter('')}
          >
            Todos
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat.id}
              variant={categoryFilter === cat.name ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/5 hover:text-primary"
              onClick={() => setCategoryFilter(categoryFilter === cat.name ? '' : cat.name)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>

        {/* Stock issues warning */}
        {stockIssues.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 flex-1 truncate">
              Stock cambiado: {stockIssues.map(i => i.productName).join(', ')}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs border-amber-400 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-950/50"
              onClick={() => setShowGerenteDialog(true)}
            >
              <Phone className="h-3 w-3 mr-1" /> Avisar Gerente
            </Button>
          </div>
        )}

        {/* Grid */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div data-tutorial="pos-products" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
              {filteredProducts.map((product) => {
                const { stock, effectivePrice } = getBranchInfo(product)
                const outOfStock = stock <= 0
                const currentQty = getCurrentQty(product.id)
                const atMaxStock = currentQty >= stock
                return (
                <button
                  key={product.id}
                  onClick={() => handleAddProduct(product)}
                  disabled={outOfStock}
                  className={`group relative flex flex-col items-start gap-0.5 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-md hover:bg-primary/5 dark:hover:bg-primary/10 ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {outOfStock ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    ) : atMaxStock ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-xs">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-xs">+</span>
                    )}
                  </div>
                  {product.imageUrl ? (
                    <div className="flex items-center gap-2 w-full">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm font-medium leading-tight line-clamp-1 block ${outOfStock ? 'line-through' : ''}`}>
                          {product.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight block">
                          {product.sku || 'Sin SKU'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className={`text-sm font-medium leading-tight line-clamp-1 ${outOfStock ? 'line-through' : ''}`}>
                        {product.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {product.sku || 'Sin SKU'}
                      </span>
                    </>
                  )}
                  <div className="mt-auto flex items-center justify-between w-full">
                    <div>
                      <span className="text-sm font-bold text-primary dark:text-primary">
                        {currencySymbol}{effectivePrice.toFixed(2)}
                      </span>
                      {currentQty > 0 && (
                        <p className="text-[10px] text-primary font-medium">En carrito: {currentQty}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {outOfStock ? (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Sin stock</Badge>
                      ) : atMaxStock ? (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-600 border-amber-300">Max alcanzado</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Stock: {stock}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Desktop Cart - hidden on mobile */}
      {!isMobile && cartContent}

      {/* Payment Modal */}
      {showPayment && <PosPaymentModal onClose={handlePaymentSuccess} />}

      {/* Camera Barcode Scanner */}
      <BarcodeScannerDialog
        open={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={handleBarcodeScan}
      />

      {/* Request Gerente Dialog */}
      <Dialog open={showGerenteDialog} onOpenChange={setShowGerenteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-orange-600" />
              Solicitar Gerente
            </DialogTitle>
            <DialogDescription>Envia una notificacion al gerente o administrador para que acuda al punto de venta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Motivo de la solicitud..."
              value={gerenteReason}
              onChange={(e) => setGerenteReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRequestGerente() }}
              autoFocus
            />
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleRequestGerente}
              disabled={!gerenteReason.trim()}
            >
              <Phone className="mr-2 h-4 w-4" /> Notificar Gerente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode Match Selection Dialog */}
      {barcodeMatches.length > 0 && (
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-popover rounded-xl border shadow-2xl max-w-sm w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Selecciona un producto</h3>
              <button
                onClick={() => setBarcodeMatches([])}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-auto">
              {barcodeMatches.map((product) => {
                const { stock, effectivePrice } = getBranchInfo(product)
                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      addProductToCart(product)
                      setBarcodeMatches([])
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 border border-transparent hover:border-primary/20 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.sku || 'Sin SKU'} · Stock: {stock}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {product.currency.symbol}{effectivePrice.toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Unit Quantity Selector for Weight/Volume products */}
      <Dialog open={!!unitProduct} onOpenChange={(open) => { if (!open) setUnitProduct(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              {unitProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Selecciona la cantidad en {unitType === 'weight' ? 'gramos/kilogramos' : 'mililitros/litros'}
            </DialogDescription>
          </DialogHeader>
          {unitProduct && (() => {
            const { effectivePrice } = getBranchInfo(unitProduct)
            const parsed = parseFloat(unitAmount) || 0
            const calcPrice = parsed > 0 ? Math.round(parsed * effectivePrice * 100) / 100 : 0
            const displayQuick = unitQuickOptions.map(v => ({
              value: v,
              label: v < 1 ? `${v * 1000}${unitSmallLabel}` : `${v}${unitLabel}`,
            }))

            return (
              <div className="space-y-4">
                {/* Quick buttons */}
                <div className="grid grid-cols-5 gap-2">
                  {displayQuick.map(opt => (
                    <Button
                      key={opt.value}
                      variant={unitAmount === String(opt.value) ? 'default' : 'outline'}
                      className="h-9 text-xs"
                      onClick={() => setUnitAmount(String(opt.value))}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    placeholder={unitType === 'weight' ? 'Ej: 0.250 para 250g' : 'Ej: 0.250 para 250ml'}
                    value={unitAmount}
                    onChange={(e) => setUnitAmount(e.target.value)}
                    className="text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        document.getElementById('unit-confirm-btn')?.click()
                      }
                    }}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {unitLabel}
                  </span>
                </div>

                {parsed > 0 && (
                  <div className="rounded-md bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="text-lg font-bold">{currencySymbol}{calcPrice.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {effectivePrice.toFixed(2)} {currencySymbol}/{unitLabel} x {parsed} {unitLabel}
                    </p>
                  </div>
                )}

                <Button
                  id="unit-confirm-btn"
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                  disabled={!unitAmount || parseFloat(unitAmount) <= 0}
                  onClick={() => {
                    const qty = parseFloat(unitAmount)
                    if (!qty || qty <= 0 || !unitProduct) return

                    const { stock, effectivePrice } = getBranchInfo(unitProduct)
                    const currentQty = getCurrentQty(unitProduct.id)
                    if (currentQty + qty > stock) {
                      toast.error(`Stock insuficiente. Disponible: ${stock} ${unitLabel}`)
                      return
                    }

                    addItem({
                      productId: unitProduct.id,
                      productName: unitProduct.name,
                      quantity: qty,
                      unitPrice: effectivePrice,
                      unitCost: unitProduct.costAvg,
                      currencySymbol: unitProduct.currency.symbol,
                      maxStock: stock,
                      displayUnit: unitLabel,
                    })

                    setUnitProduct(null)
                    setUnitAmount('')
                  }}
                >
                  Agregar al carrito
                </Button>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
