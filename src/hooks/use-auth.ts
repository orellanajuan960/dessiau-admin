'use client'

import { useSession } from 'next-auth/react'
import { useMemo } from 'react'
import { getPermissions, canAccessView, type UserPermissions } from '@/lib/permissions'
import { useAppStore } from '@/stores/use-app-store'

interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}

export function useAuth() {
  const { data: session, status } = useSession()

  // Subscribe to permissionsVersion so components re-render when custom perms load from DB
  const permissionsVersion = useAppStore((s) => s.permissionsVersion)
  // Used in useMemo dependency — ensures permissions update when custom perms load
  void permissionsVersion

  const user: AuthUser | null = useMemo(() => {
    if (!session?.user) return null
    return {
      id: (session.user as Record<string, unknown>).id as string || '',
      name: session.user.name || '',
      email: session.user.email || '',
      role: (session.user as Record<string, unknown>).role as string || 'cajero',
    }
  }, [session])

  const permissions: UserPermissions = useMemo(() => {
    if (!user) return getPermissions('cajero')
    return getPermissions(user.role)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permissionsVersion])

  const canView = (view: string): boolean => {
    return canAccessView(user?.role || 'cajero', view)
  }

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'

  return {
    user,
    permissions,
    canView,
    isAuthenticated,
    isLoading,
    status,
  }
}
