import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  unitCost: number
  currencySymbol: string
  currencyCode?: string
  currencyId?: string
  lineTotal: number
  maxStock: number
  displayUnit?: string // e.g. 'kg', 'L', '' for unit
}

export interface PausedSale {
  id: string
  items: CartItem[]
  clientId: string | null
  branchId: string | null
  total: number
  itemCount: number
  clientName: string
  pausedAt: string
}

interface PosState {
  items: CartItem[]
  clientId: string | null
  branchId: string | null
  searchQuery: string
  categoryFilter: string
  pausedSales: PausedSale[]
  setSearchQuery: (query: string) => void
  setCategoryFilter: (cat: string) => void
  addItem: (item: Omit<CartItem, 'lineTotal'>) => boolean | void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setClientId: (id: string | null) => void
  getTotal: () => number
  getItemCount: () => number
  getCurrentQty: (productId: string) => number
  validateBranch: (currentBranchId: string | null) => void
  pauseSale: (clientName?: string) => string
  resumeSale: (saleId: string) => boolean
  deletePausedSale: (saleId: string) => void
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      items: [],
      clientId: null,
      branchId: null,
      searchQuery: '',
      categoryFilter: '',
      pausedSales: [],

      setSearchQuery: (query) => set({ searchQuery: query }),
      setCategoryFilter: (cat) => set({ categoryFilter: cat }),

      addItem: (item) => {
        const { items } = get()
        const existing = items.find((i) => i.productId === item.productId)
        if (existing) {
          const newQty = existing.quantity + item.quantity
          if (newQty > item.maxStock) {
            return false
          }
          set({
            items: items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: newQty, lineTotal: newQty * i.unitPrice }
                : i
            ),
          })
        } else {
          if (item.quantity > item.maxStock) {
            return false
          }
          set({ items: [...items, { ...item, lineTotal: item.quantity * item.unitPrice }] })
        }
        return true
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) })
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        const item = get().items.find((i) => i.productId === productId)
        if (item && quantity > item.maxStock) {
          return
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId
              ? { ...i, quantity, lineTotal: quantity * i.unitPrice }
              : i
          ),
        })
      },

      clearCart: () => set({ items: [], clientId: null }),
      setClientId: (id) => set({ clientId: id }),

      getTotal: () => get().items.reduce((s, i) => s + i.lineTotal, 0),
      getItemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
      getCurrentQty: (productId) => {
        const item = get().items.find((i) => i.productId === productId)
        return item?.quantity || 0
      },

      // Clear cart if saved branchId doesn't match current branch
      validateBranch: (currentBranchId) => {
        const { branchId, items } = get()
        if (items.length > 0 && branchId && currentBranchId && branchId !== currentBranchId) {
          set({ items: [], clientId: null, branchId: currentBranchId })
        } else if (currentBranchId) {
          set({ branchId: currentBranchId })
        }
      },

      // Pause current sale — save cart to pausedSales and clear
      pauseSale: (clientName = 'Cliente general') => {
        const { items, clientId, branchId, pausedSales } = get()
        if (items.length === 0) return ''

        const saleId = `paused-${Date.now()}`
        const total = items.reduce((s, i) => s + i.lineTotal, 0)
        const itemCount = items.reduce((s, i) => s + i.quantity, 0)

        const pausedSale: PausedSale = {
          id: saleId,
          items: [...items],
          clientId,
          branchId,
          total,
          itemCount,
          clientName,
          pausedAt: new Date().toISOString(),
        }

        set({
          pausedSales: [pausedSale, ...pausedSales],
          items: [],
          clientId: null,
        })

        return saleId
      },

      // Resume a paused sale — restore items and remove from pausedSales
      resumeSale: (saleId) => {
        const { pausedSales, branchId, items, clientId } = get()
        const sale = pausedSales.find((s) => s.id === saleId)
        if (!sale) return false

        // If branches don't match, don't resume
        if (sale.branchId && branchId && sale.branchId !== branchId) {
          return false
        }

        let updatedPausedSales = pausedSales.filter((s) => s.id !== saleId)

        // If current cart has items, auto-pause the active sale first
        if (items.length > 0) {
          const total = items.reduce((s, i) => s + i.lineTotal, 0)
          const itemCount = items.reduce((s, i) => s + i.quantity, 0)
          const autoPaused: PausedSale = {
            id: `paused-${Date.now()}`,
            items: [...items],
            clientId,
            branchId,
            total,
            itemCount,
            clientName: 'Cliente general',
            pausedAt: new Date().toISOString(),
          }
          updatedPausedSales = [autoPaused, ...updatedPausedSales]
        }

        set({
          items: sale.items,
          clientId: sale.clientId,
          pausedSales: updatedPausedSales,
        })

        return true
      },

      // Delete a paused sale
      deletePausedSale: (saleId) => {
        set({ pausedSales: get().pausedSales.filter((s) => s.id !== saleId) })
      },
    }),
    {
      name: 'jo-admin-cart',
      partialize: (state) => ({
        items: state.items || [],
        clientId: state.clientId,
        branchId: state.branchId,
        pausedSales: state.pausedSales || [],
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<PosState>),
        // Ensure pausedSales is always an array even if missing from old storage
        pausedSales: Array.isArray((persisted as Partial<PosState>)?.pausedSales)
          ? (persisted as Partial<PosState>).pausedSales!
          : [],
      }),
    }
  )
)
