'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useCurrency } from '@/hooks/use-currency'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Search, FileBarChart, ChevronLeft, ChevronRight, DollarSign, Package, TrendingUp } from 'lucide-react'

interface ReportRow {
  productId: string
  productName: string
  productActive: boolean
  year: number
  month: number
  monthName: string
  currencyCode: string
  quantity: number
  revenue: number
  cost: number
  profit: number
}

interface ReportData {
  rows: ReportRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  summary: { totalRevenue: number; totalCost: number; totalProfit: number; totalQty: number; uniqueProducts: number }
  years: number[]
}

export function ProductReport() {
  const { fmtWith } = useCurrency()
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const limit = 50

  const fetchData = (p: number) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedBranchId) params.set('branchId', selectedBranchId)
    if (yearFilter) params.set('year', yearFilter)
    if (search) params.set('search', search)
    params.set('page', p.toString())
    params.set('limit', limit.toString())

    api.get<ReportData>(`/api/reports/product-monthly?${params.toString()}`)
      .then((d) => {
        setData(d)
        setPage(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData(1)
  }, [selectedBranchId, yearFilter])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => fetchData(1), 400)
    return () => clearTimeout(timer)
  }, [search])

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      // Fetch all data (no pagination)
      const params = new URLSearchParams()
      if (selectedBranchId) params.set('branchId', selectedBranchId)
      if (yearFilter) params.set('year', yearFilter)
      if (search) params.set('search', search)
      params.set('limit', '9999')

      const allData = await api.get<ReportData>(`/api/reports/product-monthly?${params.toString()}`)

      const headers = ['Producto', 'Año', 'Mes', 'Moneda', 'Cantidad', 'Ingresos', 'Costo', 'Ganancia']
      const csvRows = allData.rows.map(r => [
        `"${r.productName}"`,
        r.year,
        r.monthName,
        r.currencyCode || '-',
        r.quantity,
        r.revenue,
        r.cost,
        r.profit,
      ].join(','))

      const csv = [headers.join(','), ...csvRows].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte-productos-mensual${yearFilter ? `-${yearFilter}` : ''}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // error
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Reporte de Productos por Mes</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={exporting}>
              {exporting ? 'Exportando...' : 'Exportar CSV'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={yearFilter} onValueChange={(v) => setYearFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="Todos los años" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {data?.years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ingresos Totales</p>
                  <p className="text-lg font-bold">{fmtWith(data.summary.totalRevenue, undefined)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-violet-100 dark:bg-violet-950/30 p-2">
                  <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unidades Vendidas</p>
                  <p className="text-lg font-bold">{data.summary.totalQty.toLocaleString('es-VE')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 dark:bg-green-950/30 p-2">
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ganancia Bruta</p>
                  <p className="text-lg font-bold">{fmtWith(data.summary.totalProfit, undefined)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 dark:bg-amber-950/30 p-2">
                  <FileBarChart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Productos Únicos</p>
                  <p className="text-lg font-bold">{data.summary.uniqueProducts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-center">Año</TableHead>
                  <TableHead className="text-center">Mes</TableHead>
                  <TableHead className="text-center">Moneda</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : !data?.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Sin datos para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((row, i) => (
                    <TableRow key={`${row.productId}-${row.year}-${row.month}-${row.currencyCode}-${i}`}>
                      <TableCell className="font-medium max-w-[200px]">
                        <div className="flex items-center gap-2">
                          {row.productName}
                          {!row.productActive && (
                            <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{row.year}</TableCell>
                      <TableCell className="text-center">{row.monthName}</TableCell>
                      <TableCell className="text-center">
                        {row.currencyCode ? (
                          <Badge variant="outline" className="text-[10px]">{row.currencyCode}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtWith(row.revenue, row.currencyCode || undefined)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtWith(row.cost, row.currencyCode || undefined)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${row.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmtWith(row.profit, row.currencyCode || undefined)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {data.pagination.total} registros — Página {page} de {data.pagination.totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm" variant="outline" disabled={page <= 1}
                  onClick={() => fetchData(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm" variant="outline" disabled={page >= data.pagination.totalPages}
                  onClick={() => fetchData(page + 1)}
                >
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
