'use client'

import { useAppStore, type AppView, useSetting } from '@/stores/use-app-store'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Building2,
  Wallet,
  Receipt,
  Settings,
  Store,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'

const navItems: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'pos', label: 'Punto de Venta', icon: ShoppingCart },
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'products', label: 'Productos', icon: Package },
  { view: 'clients', label: 'Clientes', icon: Users },
  { view: 'suppliers', label: 'Proveedores', icon: Building2 },
  { view: 'cash', label: 'Caja', icon: Wallet },
  { view: 'expenses', label: 'Gastos', icon: Receipt },
]

export function AppSidebar() {
  const { activeView, setActiveView } = useAppStore()
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const userRole = user?.role || 'cajero'
  const businessName = useSetting('businessName')
  const logoUrl = useSetting('logoUrl')
  const { setOpenMobile } = useSidebar()
  // Subscribe to permissionsVersion so sidebar re-renders when custom perms load
  const permissionsVersion = useAppStore((s) => s.permissionsVersion)
  void permissionsVersion

  const visibleItems = navItems.filter(item => canAccessView(userRole, item.view))

  const handleNavClick = (view: AppView) => {
    setActiveView(view)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible={isMobile ? 'offcanvas' : 'icon'}>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={businessName} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <Store className="h-5 w-5" />
            </div>
          )}
          <div className="group-data-[collapsible=icon]:hidden">
            <h1 className="text-lg font-bold tracking-tight text-primary">{businessName}</h1>
            <p className="text-xs text-muted-foreground">ERP / Punto de Venta</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menú Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.view} data-tutorial={'nav-' + item.view}>
                  <SidebarMenuButton
                    isActive={activeView === item.view}
                    onClick={() => handleNavClick(item.view)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {canAccessView(userRole, 'settings') && (
          <SidebarMenu>
            <SidebarMenuItem data-tutorial="nav-settings">
              <SidebarMenuButton
                tooltip="Configuración"
                isActive={activeView === 'settings'}
                onClick={() => handleNavClick('settings')}
              >
                <Settings className="h-4 w-4" />
                <span>Configuración</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <div className="px-4 pb-2 group-data-[collapsible=icon]:hidden">
          <p className="text-[10px] text-muted-foreground">v1.0.0</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
