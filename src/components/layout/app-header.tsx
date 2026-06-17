'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/use-app-store'
import { usePosStore } from '@/stores/use-pos-store'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Moon, Sun, LogOut, Settings, GitBranch, BookOpen } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/layout/notification-bell'
import { SessionTimer } from '@/components/settings/session-timer'
import { useAuth } from '@/hooks/use-auth'
import { signOut } from 'next-auth/react'
import { startTutorial } from '@/components/tutorial/onboarding-tutorial'
import { api } from '@/lib/api'

const viewLabels: Record<string, string> = {
  pos: 'Punto de Venta',
  dashboard: 'Dashboard',
  products: 'Productos',
  clients: 'Clientes',
  suppliers: 'Proveedores',
  cash: 'Caja',
  expenses: 'Gastos',
  settings: 'Configuración',
}

export function AppHeader() {
  const { activeView, setActiveView, selectedBranchId, setSelectedBranchId, branches, setBranches } = useAppStore()
  const { setTheme, theme } = useTheme()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [cashRegisterInfo, setCashRegisterInfo] = useState<{ name: string | null; branchName: string } | null>(null)

  // Cashier role check
  const isCashier = user?.role === 'cajero'
  // From JWT session, the branchId might be set
  const userBranchId = (user as Record<string, unknown>)?.branchId as string | undefined

  // Fetch branches on mount
  useEffect(() => {
    api.get<Array<{ id: string; name: string; code: string; address: string | null; phone: string | null; active: boolean; isMain: boolean }>>('/api/branches')
      .then((data) => {
        setBranches(data)
        if (!isCashier) {
          // For non-cashiers, auto-select the first active branch if none selected
          const currentBranchId = useAppStore.getState().selectedBranchId
          if (!currentBranchId && data.length > 0) {
            const firstActive = data.find(b => b.active)
            if (firstActive) setSelectedBranchId(firstActive.id)
          }
        } else {
          // For cashiers, force their assigned branch
          if (userBranchId) {
            setSelectedBranchId(userBranchId)
          } else if (data.length > 0) {
            const firstActive = data.find(b => b.active)
            if (firstActive) setSelectedBranchId(firstActive.id)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // For cashiers, fetch their assigned cash register info
  useEffect(() => {
    if (!isCashier || !user?.id) return
    api.get<Array<{ id: string; status: string; name: string | null; branch: { name: string } }>>('/api/cash-register')
      .then((regs) => {
        const openReg = regs?.find(r => r.status === 'abierta' && r.user?.id === user.id)
        // We can't easily filter by userId here, so just get any open register
        // The API already filters by branch
        if (openReg) {
          setCashRegisterInfo({ name: openReg.name, branchName: openReg.branch?.name || '' })
        }
      })
      .catch(() => {})
  }, [isCashier, user?.id])

  // For cashiers, poll for register closure every 60 seconds
  useEffect(() => {
    if (!isCashier || !user?.id) return
    const interval = setInterval(() => {
      api.get<{ wasClosed: boolean; register?: { name: string | null; branchName: string; closingDate: string; actual: number } }>(`/api/cash-register/check?userId=${user.id}`)
        .then((result) => {
          if (result.wasClosed) {
            // Clear the interval and show alert
            clearInterval(interval)
            // Force a page reload or redirect to show the closure modal
            window.location.reload()
          }
        })
        .catch(() => {})
    }, 60000) // 60 seconds
    return () => clearInterval(interval)
  }, [isCashier, user?.id])

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'US'

  const selectedBranch = branches.find(b => b.id === selectedBranchId)

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3 md:h-14 md:gap-2 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1.5 h-4 md:mr-2" />
      <h2 className="text-sm font-semibold md:text-lg truncate">{viewLabels[activeView] || 'Dashboard'}</h2>
      <div className="ml-auto flex items-center gap-1 md:gap-2">
        {/* Branch info for cashiers (read-only badge) */}
        {isCashier && selectedBranch && (
          <Badge variant="outline" className="hidden sm:flex items-center gap-1 text-xs">
            <GitBranch className="h-3 w-3" />
            {selectedBranch.name}
            {cashRegisterInfo?.name && (
              <span className="ml-1 text-muted-foreground">
                · {cashRegisterInfo.name}
              </span>
            )}
          </Badge>
        )}

        {/* Branch Selector for non-cashiers */}
        {!isCashier && !loading && branches.length > 0 && (
          <div>
            <Select
              value={selectedBranchId || ''}
              onValueChange={(v) => {
                setSelectedBranchId(v)
                usePosStore.getState().clearCart()
              }}
            >
              <SelectTrigger className="w-32 h-8 text-xs sm:w-40">
                <GitBranch className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter(b => b.active)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      <span className="truncate">{branch.name}</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Mobile branch info for cashiers */}
        {isCashier && selectedBranch && (
          <Badge variant="outline" className="sm:hidden text-xs">
            <GitBranch className="h-3 w-3 mr-1" />
            {selectedBranch.name}
          </Badge>
        )}

        <SessionTimer />
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:h-9 md:w-9"
          onClick={async () => {
            const newTheme = theme === 'dark' ? 'light' : 'dark'
            setTheme(newTheme)
            // Sync to DB so it persists across devices / after re-login
            api.put('/api/settings', { theme: newTheme }).catch(() => {})
          }}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Cambiar tema</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium">{user?.name || 'Usuario'}</p>
                <p className="text-xs text-primary capitalize">{user?.role || 'cajero'}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {user?.role === 'admin' && (
              <DropdownMenuItem onClick={() => setActiveView('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </DropdownMenuItem>
            )}
            {user?.role === 'admin' && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={startTutorial}>
              <BookOpen className="mr-2 h-4 w-4" />
              Ver Tutorial
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
