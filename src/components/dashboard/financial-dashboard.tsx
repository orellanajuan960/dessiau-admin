'use client'

import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { useCurrency } from '@/hooks/use-currency'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target, PiggyBank, Package, Users, Receipt, Filter, CalendarDays } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

interface DashboardData {
  ingresosHoy: number
  ingresosMes: number
  ingresosPeriodo: number
  gastosHoy: number
  gastosMes: number
  gastosPeriodo: number
  utilidadBrutaMes: number
  utilidadNetaMes: number
  topProducts: { name: string; revenue: number; qty: number }[]
  recentSales: Array<{
    id: string
    date: string
    total: number
    status: string
    client: { name: string } | null
    user: { name: string }
  }>
  lowStockAlerts: Array<{ productName: string; stock: number; minStock: number }>
  overdueAlerts: Array<{ clientName: string; pendingBalance: number; dueDate: string }>
  overduePayableAlerts: Array<{ supplierName: string; pendingBalance: number; dueDate: string }>
  chartData: Array<{ date: string; total: number; count: number }>
  chartLabel: string
  period: string
}

type PeriodOption = 'today' | 'week' | 'month' | 'year' | 'custom'

const periodOptions: { value: PeriodOption; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'custom', label: 'Personalizado' },
]

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'primary',
}: {
  title: string
  value: string
  icon: React.ElementType
  trend?: 'up' | 'down'
  color?: string
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/5 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary dark:border-primary/30',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  }

  return (
    <Card className={colorMap[color] || colorMap.primary}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Icon className="h-5 w-5" />
            {trend && (
              trend === 'up' ? (
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              )
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function FinancialDashboard() {
  const { fmtBase } = useCurrency()
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodOption>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Validate custom date range (derived value, no setState)
  const { dateError, isCustomValid } = useMemo(() => {
    if (!customFrom || !customTo) return { dateError: '', isCustomValid: false }
    const from = new Date(customFrom)
    const to = new Date(customTo)
    if (from > to) {
      return { dateError: 'La fecha "Desde" no puede ser posterior a "Hasta"', isCustomValid: false }
    }
    const diffMs = to.getTime() - from.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays > 365) {
      return { dateError: 'El rango no puede superar 1 año', isCustomValid: false }
    }
    return { dateError: '', isCustomValid: true }
  }, [customFrom, customTo])

  useEffect(() => {
    // Don't fetch if custom period is selected but dates are invalid/empty
    if (period === 'custom' && !isCustomValid) return

    setLoading(true)
    const params = new URLSearchParams()
    if (selectedBranchId) params.set('branchId', selectedBranchId)
    params.set('period', period)
    if (period === 'custom' && customFrom) params.set('from', customFrom)
    if (period === 'custom' && customTo) params.set('to', customTo)
    const query = `?${params.toString()}`
    api.get<DashboardData>(`/api/dashboard${query}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedBranchId, period, customFrom, customTo, isCustomValid])

  const totalProducts = data?.topProducts.length || 0
  const totalClients = new Set(data?.recentSales.map(s => s.client?.name).filter(Boolean)).size || 0

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtrar:</span>
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={period === opt.value ? 'default' : 'outline'}
              className={period === opt.value ? 'bg-primary hover:bg-primary/90 text-white' : ''}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
        {period === 'custom' && (
          <div className="flex items-center gap-3 flex-wrap rounded-lg border bg-muted/30 p-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Desde</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                max={customTo || undefined}
              />
            </div>
            <span className="text-muted-foreground">—</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                min={customFrom || undefined}
              />
            </div>
            {dateError && (
              <p className="text-xs text-red-500">{dateError}</p>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards - Row 1 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Ingresos Hoy"
          value={fmtBase(data.ingresosHoy)}
          icon={DollarSign}
          trend="up"
          color="primary"
        />
        <KpiCard
          title="Gastos Hoy"
          value={fmtBase(data.gastosHoy)}
          icon={ShoppingCart}
          trend={data.gastosHoy > 0 ? 'down' : 'up'}
          color="red"
        />
        <KpiCard
          title="Utilidad Bruta (Mes)"
          value={fmtBase(data.utilidadBrutaMes)}
          icon={Target}
          color="violet"
        />
        <KpiCard
          title="Utilidad Neta (Mes)"
          value={fmtBase(data.utilidadNetaMes)}
          icon={PiggyBank}
          color="amber"
        />
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Ventas del Período (${data.chartLabel})`}
          value={data.chartData.reduce((s, d) => s + d.count, 0).toString()}
          icon={Receipt}
          trend="up"
          color="primary"
        />
        <KpiCard
          title={`Ingresos (${data.chartLabel})`}
          value={fmtBase(data.ingresosPeriodo)}
          icon={DollarSign}
          trend="up"
          color="primary"
        />
        <KpiCard
          title="Productos Activos"
          value={totalProducts.toString()}
          icon={Package}
          color="violet"
        />
        <KpiCard
          title="Clientes"
          value={totalClients.toString()}
          icon={Users}
          color="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendencia de Ventas ({data.chartLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [fmtBase(value), 'Ventas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 5 Productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas en este período</p>
            ) : (
              data.topProducts.map((product, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:bg-primary/10 dark:text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.qty} uds</p>
                  </div>
                  <span className="text-sm font-semibold text-primary dark:text-primary">
                    {fmtBase(product.revenue)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Sales */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimas Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin ventas</p>
              ) : (
                data.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {sale.client?.name || 'Cliente general'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.date).toLocaleString('es-VE')} · {sale.user.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary dark:text-primary">
                        {fmtBase(sale.total)}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {sale.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-y-auto">
            {data.lowStockAlerts.length === 0 && data.overdueAlerts.length === 0 && data.overduePayableAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin alertas</p>
            ) : (
              <>
                {data.lowStockAlerts.map((alert, i) => (
                  <div
                    key={`low-${i}`}
                    className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2"
                  >
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Stock Bajo
                    </p>
                    <p className="text-xs">{alert.productName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Stock: {alert.stock} / Mín: {alert.minStock}
                    </p>
                  </div>
                ))}
                {data.overdueAlerts.map((alert, i) => (
                  <div
                    key={`over-${i}`}
                    className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-2"
                  >
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                      Cuenta Vencida (Cliente)
                    </p>
                    <p className="text-xs">{alert.clientName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Pendiente: {fmtBase(alert.pendingBalance)}
                    </p>
                  </div>
                ))}
                {data.overduePayableAlerts.map((alert, i) => (
                  <div
                    key={`payable-${i}`}
                    className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-2"
                  >
                    <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                      Pago Vencido (Proveedor)
                    </p>
                    <p className="text-xs">{alert.supplierName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Pendiente: {fmtBase(alert.pendingBalance)}
                    </p>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
