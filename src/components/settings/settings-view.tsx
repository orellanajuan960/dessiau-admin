'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAppStore, type AppSettings } from '@/stores/use-app-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import {
  Building2,
  DollarSign,
  GitBranch,
  Users,
  Monitor,
  Palette,
  Save,
  Plus,
  Edit,
  Trash2,
  Percent,
  Loader2,
  RefreshCw,
  Shield,
  Upload,
  X,
  Tag,
  ClipboardList,
  BookOpen,
  Globe,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { ALL_ROLES, getRoleLabel } from '@/lib/permissions'
import { getCurrencyForCountry } from '@/lib/country-currency'
import { getCurrencySymbol } from '@/lib/currency'
import { ColorPicker, applyBothColors } from './color-picker'
import { RolePermissionsEditor } from './role-permissions-editor'
import { AuditLogView } from '@/components/audit/audit-log-view'
import { TutorialTextsEditor } from './tutorial-texts-editor'
import { PaymentMethodsTab } from './payment-methods-tab'
import { getPermissions, canAccessView } from '@/lib/permissions'

interface Branch {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  active: boolean
  isMain: boolean
  createdAt: string
  updatedAt: string
  _count: {
    inventories: number
    sales: number
    purchases: number
    cashRegisters: number
    expenses: number
  }
}

interface Settings {
  id: string
  key: string
  businessName: string
  logoUrl: string
  address: string
  phone: string
  rif: string
  email: string
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
  primaryColor: string
  secondaryColor: string
  theme: string
  country: string
  tutorialTexts: Record<string, unknown>
}

interface UserItem {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

interface CategoryItem {
  id: string
  name: string
  createdAt: string
  _count: { products: number }
}

interface CurrencyItem {
  id: string
  code: string
  name: string
  symbol: string
  isBase: boolean
}

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const setAppSettings = useAppStore((s) => s.setSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchingRate, setFetchingRate] = useState(false)
  const [activeTab, setActiveTab] = useState('empresa')
  const { user } = useAuth()

  // Listen for tutorial tab switching via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveTab((e as CustomEvent<string>).detail)
    }
    window.addEventListener('tutorial-switch-tab', handler)
    return () => window.removeEventListener('tutorial-switch-tab', handler)
  }, [])

  // Users state
  const [users, setUsers] = useState<UserItem[]>([])
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([])
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [userSaving, setUserSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userRole, setUserRole] = useState('cajero')
  const [userBranchId, setUserBranchId] = useState('')
  const [userActive, setUserActive] = useState(true)

  // Categories state
  const [categories, setCategories] = useState<Array<{ id: string; name: string; unitType: string; _count: { products: number } }>>([])
  const [showCatDialog, setShowCatDialog] = useState(false)
  const [editingCat, setEditingCat] = useState<{ id: string; name: string; unitType: string } | null>(null)
  const [catName, setCatName] = useState('')
  const [catUnitType, setCatUnitType] = useState('unit')
  const [catSaving, setCatSaving] = useState(false)

  // Delete confirmation dialogs
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserItem | null>(null)
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ id: string; name: string; _count: { products: number } } | null>(null)
  const [deletingItem, setDeletingItem] = useState(false)

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserTarget) return
    setDeletingItem(true)
    try {
      await api.del(`/api/users?id=${deleteUserTarget.id}`)
      toast.success('Usuario eliminado')
      fetchSettings()
    } catch {
      toast.error('Error al eliminar usuario')
    } finally {
      setDeletingItem(false)
      setDeleteUserTarget(null)
    }
  }

  const handleConfirmDeleteCat = async () => {
    if (!deleteCatTarget) return
    if (deleteCatTarget._count.products > 0) {
      toast.error(`No se puede eliminar. Tiene ${deleteCatTarget._count.products} producto(s) asociado(s)`)
      setDeleteCatTarget(null)
      return
    }
    setDeletingItem(true)
    try {
      await api.del(`/api/categories?id=${deleteCatTarget.id}`)
      toast.success('Categoría eliminada')
      setCategories(prev => prev.filter(c => c.id !== deleteCatTarget.id))
    } catch {
      toast.error('Error al eliminar categoría')
    } finally {
      setDeletingItem(false)
      setDeleteCatTarget(null)
    }
  }

  // Branches state
  const [branches, setBranches] = useState<Branch[]>([])
  const [showBranchDialog, setShowBranchDialog] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branchSaving, setBranchSaving] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [branchPhone, setBranchPhone] = useState('')

  const fetchSettings = useCallback(async () => {
    // Fetch settings independently — this is the critical load
    try {
      const s = await api.get<Settings>('/api/settings')
      setSettings(s)
      // Sync to app store so POS/dashboard picks up changes immediately
      setAppSettings(s as AppSettings)
    } catch {
      toast.error('Error al cargar configuración')
    } finally {
      setLoading(false)
    }

    // Fetch users and currencies in background (non-blocking)
    api.get<UserItem[]>('/api/users').then(setUsers).catch(() => {})
    api.get<CurrencyItem[]>('/api/currencies').then(setCurrencies).catch(() => {})
    api.get<Branch[]>('/api/branches').then(setBranches).catch(() => {})
    api.get<CategoryItem[]>('/api/categories').then(setCategories).catch(() => {})
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const saveSettings = async (updates: Partial<Settings>) => {
    setSaving(true)
    try {
      const updated = await api.put<Settings>('/api/settings', updates)
      setSettings(updated)
      // Sync to app store so POS/dashboard picks up changes immediately
      setAppSettings(updated as AppSettings)
      // Re-apply colors after save to ensure they persist
      applyBothColors(updated.primaryColor || 'blue', updated.secondaryColor || 'slate')
      // Update favicon if logo was changed
      if (updated.logoUrl) {
        const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
        if (link) {
          link.href = updated.logoUrl
        } else {
          const newLink = document.createElement('link')
          newLink.rel = 'icon'
          newLink.href = updated.logoUrl
          document.head.appendChild(newLink)
        }
      }
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  // ── User CRUD ──────────────────────────────────────────────

  const openCreateUser = () => {
    setEditingUser(null)
    setUserName('')
    setUserEmail('')
    setUserPassword('')
    setUserRole('cajero')
    setUserBranchId('')
    setUserActive(true)
    setShowUserDialog(true)
  }

  const openEditUser = (user: UserItem) => {
    setEditingUser(user)
    setUserName(user.name)
    setUserEmail(user.email)
    setUserPassword('')
    setUserRole(user.role)
    setUserBranchId((user as Record<string, unknown>).branchId as string || '')
    setUserActive(user.active)
    setShowUserDialog(true)
  }

  const saveUser = async () => {
    if (!userName || !userEmail) {
      toast.error('Nombre y email son obligatorios')
      return
    }
    setUserSaving(true)
    try {
      if (editingUser) {
        await api.put('/api/users', {
          id: editingUser.id,
          name: userName,
          email: userEmail,
          role: userRole,
          active: userActive,
          password: userPassword || undefined,
          branchId: userBranchId || undefined,
        })
        toast.success('Usuario actualizado')
      } else {
        await api.post('/api/users', {
          name: userName,
          email: userEmail,
          password: userPassword || 'changeme',
          role: userRole,
          branchId: userBranchId || undefined,
        })
        toast.success('Usuario creado')
      }
      setShowUserDialog(false)
      fetchSettings()
    } catch {
      toast.error('Error al guardar usuario')
    } finally {
      setUserSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="h-96 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  const userPerms = user ? getPermissions(user.role) : null
  const canViewAudit = userPerms?.canViewAudit === true
  const canManageUsers = userPerms?.canManageUsers === true
  const isAdmin = user?.role === 'admin'

  if (!settings) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Administra la configuración general del sistema
        </p>
      </div>

      <Tabs data-tutorial="settings-tabs" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          {userPerms?.canAccessTabEmpresa && (
            <TabsTrigger data-tutorial="settings-tab-empresa" value="empresa" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5 hidden sm:block" />
              <span>Empresa</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabMoneda && (
            <TabsTrigger data-tutorial="settings-tab-moneda" value="moneda" className="gap-1.5">
              <DollarSign className="h-3.5 w-3.5 hidden sm:block" />
              <span>Moneda</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabMoneda && (
            <TabsTrigger data-tutorial="settings-tab-metodos-pago" value="metodos_pago" className="gap-1.5">
              <Wallet className="h-3.5 w-3.5 hidden sm:block" />
              <span>Métodos de Pago</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabIva && (
            <TabsTrigger data-tutorial="settings-tab-iva" value="iva" className="gap-1.5">
              <Percent className="h-3.5 w-3.5 hidden sm:block" />
              <span>I.V.A.</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabSucursales && (
            <TabsTrigger data-tutorial="settings-tab-sucursales" value="sucursales" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5 hidden sm:block" />
              <span>Sucursales</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabUsuarios && (
            <TabsTrigger data-tutorial="settings-tab-usuarios" value="usuarios" className="gap-1.5">
              <Users className="h-3.5 w-3.5 hidden sm:block" />
              <span>Usuarios</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabRoles && (
            <TabsTrigger data-tutorial="settings-tab-roles" value="roles" className="gap-1.5">
              <Shield className="h-3.5 w-3.5 hidden sm:block" />
              <span>Roles</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabSistema && (
            <TabsTrigger data-tutorial="settings-tab-sistema" value="sistema" className="gap-1.5">
              <Monitor className="h-3.5 w-3.5 hidden sm:block" />
              <span>Sistema</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabCategorias && (
            <TabsTrigger data-tutorial="settings-tab-categorias" value="categorias" className="gap-1.5">
              <Tag className="h-3.5 w-3.5 hidden sm:block" />
              <span>Categorías</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabApariencia && (
            <TabsTrigger data-tutorial="settings-tab-apariencia" value="apariencia" className="gap-1.5">
              <Palette className="h-3.5 w-3.5 hidden sm:block" />
              <span>Apariencia</span>
            </TabsTrigger>
          )}
          {canViewAudit && (
            <TabsTrigger data-tutorial="settings-tab-audit" value="audit" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 hidden sm:block" />
              <span>Auditoría</span>
            </TabsTrigger>
          )}
          {userPerms?.canAccessTabTutorial && (
            <TabsTrigger data-tutorial="settings-tab-tutorial" value="tutorial" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5 hidden sm:block" />
              <span>Tutorial</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Empresa Tab ────────────────────────────────── */}
        <TabsContent value="empresa">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la Empresa</CardTitle>
              <CardDescription>Información general de tu negocio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre del Negocio</Label>
                  <Input
                    value={settings.businessName}
                    onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RIF</Label>
                  <Input
                    value={settings.rif}
                    onChange={(e) => setSettings({ ...settings, rif: e.target.value })}
                    placeholder="J-00000000-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    placeholder="+58 212-0000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>País / Región</Label>
                <Select
                  value={settings.country || 'VE'}
                  onValueChange={(v) => setSettings({ ...settings, country: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VE">Venezuela</SelectItem>
                    <SelectItem value="CO">Colombia</SelectItem>
                    <SelectItem value="MX">México</SelectItem>
                    <SelectItem value="AR">Argentina</SelectItem>
                    <SelectItem value="PE">Perú</SelectItem>
                    <SelectItem value="CL">Chile</SelectItem>
                    <SelectItem value="EC">Ecuador</SelectItem>
                    <SelectItem value="PA">Panamá</SelectItem>
                    <SelectItem value="DO">República Dominicana</SelectItem>
                    <SelectItem value="ES">España</SelectItem>
                    <SelectItem value="US">Estados Unidos</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define el país donde está desplegado el sistema. Ajusta los textos, moneda y terminología según la región.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Logo del Negocio</Label>
                <div className="flex items-center gap-4">
                  {settings.logoUrl ? (
                    <div className="relative">
                      <img
                        src={settings.logoUrl}
                        alt="Logo"
                        className="h-16 w-16 rounded-lg object-cover border"
                      />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoUrl: '' })}
                        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30">
                      <Upload className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (file.size > 2 * 1024 * 1024) {
                          toast.error('El archivo no debe superar 2MB')
                          return
                        }
                        const formData = new FormData()
                        formData.append('file', file)
                        formData.append('folder', 'logos')
                        try {
                          const res = await fetch('/api/upload', { method: 'POST', body: formData })
                          const data = await res.json()
                          if (data.url) {
                            setSettings({ ...settings, logoUrl: data.url })
                          } else {
                            toast.error(data.error || 'Error al subir imagen')
                          }
                        } catch {
                          toast.error('Error al subir imagen')
                        }
                        e.target.value = ''
                      }}
                      className="hidden"
                      id="logo-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('logo-upload')?.click()}
                    >
                      <Upload className="mr-2 h-3.5 w-3.5" />
                      Subir Imagen
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, WebP o SVG. Máximo 2MB.</p>
                  </div>
                </div>
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  businessName: settings.businessName,
                  rif: settings.rif,
                  email: settings.email,
                  phone: settings.phone,
                  address: settings.address,
                  logoUrl: settings.logoUrl,
                  country: settings.country || 'VE',
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Moneda Tab ─────────────────────────────────── */}
        <TabsContent value="moneda">
          <div className="space-y-4">
            {/* Multi-Currency Toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modo de Moneda</CardTitle>
                <CardDescription>Activa el modo multi-moneda si trabajas con divisas y necesitas conversión automática a tu moneda local.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Modo Multi-Moneda</Label>
                    <p className="text-xs text-muted-foreground">
                      {settings.multiCurrencyEnabled
                        ? 'Activado: precios en divisa con conversión automática a moneda local'
                        : 'Desactivado: todo funciona en la moneda local de tu país'}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={() => {
                      const newValue = !settings.multiCurrencyEnabled
                      const updated = { ...settings, multiCurrencyEnabled: newValue }
                      setSettings(updated)
                      saveSettings({ multiCurrencyEnabled: newValue } as any).catch(() => {})
                    }}
                  >
                    <span className="text-xs text-muted-foreground">
                      {settings.multiCurrencyEnabled ? 'ON' : 'OFF'}
                    </span>
                    <div className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${settings.multiCurrencyEnabled ? 'bg-primary' : 'bg-muted'}`}>
                      <div className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.multiCurrencyEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Multi-currency content (only when enabled) */}
            {settings.multiCurrencyEnabled && (
            <>

            {/* Tasas del Día (BCV) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Tasas del Día</CardTitle>
                    <CardDescription>Tasas de cambio de divisas</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setFetchingRate(true)
                      try {
                        let usdRate: number | undefined
                        let eurRate: number | undefined
                        let usedSource = ''

                        // 1st: Try client-side BCV scraping (from user's browser in Venezuela)
                        try {
                          const { scrapeBcvFromClient } = await import('@/lib/scrape-bcv-client')
                          const clientRates = await scrapeBcvFromClient()
                          if (clientRates) {
                            usdRate = clientRates.usd
                            eurRate = clientRates.eur
                            usedSource = clientRates.source
                          }
                        } catch {
                          console.warn('[Rates] Client-side BCV scraping failed, falling back to server')
                        }

                        // 2nd: If client scraping failed, send rates to server for persistence
                        if (usdRate) {
                          // Save client-fetched rates via POST
                          await api.post('/api/exchange-rates', { usd: usdRate, eur: eurRate, source: usedSource })
                        } else {
                          // Fallback: let server fetch (uses dolarapi + other sources)
                          const data = await api.get<{ rates: Array<{ currency: string; rate: number; source: string }> }>('/api/exchange-rates')
                          if (data?.rates && data.rates.length > 0) {
                            const foundUsd = data.rates.find(r => r.currency === 'USD')
                            const foundEur = data.rates.find(r => r.currency === 'EUR')
                            if (foundUsd) { usdRate = foundUsd.rate; usedSource = foundUsd.source }
                            if (foundEur) eurRate = foundEur.rate
                          }
                        }

                        if (usdRate) {
                          const updates: Record<string, number> = { usdRate }
                          if (eurRate) updates.eurRate = eurRate
                          if (!settings.customRate) {
                            const refCurrency = settings.referenceCurrency || 'USD'
                            if (refCurrency === 'EUR' && eurRate) {
                              updates.exchangeRate = eurRate
                            } else {
                              updates.exchangeRate = usdRate
                            }
                          }
                          const updatedSettings = { ...settings, ...updates }
                          setSettings(updatedSettings)
                          setAppSettings(updatedSettings as AppSettings)
                          // Persist to database immediately
                          await saveSettings({
                            referenceCurrency: settings.referenceCurrency,
                            baseCurrencyId: settings.baseCurrencyId,
                            usdRate: updates.usdRate ?? settings.usdRate,
                            eurRate: updates.eurRate ?? settings.eurRate,
                            customRate: settings.customRate,
                            exchangeRate: updates.exchangeRate ?? settings.exchangeRate,
                          })
                          toast.success(`Tasas actualizadas y guardadas (${usedSource})`)
                        } else {
                          toast.error('No se pudieron obtener las tasas')
                        }
                      } catch {
                        toast.error('Error al obtener tasas del BCV')
                      } finally {
                        setFetchingRate(false)
                      }
                    }}
                    disabled={fetchingRate}
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${fetchingRate ? 'animate-spin' : ''}`} />
                    Actualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(() => {
                    const local = getCurrencyForCountry(settings.country || 'VE')
                    const localSym = local?.symbol || '$'
                    const localCode = local?.code || 'LOC'
                    return (
                      <>
                      <div className="rounded-lg border p-4 space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="text-base">$</span>
                          USD - Dólar Estadounidense
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {(settings.usdRate || 0).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{localSym}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">1 USD = {(settings.usdRate || 0).toFixed(2)} {localCode}</p>
                      </div>
                      <div className="rounded-lg border p-4 space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="text-base">€</span>
                          EUR - Euro
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {(settings.eurRate || 0).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{localSym}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">1 EUR = {(settings.eurRate || 0).toFixed(2)} {localCode}</p>
                      </div>
                      </>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Moneda y Tasa de Referencia (consolidated) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Moneda y Tasa de Referencia</CardTitle>
                {(() => {
                    const local = getCurrencyForCountry(settings.country || 'VE')
                    return (
                      <CardDescription>Configura en qué moneda registras los precios y la tasa de conversión a {local?.symbol || 'moneda local'}.</CardDescription>
                    )
                  })()}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Moneda de referencia */}
                <div className="space-y-2">
                  <Label>Moneda para Precios</Label>
                  <Select
                    value={settings.referenceCurrency || 'USD'}
                    onValueChange={(v) => {
                      const updated = { ...settings, referenceCurrency: v }
                      if (!updated.customRate) {
                        // Find matching rate based on currency code
                        if (v === 'EUR') {
                          updated.exchangeRate = updated.eurRate || 0
                        } else if (v === 'USD') {
                          updated.exchangeRate = updated.usdRate || 0
                        } else {
                          updated.exchangeRate = 0
                        }
                      }
                      setSettings(updated)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.filter(c => !c.isBase && (c.code === 'USD' || c.code === 'EUR')).map((c) => (
                        <SelectItem key={c.id} value={c.code}>
                          {c.code} - {c.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Moneda en la que se registran los precios de productos
                  </p>
                </div>

                <Separator />

                {/* Tasa personalizada */}
                <div className="space-y-2">
                  <Label>Tasa Personalizada (opcional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Dejar vacío para usar la tasa del BCV"
                    value={settings.customRate > 0 ? settings.customRate.toString() : ''}
                    onChange={(e) => {
                      const customRate = parseFloat(e.target.value) || 0
                      const updated = { ...settings, customRate }
                      if (customRate > 0) {
                        updated.exchangeRate = customRate
                      } else {
                        const refCurrency = updated.referenceCurrency || 'USD'
                        updated.exchangeRate = refCurrency === 'EUR'
                          ? (updated.eurRate || 0)
                          : (updated.usdRate || 0)
                      }
                      setSettings(updated)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si ingresas un valor aquí, se usará esta tasa en lugar de la del BCV para calcular los precios.
                  </p>
                </div>

                <Separator />

                {/* Resumen de tasa efectiva */}
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tasa efectiva en uso:</span>
                    <span className="font-bold text-primary">{(settings.exchangeRate || 0).toFixed(2)} {(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '' })()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fuente:</span>
                    <span className="font-medium">
                      {settings.customRate > 0 ? 'Tasa personalizada' : `${settings.referenceCurrency || 'USD'}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ejemplo 10.00 {settings.referenceCurrency || 'USD'}:</span>
                    <span className="font-bold text-primary">
                      {(10 * (settings.exchangeRate || 0)).toFixed(2)} {(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '' })()}
                    </span>
                  </div>
                </div>

                <Button
                  className="bg-primary hover:bg-primary/90 text-white"
                  onClick={() => saveSettings({
                    referenceCurrency: settings.referenceCurrency,
                    baseCurrencyId: settings.baseCurrencyId,
                    usdRate: settings.usdRate,
                    eurRate: settings.eurRate,
                    customRate: settings.customRate,
                    exchangeRate: settings.exchangeRate,
                  })}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar
                </Button>
              </CardContent>
            </Card>
            </>
            )}

            {/* Single-currency info (shown when OFF) */}
            {!settings.multiCurrencyEnabled && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Moneda Local</CardTitle>
                  <CardDescription>Tu sistema opera exclusivamente en la moneda de tu país. Cambia el país en la pestaña General para actualizar la moneda.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border bg-muted/50 p-4 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                      {(() => { const info = getCurrencyForCountry(settings.country || 'VE'); return info?.symbol || '$' })()}
                    </div>
                    <div>
                      <p className="font-semibold">
                        {(() => { const info = getCurrencyForCountry(settings.country || 'VE'); return info ? `${info.code} - ${info.name}` : 'Moneda local' })()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        País: {settings.country || 'VE'} · Sin conversión cambiaria
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Métodos de Pago Tab ─────────────────────── */}
        <TabsContent value="metodos_pago">
          <PaymentMethodsTab country={settings.country || 'VE'} />
        </TabsContent>

        {/* ── I.V.A. Tab ──────────────────────────────────── */}
        <TabsContent value="iva">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">I.V.A. (Impuesto al Valor Agregado)</CardTitle>
              <CardDescription>Configura el porcentaje de IVA que se aplica a las ventas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Activar IVA</p>
                  <p className="text-sm text-muted-foreground">Incluir IVA en el carrito, facturas y cierres de caja</p>
                </div>
                <Switch
                  checked={settings.ivaEnabled}
                  onCheckedChange={(v) => setSettings({ ...settings, ivaEnabled: v })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Porcentaje de IVA (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={(settings.ivaRate ?? 0).toFixed(2)}
                    onChange={(e) => setSettings({ ...settings, ivaRate: parseFloat(e.target.value) || 0 })}
                    disabled={!settings.ivaEnabled}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  En Venezuela el IVA general es 16%. Ajusta segun tu actividad economica.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Base de calculo</Label>
                <div className="rounded-lg border bg-muted/50 p-4 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">El IVA se calcula sobre:</span>
                    <span className="font-medium">Monto en Bolivares (Bs.)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    El subtotal de la venta se convierte a Bs. usando la tasa del dia, y sobre ese monto se aplica el porcentaje de IVA.
                  </p>
                </div>
              </div>

              {settings.ivaEnabled && (
                <>
                  <Separator />
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Ejemplo de calculo:</p>
                    {settings.multiCurrencyEnabled ? (
                      <>
                    <div className="flex items-center justify-between text-sm">
                      <span>Subtotal ({settings.referenceCurrency || 'USD'}):</span>
                      <span>{getCurrencySymbol(settings.referenceCurrency || 'USD')}100.00</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Subtotal ({(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '$' })()}) al {(settings.exchangeRate || 0).toFixed(2)}:</span>
                      <span>{(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '$' })()} {(100 * (settings.exchangeRate || 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>I.V.A. ({(settings.ivaRate ?? 0).toFixed(2)}% sobre {(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '$' })()}):</span>
                      <span className="text-blue-600 font-medium">{(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '$' })()} {(100 * (settings.exchangeRate || 0) * (settings.ivaRate ?? 0) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold border-t pt-2 mt-2">
                      <span>Total con IVA ({(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '$' })()}):</span>
                      <span className="text-primary">{(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return l?.symbol || '$' })()} {(100 * (settings.exchangeRate || 0) * (1 + (settings.ivaRate ?? 0) / 100)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                      </>
                    ) : (
                      <>
                    <div className="flex items-center justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>{(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return `${l?.symbol || '$'}100.00` })()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>I.V.A. ({(settings.ivaRate ?? 0).toFixed(2)}%):</span>
                      <span className="text-blue-600 font-medium">{(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return `${l?.symbol || '$'}` })()} {(100 * (settings.ivaRate ?? 0) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold border-t pt-2 mt-2">
                      <span>Total con IVA:</span>
                      <span className="text-primary">{(() => { const l = getCurrencyForCountry(settings.country || 'VE'); return `${l?.symbol || '$'}` })()} {(100 * (1 + (settings.ivaRate ?? 0) / 100)).toFixed(2)}</span>
                    </div>
                      </>
                    )}
                  </div>
                </>
              )}

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  ivaEnabled: settings.ivaEnabled,
                  ivaRate: settings.ivaRate,
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar IVA
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sucursales Tab ─────────────────────────────── */}
        <TabsContent value="sucursales">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Sucursales</CardTitle>
                  <CardDescription>Gestiona las sucursales de tu negocio</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => {
                  setEditingBranch(null)
                  setBranchName('')
                  setBranchAddress('')
                  setBranchPhone('')
                  setShowBranchDialog(true)
                }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="hidden sm:table-cell">Dirección</TableHead>
                      <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((branch) => (
                      <TableRow key={branch.id} className={!branch.active ? 'opacity-60' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{branch.name}</span>
                            {branch.isMain && (
                              <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">Principal</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">{branch.code}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{branch.address || '—'}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{branch.phone || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={branch.active ? 'default' : 'secondary'}>
                            {branch.active ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingBranch(branch)
                                setBranchName(branch.name)
                                setBranchAddress(branch.address || '')
                                setBranchPhone(branch.phone || '')
                                setShowBranchDialog(true)
                              }}
                              title="Editar"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            {!branch.isMain && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${branch.active ? 'text-destructive' : 'text-primary'}`}
                                onClick={async () => {
                                  try {
                                    await api.put(`/api/branches/${branch.id}`, { active: !branch.active })
                                    setBranches(prev => prev.map(b => b.id === branch.id ? { ...b, active: !branch.active } : b))
                                    toast.success(branch.active ? 'Sucursal desactivada' : 'Sucursal reactivada')
                                  } catch {
                                    toast.error('Error al cambiar estado')
                                  }
                                }}
                                title={branch.active ? 'Desactivar' : 'Reactivar'}
                              >
                                {branch.active ? <Trash2 className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {branches.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <GitBranch className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          No hay sucursales registradas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Usuarios Tab ──────────────────────────────── */}
        {canManageUsers && (
        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Usuarios del Sistema</CardTitle>
                  <CardDescription>Administra usuarios y permisos</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={openCreateUser}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{getRoleLabel(user.role)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.active ? 'default' : 'secondary'}>
                            {user.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditUser(user)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-600"
                            onClick={() => setDeleteUserTarget(user)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ── Auditoría Tab ─────────────────────────────── */}
        {canViewAudit && (
        <TabsContent value="audit">
          <AuditLogView />
        </TabsContent>
        )}

        {/* ── Tutorial Tab ───────────────────────────────── */}
        {isAdmin && (
        <TabsContent value="tutorial">
          <TutorialTextsEditor />
        </TabsContent>
        )}

        {/* ── Roles & Permisos Tab ────────────────────────── */}
        {canManageUsers && (
        <TabsContent value="roles">
          <RolePermissionsEditor />
        </TabsContent>
        )}

        {/* ── Sistema Tab ───────────────────────────────── */}
        {isAdmin && (
        <TabsContent value="sistema">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuración del Sistema</CardTitle>
              <CardDescription>Parámetros generales de funcionamiento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Duración de Sesión (horas)</Label>
                <Input
                  type="number"
                  min="1"
                  max="24"
                  value={(settings.sessionDuration / 3600).toString()}
                  onChange={(e) => setSettings({
                    ...settings,
                    sessionDuration: (parseFloat(e.target.value) || 8) * 3600,
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Tiempo antes de que la sesión expire automáticamente (1-24 horas)
                </p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificaciones Push</p>
                  <p className="text-sm text-muted-foreground">Recibir alertas en tiempo real</p>
                </div>
                <Switch
                  checked={settings.notificationsEnabled}
                  onCheckedChange={(v) => setSettings({ ...settings, notificationsEnabled: v })}
                />
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  sessionDuration: settings.sessionDuration,
                  notificationsEnabled: settings.notificationsEnabled,
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ── Categorías Tab ────────────────────────────── */}
        {canManageUsers && (
        <TabsContent value="categorias">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Categorías de Productos</CardTitle>
                  <CardDescription>Gestiona las categorías para organizar tus productos y el punto de venta</CardDescription>
                </div>
                <Button data-tutorial="categories-new-btn" size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => {
                  setEditingCat(null)
                  setCatName('')
                  setCatUnitType('unit')
                  setShowCatDialog(true)
                }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Productos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{cat.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {cat.unitType === 'weight' ? 'Peso (g/kg)' : cat.unitType === 'volume' ? 'Volumen (ml/L)' : 'Unidad'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={cat._count.products > 0 ? 'default' : 'secondary'}>
                            {cat._count.products}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingCat(cat)
                                setCatName(cat.name)
                                setCatUnitType(cat.unitType || 'unit')
                                setShowCatDialog(true)
                              }}
                              title="Editar"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-600"
                              onClick={() => setDeleteCatTarget(cat)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {categories.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          <Tag className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          No hay categorías registradas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {categories.length > 0 && (
                <div className="mt-4 text-xs text-muted-foreground">
                  Total: {categories.length} categorías con {categories.reduce((s, c) => s + c._count.products, 0)} productos asociados
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ── Apariencia Tab ────────────────────────────── */}
        <TabsContent value="apariencia">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personalización Visual</CardTitle>
              <CardDescription>Cambia el aspecto visual del sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Color Principal</Label>
                <ColorPicker
                  value={settings.primaryColor}
                  onChange={(v) => {
                    const updated = { ...settings, primaryColor: v }
                    setSettings(updated)
                    applyBothColors(v, updated.secondaryColor)
                  }}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Color Secundario</Label>
                <ColorPicker
                  value={settings.secondaryColor}
                  onChange={(v) => {
                    const updated = { ...settings, secondaryColor: v }
                    setSettings(updated)
                    applyBothColors(updated.primaryColor, v)
                  }}
                />
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => saveSettings({
                  primaryColor: settings.primaryColor,
                  secondaryColor: settings.secondaryColor,
                })}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Category Dialog ─────────────────────────────── */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
            <DialogDescription>
              {editingCat ? 'Modifica el nombre de la categoría' : 'Crea una nueva categoría para organizar tus productos'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la Categoría *</Label>
              <Input
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ej: Bebidas, Lácteos, Aseo Personal..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    document.getElementById('cat-save-btn')?.click()
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Venta</Label>
              <Select value={catUnitType} onValueChange={setCatUnitType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">Por unidad</SelectItem>
                  <SelectItem value="weight">Por peso (g / kg)</SelectItem>
                  <SelectItem value="volume">Por volumen (ml / L)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {catUnitType === 'unit'
                  ? 'Los productos se venden por unidades enteras.'
                  : catUnitType === 'weight'
                  ? 'En el POS aparecerán botones rápidos de 100g, 250g, 500g, 1kg y campo libre. El precio se calcula proporcional al kilo.'
                  : 'En el POS aparecerán botones rápidos de 100ml, 250ml, 500ml, 1L y campo libre. El precio se calcula proporcional al litro.'}
              </p>
            </div>
            <Button
              id="cat-save-btn"
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={async () => {
                if (!catName.trim()) {
                  toast.error('El nombre es obligatorio')
                  return
                }
                setCatSaving(true)
                try {
                  if (editingCat) {
                    const updated = await api.put('/api/categories', { id: editingCat.id, name: catName.trim(), unitType: catUnitType })
                    toast.success('Categoría actualizada')
                    setCategories(prev => prev.map(c => c.id === editingCat.id ? updated : c))
                  } else {
                    const created = await api.post('/api/categories', { name: catName.trim(), unitType: catUnitType })
                    toast.success('Categoría creada')
                    setCategories(prev => [...prev, created])
                  }
                  setShowCatDialog(false)
                } catch (error) {
                  const msg = error instanceof Error ? error.message : 'Error al guardar categoría'
                  toast.error(msg)
                } finally {
                  setCatSaving(false)
                }
              }}
              disabled={catSaving || !catName.trim()}
            >
              {catSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {catSaving ? 'Guardando...' : editingCat ? 'Actualizar' : 'Crear Categoría'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Branch Dialog ────────────────────────────────── */}
      <Dialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}</DialogTitle>
            <DialogDescription>
              {editingBranch ? 'Modifica los datos de la sucursal' : 'Crea una nueva sucursal para tu negocio'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Nombre de la sucursal" />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} placeholder="Dirección de la sucursal" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} placeholder="+58 212-0000000" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={async () => {
              if (!branchName.trim()) {
                toast.error('El nombre es obligatorio')
                return
              }
              setBranchSaving(true)
              try {
                if (editingBranch) {
                  await api.put(`/api/branches/${editingBranch.id}`, {
                    name: branchName,
                    address: branchAddress || null,
                    phone: branchPhone || null,
                  })
                  toast.success('Sucursal actualizada')
                } else {
                  await api.post('/api/branches', {
                    name: branchName,
                    address: branchAddress || null,
                    phone: branchPhone || null,
                  })
                  toast.success('Sucursal creada')
                }
                setShowBranchDialog(false)
                const updated = await api.get<Branch[]>('/api/branches')
                setBranches(updated)
              } catch {
                toast.error('Error al guardar sucursal')
              } finally {
                setBranchSaving(false)
              }
            }} disabled={branchSaving || !branchName.trim()}>
              {branchSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {branchSaving ? 'Guardando...' : editingBranch ? 'Actualizar' : 'Crear Sucursal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── User Dialog ──────────────────────────────────── */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Modifica los datos del usuario' : 'Crea un nuevo usuario del sistema'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="usuario@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Contraseña{editingUser ? ' (dejar vacío para no cambiar)' : ' *'}</Label>
              <Input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={userRole} onValueChange={setUserRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Branch assignment for non-admin roles */}
            {userRole !== 'admin' && (
              <div className="space-y-2">
                <Label>Sucursal (opcional)</Label>
                <Select value={userBranchId} onValueChange={setUserBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin sucursal asignada" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches
                      .filter(b => b.active)
                      .map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Asigna el usuario a una sucursal específica. Si no selecciona, el cajero deberá iniciar sesión sin sucursal asignada.
                </p>
              </div>
            )}
            {editingUser && (
              <div className="flex items-center gap-2">
                <Switch checked={userActive} onCheckedChange={setUserActive} />
                <Label className="cursor-pointer">Usuario activo</Label>
              </div>
            )}
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={saveUser} disabled={userSaving}>
              {userSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {userSaving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear Usuario'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={(open) => { if (!open) setDeleteUserTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar el usuario "{deleteUserTarget?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingItem}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDeleteUser} disabled={deletingItem}>
              {deletingItem ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Category Confirmation Dialog */}
      <AlertDialog open={!!deleteCatTarget} onOpenChange={(open) => { if (!open) setDeleteCatTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Categoría</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar la categoría "{deleteCatTarget?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingItem}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDeleteCat} disabled={deletingItem}>
              {deletingItem ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
