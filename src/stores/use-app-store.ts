import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppView =
  | 'pos'
  | 'dashboard'
  | 'products'
  | 'clients'
  | 'suppliers'
  | 'cash'
  | 'expenses'
  | 'settings'

export interface AppSettings {
  businessName: string
  logoUrl: string
  phone: string
  email: string
  rif: string
  address: string
  baseCurrencyId: string
  referenceCurrency: string
  usdRate: number
  eurRate: number
  customRate: number
  exchangeRate: number
  sessionDuration: number
  notificationsEnabled: boolean
  ivaEnabled: boolean
  ivaRate: number
  multiCurrencyEnabled: boolean
  primaryColor: string
  secondaryColor: string
  theme: string
  country: string
  [key: string]: unknown
}

export interface BranchItem {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  active: boolean
  isMain: boolean
}

const VALID_VIEWS: AppView[] = ['pos', 'dashboard', 'products', 'clients', 'suppliers', 'cash', 'expenses', 'settings']

interface AppState {
  activeView: AppView
  settings: AppSettings | null
  selectedBranchId: string | null
  branches: BranchItem[]
  permissionsVersion: number
  pendingClientId: string | null
  setActiveView: (view: AppView) => void
  setSettings: (settings: AppSettings) => void
  setSelectedBranchId: (id: string | null) => void
  setBranches: (branches: BranchItem[]) => void
  bumpPermissions: () => void
  navigateToClient: (clientId: string) => void
  clearPendingClient: () => void
}

const defaultSettings: AppSettings = {
  businessName: 'JO-Administrativo',
  logoUrl: '',
  phone: '',
  email: '',
  rif: '',
  address: '',
  baseCurrencyId: '',
  referenceCurrency: 'USD',
  usdRate: 0,
  eurRate: 0,
  customRate: 0,
  exchangeRate: 36.50,
  sessionDuration: 28800,
  notificationsEnabled: true,
  ivaEnabled: false,
  ivaRate: 16.00,
  multiCurrencyEnabled: false,
  primaryColor: 'blue',
  secondaryColor: 'slate',
  theme: 'light',
  country: 'VE',
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeView: 'pos',
      settings: null,
      selectedBranchId: null,
      branches: [],
      permissionsVersion: 0,
      pendingClientId: null,
      setActiveView: (view) => {
        if (VALID_VIEWS.includes(view)) {
          set({ activeView: view })
        }
      },
      setSettings: (settings) => set({ settings }),
      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
      setBranches: (branches) => set({ branches }),
      bumpPermissions: () => set((s) => ({ permissionsVersion: s.permissionsVersion + 1 })),
      navigateToClient: (clientId) => set({ activeView: 'clients', pendingClientId: clientId }),
      clearPendingClient: () => set({ pendingClientId: null }),
    }),
    {
      name: 'jo-admin-store',
      partialize: (state) => ({
        activeView: state.activeView,
        selectedBranchId: state.selectedBranchId,
      }),
    }
  )
)

// Helper to get a setting with fallback
export function useSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const settings = useAppStore((s) => s.settings)
  return settings?.[key] ?? defaultSettings[key]
}
