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
