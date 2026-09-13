'use client'
import { usePortalSession, type PermissionAction } from '@/lib/permission-context'

export type { PermissionAction }

/**
 * Module permission check for a portal page.
 *
 * Hiding a link in the sidebar does not protect a page: typing the URL still
 * loads it. Use this to gate the page body itself.
 *
 * Reads the session the layout already fetched — it does NOT call
 * supabase.auth.getUser(). Doing that per page is what caused the auth-lock
 * timeouts; see the note in lib/permission-context.tsx.
 *
 * This is a UX guard only. Portal pages query Supabase directly from the
 * browser, so the real enforcement is the RLS policy on each table — see
 * has_permission() in supabase/migrations. Never rely on this alone.
 *
 * Super Admin / Admin bypass the module check, matching the sidebar logic in
 * app/(portal)/layout.tsx and requirePermission() in lib/api-auth.ts.
 *
 * Usage:
 *   const { loading, allowed } = usePermission('notifications', 'can_view')
 */
export function usePermission(module: string, action: PermissionAction = 'can_view') {
  const { loading, can } = usePortalSession()
  return { loading, allowed: loading ? false : can(module, action) }
}
