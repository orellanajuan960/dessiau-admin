'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

// ── Translations ──────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  client: 'Cliente',
  supplier: 'Proveedor',
  product: 'Producto',
  sale: 'Venta',
  expense: 'Gasto',
  category: 'Categoría',
  user: 'Usuario',
  branch: 'Sucursal',
  settings: 'Configuración',
  cash_register: 'Caja',
  purchase: 'Compra',
  inventory: 'Inventario',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Creación',
  update: 'Actualización',
  delete: 'Eliminación',
  login: 'Inicio de sesión',
  logout: 'Cierre de sesión',
  open_cash: 'Apertura de caja',
  close_cash: 'Cierre de caja',
  cut_cash: 'Arqueo de caja',
  cash_entry: 'Entrada de caja',
  cash_exit: 'Salida de caja',
  cash_withdrawal: 'Retiro de excedente',
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  login: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  logout: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
  open_cash: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  close_cash: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  cut_cash: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  cash_entry: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cash_exit: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  cash_withdrawal: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
}

const ENTITY_OPTIONS = [
  { value: '__all__', label: 'Todas las entidades' },
  { value: 'client', label: 'Cliente' },
  { value: 'supplier', label: 'Proveedor' },
  { value: 'product', label: 'Producto' },
  { value: 'sale', label: 'Venta' },
  { value: 'expense', label: 'Gasto' },
  { value: 'user', label: 'Usuario' },
  { value: 'branch', label: 'Sucursal' },
  { value: 'settings', label: 'Configuración' },
  { value: 'cash_register', label: 'Caja' },
  { value: 'purchase', label: 'Compra' },
]

const ACTION_OPTIONS = [
  { value: '__all__', label: 'Todas las acciones' },
  { value: 'create', label: 'Creación' },
  { value: 'update', label: 'Actualización' },
  { value: 'delete', label: 'Eliminación' },
  { value: 'login', label: 'Inicio de sesión' },
  { value: 'logout', label: 'Cierre de sesión' },
  { value: 'open_cash', label: 'Apertura de caja' },
  { value: 'close_cash', label: 'Cierre de caja' },
  { value: 'cut_cash', label: 'Arqueo de caja' },
  { value: 'cash_entry', label: 'Entrada de caja' },
  { value: 'cash_exit', label: 'Salida de caja' },
  { value: 'cash_withdrawal', label: 'Retiro de excedente' },
]

// ── Types ─────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string
  userId: string
  userName: string
  userRole: string
  action: string
  entity: string
  entityId: string | null
  details: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ── Component ─────────────────────────────────────────────────────────

export function AuditLogView() {
  const { user } = useAuth()

  // Filters
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('__all__')
  const [action, setAction] = useState('__all__')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userId, setUserId] = useState('')

  // State
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const fetchLogs = useCallback(async (page: number = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', '25')
      if (search) params.set('search', search)
      if (entity && entity !== '__all__') params.set('entity', entity)
      if (action && action !== '__all__') params.set('action', action)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (userId) params.set('userId', userId)

      const res = await fetch(`/api/audit-log?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Error al cargar registros')
      }
      const json = await res.json()
      setLogs(json.data || [])
      setPagination(json.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 })
    } catch {
      toast.error('Error al cargar registros de auditoría')
    } finally {
      setLoading(false)
    }
  }, [search, entity, action, dateFrom, dateTo, userId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const resetFilters = () => {
    setSearch('')
    setEntity('__all__')
    setAction('__all__')
    setDateFrom('')
    setDateTo('')
    setUserId('')
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDetails = (details: Record<string, unknown> | null) => {
    if (!details) return 'Sin detalles'
    try {
      return JSON.stringify(details, null, 2)
    } catch {
      return 'Sin detalles'
    }
  }

  const exportCSV = () => {
    if (logs.length === 0) {
      toast.error('No hay registros para exportar')
      return
    }
    const headers = ['Fecha', 'Usuario', 'Rol', 'Acción', 'Entidad', 'ID Entidad', 'IP', 'Detalles']
    const rows = logs.map(log => [
      formatDate(log.createdAt),
      log.userName,
      log.userRole,
      ACTION_LABELS[log.action] || log.action,
      ENTITY_LABELS[log.entity] || log.entity,
      log.entityId || '',
      log.ipAddress || '',
      log.details ? JSON.stringify(log.details) : '',
    ])

    const csv = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Archivo CSV descargado')
  }

  // Non-admin should not see this view
  if (user && user.role !== 'admin') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">Acceso denegado</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Registro de Auditoría</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Historial de actividades del sistema
                  {!loading && pagination.total > 0 && (
                    <span className="ml-2">• {pagination.total.toLocaleString()} registros</span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={loading || logs.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger>
                <SelectValue placeholder="Entidad" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="Acción" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Desde"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Hasta"
            />
            <Button
              variant="ghost"
              size="default"
              onClick={resetFilters}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-[160px]">Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="w-[130px]">Acción</TableHead>
                  <TableHead className="w-[130px]">Entidad</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      <Shield className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      No se encontraron registros de auditoría
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const isExpanded = expandedRow === log.id
                    return (
                      <>
                        <TableRow
                          key={log.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        >
                          <TableCell className="px-3">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{log.userName}</span>
                              <span className="text-xs text-muted-foreground">{log.userRole}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}
                            >
                              {ACTION_LABELS[log.action] || log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {ENTITY_LABELS[log.entity] || log.entity}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                            {log.details ? (
                              <span className="line-clamp-1">
                                {log.details.summary
                                  ? String(log.details.summary)
                                  : Object.entries(log.details)
                                      .filter(([k]) => k !== 'before' && k !== 'after')
                                      .slice(0, 2)
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join(' • ')
                                }
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${log.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={6} className="px-6 py-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                                  <span><strong>ID:</strong> {log.id}</span>
                                  <span><strong>ID Usuario:</strong> {log.userId}</span>
                                  {log.entityId && <span><strong>ID Entidad:</strong> {log.entityId}</span>}
                                  {log.ipAddress && <span><strong>IP:</strong> {log.ipAddress}</span>}
                                </div>
                                {log.details && (
                                  <pre className="max-h-40 overflow-auto rounded-md bg-background p-3 text-xs">
                                    {formatDetails(log.details)}
                                  </pre>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Mostrando {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => fetchLogs(pagination.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm font-medium">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchLogs(pagination.page + 1)}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
