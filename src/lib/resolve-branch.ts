import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Resolve the branchId from the request query parameters or body branchId.
 * If no branchId is provided, returns the first active branch.
 * Falls back to a hardcoded value for backwards compatibility.
 */
export async function resolveBranchId(request?: NextRequest): Promise<string> {
  // Try from query parameter
  if (request) {
    const { searchParams } = new URL(request.url)
    const queryBranchId = searchParams.get('branchId')
    if (queryBranchId) return queryBranchId
  }

  // Fall back to first active branch from DB
  try {
    let branch = await db.branch.findFirst({
      where: { active: true },
      orderBy: { isMain: 'desc' },
    })
    if (!branch) {
      // Auto-create default branch if none exists
      branch = await db.branch.create({
        data: { name: 'Sucursal Principal', code: 'SUC-001', isMain: true, active: true },
      })
    }
    return branch.id
  } catch {
    // DB might not be ready yet
  }

  return 'sucursal-1'
}

/**
 * Extract branchId from an already-parsed request body.
 * Use this in POST handlers after reading the body.
 */
export function branchFromBody(body: Record<string, unknown>): string | null {
  if (body.branchId && typeof body.branchId === 'string') return body.branchId
  return null
}
