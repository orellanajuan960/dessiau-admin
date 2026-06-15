export interface UserPermissions {
  role: string
  views: string[]
  canManageUsers: boolean
  canAccessSettings: boolean
  canManageProducts: boolean
  canManageClients: boolean
  canManageCash: boolean
  canManageExpenses: boolean
  canManageSuppliers: boolean
  canViewAudit: boolean
  // Pestañas de Configuración
  canAccessTabEmpresa: boolean
  canAccessTabMoneda: boolean
  canAccessTabIva: boolean
  canAccessTabSucursales: boolean
  canAccessTabUsuarios: boolean
  canAccessTabRoles: boolean
  canAccessTabCategorias: boolean
  canAccessTabSistema: boolean
  canAccessTabApariencia: boolean
  canAccessTabTutorial: boolean
}

const defaultRolePermissions: Record<string, UserPermissions> = {
  admin: {
    role: 'admin',
    views: ['pos', 'dashboard', 'products', 'clients', 'suppliers', 'cash', 'expenses', 'settings'],
    canManageUsers: true,
    canAccessSettings: true,
    canManageProducts: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
    canViewAudit: true,
    canAccessTabEmpresa: true,
    canAccessTabMoneda: true,
    canAccessTabIva: true,
    canAccessTabSucursales: true,
    canAccessTabUsuarios: true,
    canAccessTabRoles: true,
    canAccessTabCategorias: true,
    canAccessTabSistema: true,
    canAccessTabApariencia: true,
    canAccessTabTutorial: true,
  },
  gerente: {
    role: 'gerente',
    views: ['pos', 'dashboard', 'products', 'clients', 'suppliers', 'cash', 'expenses'],
    canManageUsers: false,
    canAccessSettings: true,
    canManageProducts: true,
    canManageClients: true,
    canManageCash: true,
    canManageExpenses: true,
    canManageSuppliers: true,
    canViewAudit: true,
    canAccessTabEmpresa: true,
    canAccessTabMoneda: true,
    canAccessTabIva: true,
    canAccessTabSucursales: true,
    canAccessTabUsuarios: false,
    canAccessTabRoles: false,
    canAccessTabCategorias: false,
    canAccessTabSistema: false,
    canAccessTabApariencia: true,
    canAccessTabTutorial: false,
  },
  cajero: {
    role: 'cajero',
    views: ['pos', 'cash'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: false,
    canManageClients: false,
    canManageCash: true,
    canManageExpenses: false,
    canManageSuppliers: false,
    canViewAudit: false,
    canAccessTabEmpresa: false,
    canAccessTabMoneda: false,
    canAccessTabIva: false,
    canAccessTabSucursales: false,
    canAccessTabUsuarios: false,
    canAccessTabRoles: false,
    canAccessTabCategorias: false,
    canAccessTabSistema: false,
    canAccessTabApariencia: false,
    canAccessTabTutorial: false,
  },
  vendedor: {
    role: 'vendedor',
    views: ['pos', 'products', 'clients'],
    canManageUsers: false,
    canAccessSettings: false,
    canManageProducts: false,
    canManageClients: true,
    canManageCash: false,
    canManageExpenses: false,
    canManageSuppliers: false,
    canViewAudit: false,
    canAccessTabEmpresa: false,
    canAccessTabMoneda: false,
    canAccessTabIva: false,
    canAccessTabSucursales: false,
    canAccessTabUsuarios: false,
    canAccessTabRoles: false,
    canAccessTabCategorias: false,
    canAccessTabSistema: false,
    canAccessTabApariencia: false,
    canAccessTabTutorial: false,
  },
}

/**
 * Custom permissions override - can be set at runtime from the database.
 * This allows the admin to customize role permissions from the settings UI.
 */
let customPermissions: Record<string, UserPermissions> = {}

/**
 * Set custom permissions (called from settings initializer after loading from DB).
 * Also triggers a Zustand state bump so components re-render with updated perms.
 */
export function setCustomPermissions(perms: Record<string, UserPermissions>) {
  // IMPORTANT: merge with defaults so that new permission fields added in code
  // are properly filled even if the DB doesn't have them yet.
  customPermissions = {}
  for (const [role, dbPerms] of Object.entries(perms)) {
    const defaults = defaultRolePermissions[role]
    if (defaults) {
      // Spread defaults first, then overlay DB values on top
      customPermissions[role] = { ...defaults, ...dbPerms, views: dbPerms.views || defaults.views }
    } else {
      customPermissions[role] = dbPerms
    }
  }
  // Import dynamically to avoid circular dependency — bumpPermissions triggers re-renders
  import('@/stores/use-app-store').then(({ useAppStore }) => {
    useAppStore.getState().bumpPermissions()
  })
}

export function getPermissions(role: string): UserPermissions {
  // First check custom permissions, then fall back to defaults
  if (customPermissions[role]) {
    return customPermissions[role]
  }
  return defaultRolePermissions[role] || defaultRolePermissions.cajero
}

export function canAccessView(role: string, view: string): boolean {
  const perms = getPermissions(role)
  return perms.views.includes(view)
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrador',
    gerente: 'Gerente',
    cajero: 'Cajero',
    vendedor: 'Vendedor',
  }
  return labels[role] || role
}

export const ALL_ROLES = ['admin', 'gerente', 'cajero', 'vendedor'] as const

export { defaultRolePermissions }
