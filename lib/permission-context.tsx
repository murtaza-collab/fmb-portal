'use client'
import { createContext, useContext } from 'react'

export type PermissionAction = 'can_view' | 'can_add' | 'can_edit' | 'can_deactivate'

export interface ModulePermission {
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_deactivate: boolean
}

export interface PortalSession {
  loading: boolean
  /** Super Admin or Admin — bypasses every module check. */
  isAdmin: boolean
  /** Super Admin only — for the few actions Admin should not have. */
  isSuperAdmin: boolean
  groupName: string
  permissions: ModulePermission[]
  /** True if the signed-in user's group holds `action` on `module`. */
  can: (module: string, action?: PermissionAction) => boolean
}

const FALLBACK: PortalSession = {
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  groupName: '',
  permissions: [],
  can: () => false,
}

export const PortalSessionContext = createContext<PortalSession>(FALLBACK)

/**
 * Reads the session and permissions that the portal layout already fetched.
 *
 * Every page used to call supabase.auth.getUser() and re-read admin_users for
 * itself. Those calls queue on the same Supabase auth lock, and when two land
 * together one times out after 10s:
 *
 *   Acquiring an exclusive Navigator LockManager lock
 *   "lock:sb-<project>-auth-token" timed out waiting 10000ms
 *
 * leaving the page rendered but with no data. Read from this context instead
 * of asking Supabase again.
 */
export function usePortalSession(): PortalSession {
  return useContext(PortalSessionContext)
}

/** Builds the `can` helper. Admin and Super Admin bypass module checks. */
export function buildCan(isAdmin: boolean, permissions: ModulePermission[]) {
  return (module: string, action: PermissionAction = 'can_view'): boolean => {
    if (isAdmin) return true
    const perm = permissions.find(p => p.module === module)
    return perm ? perm[action] === true : false
  }
}
