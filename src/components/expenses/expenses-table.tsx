'use client'

import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore, useSetting } from '@/stores/use-app-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  date: string
  currency: { symbol: string }
  user: { name: string }
}

interface CurrencyItem {
  id: string
  code: string
  symbol: string
  isBase: boolean
}

const EXPENSE_CATEGORIES = [
  'Servicios',
  'Insumos',
  'Mantenimiento',
  'Nomina',
  'Alquiler',
  'Otro',
] as const

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ExpensesTable() {
  const { user, permissions } = useAuth()
  const canManage = permissions.canManageExpenses
  const baseCurrencyId = useSetting('baseCurrencyId')
  const branches = useAppStore((s) => s.branches)
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formCategory, setFormCategory] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formBranch, setFormBranch] = useState(selectedBranchId || '')
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([])

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/expenses?id=${deleteTarget.id}`)
      toast.success('Gasto eliminado')
      fetchExpenses()
    } catch {
      toast.error('Error al eliminar gasto')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Load currencies on mount
  useEffect(() => {
    api.get<CurrencyItem[]>('/api/currencies')
      .then(setCurrencies)
      .catch(() => {})
  }, [])

  const resolvedCurrencyId = useMemo(() => {
    return baseCurrencyId
      || currencies.find(c => c.isBase)?.id
      || currencies[0]?.id
      || ''
  }, [baseCurrencyId, currencies])

  const fetchExpenses = async () => {
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.set('category', categoryFilter)
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await api.get<Expense[]>(`/api/expenses${query}`)
      setExpenses(data)
    } catch {
      toast.error('Error al cargar gastos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchExpenses() }, [categoryFilter])

  // Sync formBranch when selectedBranchId changes
  useEffect(() => {
    if (selectedBranchId) setFormBranch(selectedBranchId)
  }, [selectedBranchId])

  // Reset form when dialog opens
  useEffect(() => {
    if (showCreate) {
      setFormCategory('')
      setFormDescription('')
      setFormAmount('')
      setFormBranch(selectedBranchId || '')
    }
  }, [showCreate, selectedBranchId])

  const handleCreate = async () => {
    const trimmedDescription = formDescription.trim()
    const parsedAmount = parseFloat(formAmount)

    // Frontend validation
    if (!formCategory) {
      toast.error('Selecciona una categoría')
      return
    }
    if (!trimmedDescription) {
      toast.error('La descripción no puede estar vacía')
      return
    }
    if (!formAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('El monto debe ser un número mayor a cero')
      return
    }

    const currencyId = resolvedCurrencyId
    const userId = user?.id || ''

    if (!currencyId) {
      toast.error('No hay moneda configurada. Ve a Configuración > Moneda.')
      return
    }
    if (!userId) {
      toast.error('No se pudo identificar el usuario.')
      return
    }

    setSaving(true)
    try {
      await api.post('/api/expenses', {
        category: formCategory,
        description: trimmedDescription,
        amount: parsedAmount,
        currencyId,
        userId,
        branchId: formBranch || undefined,
      })
      toast.success('Gasto registrado')
      setShowCreate(false)
      fetchExpenses()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar gasto'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Derive available categories from existing expenses + static list
  const allCategories = useMemo(() => {
    const existing = expenses.map(e => e.category)
    const combined = [...new Set([...EXPENSE_CATEGORIES, ...existing])]
    return combined.sort()
  }, [expenses])

  // Currency symbol for total display
  const currencySymbol = useMemo(() => {
    if (expenses.length > 0) return expenses[0].currency.symbol
    const base = currencies.find(c => c.id === resolvedCurrencyId)
    return base?.symbol || '$'
  }, [expenses, currencies, resolvedCurrencyId])

  // Filter expenses by search term
  const filteredExpenses = useMemo(() => {
    if (!searchTerm) return expenses
    const term = searchTerm.toLowerCase()
    return expenses.filter(e =>
      e.description.toLowerCase().includes(term) ||
      e.category.toLowerCase().includes(term) ||
      e.user.name.toLowerCase().includes(term)
    )
  }, [expenses, searchTerm])

  const totalGastos = filteredExpenses.reduce((s, e) => s + e.amount, 0)

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Header row: total + new button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Total gastos:{' '}
            <span className="font-bold text-red-600">
              {currencySymbol}{totalGastos.toFixed(2)}
            </span>
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo Gasto
          </Button>
        )}
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar gastos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las categorías</SelectItem>
            {allCategories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expenses table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="hidden sm:table-cell">Registrado por</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(expense.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{expense.category}</Badge>
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {expense.description}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {expense.user.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600 whitespace-nowrap">
                      {expense.currency.symbol}{expense.amount.toFixed(2)}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-600"
                          title="Eliminar"
                          onClick={() => setDeleteTarget(expense)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredExpenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Receipt className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      {searchTerm || categoryFilter
                        ? 'No se encontraron gastos con los filtros aplicados'
                        : 'No hay gastos registrados'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create expense dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Gasto</DialogTitle>
            <DialogDescription>Registra un nuevo gasto operativo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Branch selector */}
            {branches.length > 0 && (
              <div className="space-y-2">
                <Label>Sucursal</Label>
                <Select value={formBranch} onValueChange={setFormBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category */}
            <div className="space-y-2">
              <Label>Categoría *</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edesc">Descripción *</Label>
              <Input
                id="edesc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripción del gasto"
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="eamt">Monto *</Label>
              <Input
                id="eamt"
                type="number"
                step="0.01"
                min="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleCreate}
              disabled={saving}
            >
              {saving ? 'Registrando...' : 'Registrar Gasto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Gasto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar este gasto por {deleteTarget?.currency.symbol}{deleteTarget?.amount.toFixed(2)}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
