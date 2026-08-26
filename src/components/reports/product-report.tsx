'use client'

import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, FileBarChart, Package, Download, Loader2, CalendarDays } from 'lucide-react'

interface ReportRow {
  productId: string
  productName: string
  productActive: boolean
  quantity: number
}

interface ReportData {
  rows: ReportRow[]
  totalQty: number
  uniqueProducts: number
}

export function ProductReport() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exporting, setExporting] = useState(false)

  const { dateError, isRangeValid } = useMemo(() => {
    if (!fromDate || !toDate) return { dateError: '', isRangeValid: false }
    const from = new Date(fromDate)
    const to = new Date(toDate)
    if (from > to) return { dateError: 'La fecha "Desde" no puede ser posterior a "Hasta"', isRangeValid: false }
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 730) return { dateError: 'El rango no puede superar 2 años', isRangeValid: false }
    return { dateError: '', isRangeValid: true }
  }, [fromDate, toDate])

  const hasFilter = isRangeValid

  const fetchData = () => {
    if (!isRangeValid) return
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedBranchId) params.set('branchId', selectedBranchId)
    if (search) params.set('search', search)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)

    api.get<ReportData>(`/api/reports/product-monthly?${params.toString()}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId])

  // Debounced search
  useEffect(() => {
    if (!isRangeValid) return
    const timer = setTimeout(() => fetchData(), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleApplyDate = () => {
    fetchData()
  }

  const handleExportPDF = async () => {
    if (!data || !fromDate || !toDate) return
    setExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // Title
      doc.setFontSize(16)
      doc.text('Reporte de Productos por Cantidad', 14, 20)

      // Subtitle - date range
      doc.setFontSize(10)
      doc.setTextColor(100)
      const fromFmt = new Date(fromDate + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
      const toFmt = new Date(toDate + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
      doc.text(`Desde: ${fromFmt}  -  Hasta: ${toFmt}`, 14, 28)

      // Summary
      doc.setFontSize(10)
      doc.setTextColor(0)
      doc.text(`Total de productos: ${data.uniqueProducts}    |    Unidades vendidas: ${data.totalQty.toLocaleString('es-VE')}`, 14, 36)

      // Table
      const tableRows = data.rows.map((r, i) => [
        i + 1,
        r.productName,
        r.quantity % 1 === 0 ? r.quantity.toString() : r.quantity.toFixed(2),
      ])

      autoTable(doc, {
        startY: 42,
        head: [['#', 'Producto', 'Cantidad Vendida']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { cellWidth: 'auto' },
          2: { halign: 'right', cellWidth: 40 },
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
        didDrawPage: (dataPage) => {
          // Footer on each page
          doc.setFontSize(8)
          doc.setTextColor(150)
          const pageCount = doc.getNumberOfPages()
          doc.text(
            `Página ${dataPage.pageNumber} de ${pageCount}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' },
          )
        },
      })

      // Total row at the bottom
      const finalY = (doc as unknown as Record<string, number>).lastAutoTable?.finalY || 160
      doc.setFontSize(10)
      doc.setTextColor(0)
      doc.setFont(undefined, 'bold')
      doc.text(`TOTAL:  ${data.totalQty.toLocaleString('es-VE')} unidades`, 14, finalY + 8)

      doc.save(`reporte-productos-${fromDate}-a-${toDate}.pdf`)
    } catch {
      // error silently
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
              <CardTitle className="text-base">Reporte de Productos por Cantidad</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting || !hasFilter || !data?.rows.length}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? 'Generando...' : 'Exportar PDF'}
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
                disabled={!hasFilter}
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  max={toDate || undefined}
                />
              </div>
              <span className="text-muted-foreground text-xs">—</span>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  min={fromDate || undefined}
                />
              </div>
              <Button size="sm" onClick={handleApplyDate} disabled={!isRangeValid} className="h-8">
                Filtrar
              </Button>
            </div>
          </div>
          {dateError && <p className="text-xs text-red-500 mt-2">{dateError}</p>}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-violet-100 dark:bg-violet-950/30 p-2">
                  <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unidades Vendidas</p>
                  <p className="text-lg font-bold">{data.totalQty.toLocaleString('es-VE')}</p>
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
                  <p className="text-lg font-bold">{data.uniqueProducts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {!hasFilter ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Selecciona un rango de fechas para ver el reporte</p>
              <p className="text-xs mt-1">Elige las fechas Desde y Hasta, luego presiona Filtrar</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad Vendida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Cargando...
                        </TableCell>
                      </TableRow>
                    ) : !data?.rows.length ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Sin datos para este rango de fechas
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.rows.map((row, i) => (
                        <TableRow key={row.productId}>
                          <TableCell className="text-center text-muted-foreground text-sm">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {row.productName}
                              {!row.productActive && (
                                <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {row.quantity % 1 === 0
                              ? row.quantity.toLocaleString('es-VE')
                              : row.quantity.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Footer total */}
              {data && data.rows.length > 0 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-bold">
                    {data.totalQty.toLocaleString('es-VE')} unidades
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
