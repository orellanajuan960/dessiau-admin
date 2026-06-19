'use client'

import { useEffect } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { useAppStore } from '@/stores/use-app-store'
import { PosTerminal } from '@/components/pos/pos-terminal'
import { FinancialDashboard } from '@/components/dashboard/financial-dashboard'
import { ProductsTable } from '@/components/products/products-table'
import { ClientsTable } from '@/components/clients/clients-table'
import { SuppliersView } from '@/components/clients/suppliers-view'
import { CashRegisterView } from '@/components/cash/cash-register-view'
import { ExpensesTable } from '@/components/expenses/expenses-table'
import { SettingsView } from '@/components/settings/settings-view'
import { OnboardingTutorial } from '@/components/tutorial/onboarding-tutorial'
import { SettingsInitializer } from '@/components/settings/settings-initializer'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'
import type { AppView } from '@/stores/use-app-store'

const viewComponents: Record<AppView, React.ComponentType> = {
  pos: PosTerminal,
  dashboard: FinancialDashboard,
  products: ProductsTable,
  clients: ClientsTable,
  suppliers: SuppliersView,
  cash: CashRegisterView,
  expenses: ExpensesTable,
  settings: SettingsView,
}

export function AppShell() {
  const { activeView, setActiveView } = useAppStore()
  const { user, isLoading } = useAuth()
  // Subscribe to permissions changes so view resolution stays in sync
  const permissionsVersion = useAppStore((s) => s.permissionsVersion)
  void permissionsVersion

  // When user session loads or changes, check if current view is permitted
  useEffect(() => {
    if (!user || isLoading) return
    const role = user.role || 'cajero'
    if (!canAccessView(role, activeView)) {
      // Redirect to the first allowed view
      const fallback: AppView = role === 'cajero' ? 'pos'
        : role === 'vendedor' ? 'pos'
        : role === 'gerente' ? 'pos'
        : 'pos'
      setActiveView(fallback)
    }
  }, [user, activeView, isLoading, setActiveView, permissionsVersion])

  // Clear activeView and cart from localStorage on logout
  useEffect(() => {
    if (!isLoading && !user) {
      localStorage.removeItem('jo-admin-store')
      localStorage.removeItem('jo-admin-cart')
    }
  }, [isLoading, user])

  // Determine the resolved view BEFORE rendering any component.
  // This prevents forbidden views from briefly flashing.
  let resolvedView = activeView
  if (!isLoading && user) {
    const role = user.role || 'cajero'
    if (!canAccessView(role, activeView)) {
      resolvedView = 'pos'
    }
  }

  const ActiveComponent = viewComponents[resolvedView] || FinancialDashboard

  // Don't render the app shell until we know the user's role
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main className="flex-1 overflow-auto p-3 md:p-4 lg:p-6">
            <ActiveComponent />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <OnboardingTutorial />
      <SettingsInitializer />
    </>
  )
}
