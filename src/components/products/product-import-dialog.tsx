'use client'

import { useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ParsedRow {
  name: string
  sku: string
  price: number
  cost: number
  stock: number
  minStock: number
  category: string
}

interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
  totalProcessed: number
}

// Column name mappings (Spanish → internal)
const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  'nombre': 'name',
  'name': 'name',
  'producto': 'name',
  'sku': 'sku',
  'código': 'sku',
  'codigo': 'sku',
  'código de barras': 'sku',
  'precio': 'price',
  'price': 'price',
  'precio de venta': 'price',
  'costo': 'cost',
  'cost': 'cost',
  'precio de costo': 'cost',
  'stock': 'stock',
  'inventario': 'stock',
  'existencia': 'stock',
  'existencias': 'stock',
  'cantidad': 'stock',
  'stock mínimo': 'minStock',
  'minstock': 'minStock',
  'mínimo': 'minStock',
  'categoría': 'category',
  'categoria': 'category',
  'categoría': 'category',
}

function normalizeHeaders(headers: string[]): Map<number, keyof ParsedRow> {
  const mapping = new Map<number, keyof ParsedRow>()
  headers.forEach((header, index) => {
    const normalized = header.toString().trim().toLowerCase()
    const mapped = COLUMN_MAP[normalized]
    if (mapped) mapping.set(index, mapped)
  })
  return mapping
}

function parseRows(rawData: unknown[][], mapping: Map<number, keyof ParsedRow>): ParsedRow[] {
  const rows: ParsedRow[] = []
  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i]
    if (!raw || raw.length === 0) continue

    const row: Partial<ParsedRow> = {}
    mapping.forEach((field, colIndex) => {
      const val = raw[colIndex]
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val).trim()
        if (['price', 'cost', 'stock', 'minStock'].includes(field)) {
          const num = parseFloat(strVal)
          if (!isNaN(num)) (row as Record<string, unknown>)[field] = num
        } else {
          (row as Record<string, unknown>)[field] = strVal
        }
      }
    })

    // Only add rows that have at least a name
    if (row.name) {
      rows.push({
        name: row.name || '',
        sku: row.sku || '',
        price: row.price || 0,
        cost: row.cost || 0,
        stock: row.stock || 0,
        minStock: row.minStock || 0,
        category: row.category || '',
      })
    }
  }
  return rows
}

export function ProductImportDialog({ open, onOpenChange, onImportComplete }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [updateExisting, setUpdateExisting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [unmappedHeaders, setUnmappedHeaders] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)

  const reset = useCallback(() => {
    setStep('upload')
    setParsedRows([])
    setUpdateExisting(false)
    setImporting(false)
    setResult(null)
    setFileName('')
    setUnmappedHeaders([])
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    try {
      const arrayBuffer = await file.arrayBuffer()
      let rawData: unknown[][] = []
      let headers: string[] = []

      if (file.name.endsWith('.csv')) {
        // Parse CSV with PapaParse
        const Papa = (await import('papaparse')).default
        const text = new TextDecoder().decode(arrayBuffer)
        const parsed = Papa.parse<unknown[]>(text, { header: false, skipEmptyLines: true })
        if (parsed.data.length === 0) {
          toast.error('El archivo CSV está vacío')
          return
        }
        headers = parsed.data[0].map(h => String(h))
        rawData = parsed.data.slice(1)
      } else {
        // Parse Excel with xlsx
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

        if (jsonData.length === 0) {
          toast.error('El archivo Excel está vacío')
          return
        }

        // First row as headers
        headers = jsonData[0].map(h => String(h || ''))
        rawData = jsonData.slice(1)
      }

      // Map columns
      const mapping = normalizeHeaders(headers)
      if (!mapping.has('name' as number) && !mapping.get(0)) {
        // Try to find name by checking first column index
        let nameFound = false
        mapping.forEach((field) => {
          if (field === 'name') nameFound = true
        })
        if (!nameFound) {
          toast.error('No se encontró la columna "Nombre". Verifica que tu archivo tenga las columnas correctas.')
          return
        }
      }

      // Check for unmapped headers
      const mappedFields = new Set(mapping.values())
      const unmapped = headers.filter((h, idx) => {
        const normalized = h.toLowerCase().trim()
        return !COLUMN_MAP[normalized] && h && !mappedFields.has(mapping.get(idx))
      })
      setUnmappedHeaders(unmapped)

      const rows = parseRows(rawData, mapping)
      if (rows.length === 0) {
        toast.error('No se encontraron productos válidos en el archivo')
        return
      }

      setParsedRows(rows)
      setStep('preview')
    } catch (error) {
      console.error('[Import] Error parsing file:', error)
      toast.error('Error al leer el archivo. Verifica el formato.')
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      const data = await api.post<ImportResult>('/api/products/bulk-import', {
        products: parsedRows.map(r => ({
          name: r.name,
          sku: r.sku || undefined,
          price: r.price,
          cost: r.cost || undefined,
          stock: r.stock || undefined,
          minStock: r.minStock || undefined,
          category: r.category || undefined,
        })),
        branchId: selectedBranchId,
        updateExisting,
      })

      setResult(data)
      setStep('result')

      if (data.created > 0 || data.updated > 0) {
        toast.success(`Importación completada: ${data.created} creados, ${data.updated} actualizados`)
      }
      if (data.skipped > 0) {
        toast.warning(`${data.skipped} productos omitidos`)
      }

      onImportComplete()
    } catch {
      toast.error('Error al importar productos')
    } finally {
      setImporting(false)
    }
  }, [parsedRows, selectedBranchId, updateExisting, onImportComplete])

  const downloadTemplate = useCallback(() => {
    const template = [
      ['nombre', 'sku', 'precio', 'costo', 'stock', 'stock mínimo', 'categoría'],
      ['Producto Ejemplo 1', 'SKU001', '10.00', '5.00', '50', '10', 'General'],
      ['Producto Ejemplo 2', 'SKU002', '25.50', '12.00', '30', '5', 'Bebidas'],
      ['Producto Ejemplo 3', '', '8.99', '4.00', '100', '15', 'Snacks'],
    ]

    // Create CSV content
    const csvContent = template.map(row =>
      row.map(cell => {
        const str = String(cell)
        // Escape commas and quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    ).join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla_productos.csv'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Productos
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Sube un archivo Excel (.xlsx) o CSV con tus productos'}
            {step === 'preview' && `Vista previa: ${parsedRows.length} productos encontrados`}
            {step === 'result' && 'Resultado de la importación'}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col gap-4 py-4">
            <div
              className="flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-3 p-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const dt = e.dataTransfer
                if (dt.files?.[0]) {
                  const fakeEvent = { target: { files: [dt.files[0]] } } as unknown as React.ChangeEvent<HTMLInputElement>
                  handleFileSelect(fakeEvent)
                }
              }}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Arrastra tu archivo aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground">
                Formatos soportados: .xlsx, .xls, .csv
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />

            <Button variant="outline" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Descargar plantilla CSV
            </Button>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Columnas requeridas:</p>
              <p><strong>nombre</strong> (obligatorio) — Nombre del producto</p>
              <p><strong>precio</strong> (obligatorio) — Precio de venta</p>
              <p className="font-medium mt-2">Columnas opcionales:</p>
              <p>sku, costo, stock, stock mínimo, categoría</p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="flex-1 flex flex-col gap-3 py-2 min-h-0 overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 text-sm">
              <Badge variant="secondary">{fileName}</Badge>
              <Badge variant="outline">{parsedRows.length} productos</Badge>
              {unmappedHeaders.length > 0 && (
                <Badge variant="outline" className="text-amber-600">
                  Columnas ignoradas: {unmappedHeaders.join(', ')}
                </Badge>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <Checkbox
                id="update-existing"
                checked={updateExisting}
                onCheckedChange={(v) => setUpdateExisting(!!v)}
              />
              <label htmlFor="update-existing" className="text-sm cursor-pointer">
                Actualizar productos existentes (por nombre o SKU)
              </label>
            </div>

            <div className="flex-1 min-h-0 border rounded-lg overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Nombre</th>
                    <th className="text-left p-2 font-medium">SKU</th>
                    <th className="text-right p-2 font-medium">Precio</th>
                    <th className="text-right p-2 font-medium">Costo</th>
                    <th className="text-right p-2 font-medium">Stock</th>
                    <th className="text-left p-2 font-medium">Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="p-2 text-muted-foreground">{idx + 1}</td>
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2 text-muted-foreground">{row.sku || '—'}</td>
                      <td className="p-2 text-right">{row.price > 0 ? `$${row.price.toFixed(2)}` : <span className="text-red-500">Falta</span>}</td>
                      <td className="p-2 text-right">{row.cost > 0 ? `$${row.cost.toFixed(2)}` : '—'}</td>
                      <td className="p-2 text-right">{row.stock}</td>
                      <td className="p-2 text-muted-foreground">{row.category || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 100 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ... y {parsedRows.length - 100} productos más
                </p>
              )}
            </div>

            <DialogFooter className="shrink-0 pt-2 border-t">
              <Button variant="outline" onClick={() => setStep('upload')}>Volver</Button>
              <Button onClick={handleImport} disabled={importing || parsedRows.length === 0}>
                {importing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>Importar {parsedRows.length} productos</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <div className="flex-1 flex flex-col gap-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold">{result.created}</p>
                <p className="text-xs text-muted-foreground">Creados</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Actualizados</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <AlertCircle className="h-8 w-8 mx-auto text-amber-500 mb-1" />
                <p className="text-2xl font-bold">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Omitidos</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <ScrollArea className="border rounded-lg max-h-40">
                <div className="p-3 space-y-1">
                  {result.errors.map((err, idx) => (
                    <p key={idx} className="text-xs text-red-500">{err}</p>
                  ))}
                  {result.errors.length >= 20 && (
                    <p className="text-xs text-muted-foreground">
                      ... y más errores no mostrados
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button onClick={() => { reset(); onOpenChange(false) }}>Cerrar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
