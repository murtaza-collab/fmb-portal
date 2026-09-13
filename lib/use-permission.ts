'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type PermissionAction = 'can_view' | 'can_add' | 'can_edit' | 'can_deactivate'

/**
 * Module permission check for a portal page.
 *
 * Hiding a link in the sidebar does not protect a page: typing the URL still
 * loads it. Use this to gate the page body itself.
 *
 * This is a UX guard only. Portal pages query Supabase directly from the
 * browser, so the real enforcement is the RLS policy on each table — see
 * has_permission() in supabase/migrations. Never rely on this alone for
 * anything sensitive.
 *
 * Super Admin / Admin bypass the module check, matching the sidebar logic in
 * app/(portal)/layout.tsx and requirePermission() in lib/api-auth.ts.
 *
 * Usage:
 *   const { loading, allowed } = usePermission('notifications', 'can_view')
 */
export function usePermission(module: string, action: PermissionAction = 'can_view') {
  const [state, setState] = useState<{ loading: boolean; allowed: boolean }>({
    loading: true,
    allowed: false,
  })

  useEffect(() => {
    let cancelled = false
    const deny = () => { if (!cancelled) setState({ loading: false, allowed: false }) }
    const allow = () => { if (!cancelled) setState({ loading: false, allowed: true }) }

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return deny()

      const { data: admin } = await supabase
        .from('admin_users')
        .select('status, user_group_id, user_groups(name)')
        .eq('auth_id', user.id)
        .single()

      if (!admin || admin.status !== 'active') return deny()

      const groups = admin.user_groups as { name: string } | { name: string }[] | null
      const groupName = (Array.isArray(groups) ? groups[0]?.name : groups?.name)?.toLowerCase() ?? ''
      if (groupName === 'super admin' || groupName === 'admin' || groupName === 'super_admin') {
        return allow()
      }

      if (!admin.user_group_id) return deny()

      const { data: perm } = await supabase
        .from('permissions')
        .select('can_view, can_add, can_edit, can_deactivate')
        .eq('user_group_id', admin.user_group_id)
        .eq('module', module)
        .maybeSingle()

      if (!cancelled) setState({ loading: false, allowed: perm?.[action] === true })
    })()

    return () => { cancelled = true }
  }, [module, action])

  return state
}
