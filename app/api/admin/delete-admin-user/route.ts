import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/api-auth'

export async function DELETE(request: Request) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  try {
    const { auth_id, admin_user_id } = await request.json()

    if (!auth_id || !admin_user_id) {
      return NextResponse.json({ error: 'auth_id and admin_user_id are required' }, { status: 400 })
    }

    // Prevent deleting self
    if (auth_id === auth.userId) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 403 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Delete admin_users row first
    const { error: dbError } = await supabaseAdmin
      .from('admin_users')
      .delete()
      .eq('id', admin_user_id)

    if (dbError) {
      return NextResponse.json({ error: 'Failed to delete user record' }, { status: 500 })
    }

    // Delete from Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(auth_id)
    if (authError) {
      // Log but don't fail — DB row is already gone
      console.error('Auth delete failed for', auth_id, authError.message)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
