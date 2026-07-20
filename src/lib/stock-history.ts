import { db } from './db'

interface LogStockChangeParams {
  productId: string
  branchId: string
  previousStock: number
  newStock: number
  source: string
  sourceId?: string
  details?: string
  userId?: string
}

export async function logStockChange(params: LogStockChangeParams) {
  const { productId, branchId, previousStock, newStock, source, sourceId, details, userId } = params
  const change = Math.round((newStock - previousStock) * 1000) / 1000

  // Don't log if stock didn't actually change
  if (change === 0) return

  await db.stockHistory.create({
    data: {
      productId,
      branchId,
      previousStock: Math.round(previousStock * 1000) / 1000,
      newStock: Math.round(newStock * 1000) / 1000,
      change,
      source,
      sourceId,
      details,
      userId,
    },
  })
}