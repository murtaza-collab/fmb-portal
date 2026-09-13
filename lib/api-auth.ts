import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface AuthOk {
  ok: true
  userId: string
  isAdmin: boolean
}

interface AuthFail {
  ok: false
  response: ReturnType<typeof NextResponse.json>
}

type AuthResult = AuthOk | AuthFail

/**
 * Verifies the session cookie and confirms the caller is an active admin_user.
 * Use in API routes before any privileged action.
 *
 * Usage:
 *   const auth = await requireAdminAuth()
 *   if (!auth.ok) return auth.response
 *   if (!auth.isAdmin) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
 */
export async function requireAdminAuth(): Promise<AuthResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, status, user_groups(name)')
    .eq('auth_id', user.id)
    .single()

  if (!adminUser || adminUser.status !== 'active') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  const groups = adminUser.user_groups as { name: string } | { name: string }[] | null
  const groupName = (Array.isArray(groups) ? groups[0]?.name : groups?.name)?.toLowerCase() ?? ''
  const isAdmin = groupName === 'super admin' || groupName === 'admin' || groupName === 'super_admin'

  return { ok: true, userId: user.id, isAdmin }
}

export type PermissionAction = 'can_view' | 'can_add' | 'can_edit' | 'can_deactivate'

/**
 * Verifies the session cookie, confirms the caller is an active admin_user,
 * and checks their group actually holds `action` on `module`.
 *
 * Prefer this over requireAdminAuth for anything a non-admin group may be
 * granted. requireAdminAuth only reports *whether* the caller is an admin —
 * every route was checking `auth.ok` and ignoring `auth.isAdmin`, so any
 * active staff account of any group could reach every action.
 *
 * Super Admin / Admin bypass the module check, matching the sidebar logic in
 * app/(portal)/layout.tsx so the API and the UI agree on who can do what.
 *
 * Usage:
 *   const auth = await requirePermission('notifications', 'can_add')
 *   if (!auth.ok) return auth.response
 */
export async function requirePermission(
  module: string,
  action: PermissionAction = 'can_view',
): Promise<AuthResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, status, user_group_id, user_groups(name)')
    .eq('auth_id', user.id)
    .single()

  if (!adminUser || adminUser.status !== 'active') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  const groups = adminUser.user_groups as { name: string } | { name: string }[] | null
  const groupName = (Array.isArray(groups) ? groups[0]?.name : groups?.name)?.toLowerCase() ?? ''
  const isAdmin = groupName === 'super admin' || groupName === 'admin' || groupName === 'super_admin'

  if (isAdmin) return { ok: true, userId: user.id, isAdmin: true }

  const denied = NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  if (!adminUser.user_group_id) return { ok: false, response: denied }

  const { data: perm } = await supabase
    .from('permissions')
    .select('can_view, can_add, can_edit, can_deactivate')
    .eq('user_group_id', adminUser.user_group_id)
    .eq('module', module)
    .maybeSingle()

  if (!perm || perm[action] !== true) return { ok: false, response: denied }

  return { ok: true, userId: user.id, isAdmin: false }
}
