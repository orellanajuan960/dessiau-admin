'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Truck, Package } from 'lucide-react'

interface PurchaseLine {
  id: string
  productId: string
  quantity: number
  unitCost: number
  subtotal: number
  product: { name: string }
}

interface Purchase {
  id: string
  date: string
  total: number
  status: string
  supplier: { name: string }
  currency: { symbol: string }
  lines: PurchaseLine[]
}

export function PurchasesTable() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api.get<Purchase[]>('/api/purchases')
      .then(setPurchases)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Compras Realizadas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <>
                    <TableRow key={purchase.id}>
                      <TableCell className="text-sm">
                        {new Date(purchase.date).toLocaleDateString('es-VE')}
                      </TableCell>
                      <TableCell className="font-medium">{purchase.supplier.name}</TableCell>
                      <TableCell>
                        <Badge variant={purchase.status === 'recibida' ? 'default' : purchase.status === 'pendiente' ? 'secondary' : 'destructive'}>
                          {purchase.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {purchase.currency.symbol}{purchase.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(expanded === purchase.id ? null : purchase.id)}
                        >
                          {expanded === purchase.id ? 'Ocultar' : 'Ver'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded === purchase.id && (
                      <TableRow key={`${purchase.id}-detail`}>
                        <TableCell colSpan={5} className="bg-muted/50 px-8 py-3">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Productos:</p>
                            {purchase.lines.map((line) => (
                              <div key={line.id} className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  <Package className="h-3 w-3 text-muted-foreground" />
                                  {line.product.name}
                                </span>
                                <span className="text-muted-foreground">
                                  {line.quantity} x {purchase.currency.symbol}{line.unitCost.toFixed(2)} = <span className="font-medium text-foreground">{purchase.currency.symbol}{line.subtotal.toFixed(2)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <Truck className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No hay compras registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
