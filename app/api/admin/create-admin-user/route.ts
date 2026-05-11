import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/api-auth'

export async function POST(request: Request) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  try {
    const { username, password, full_name, user_group_id } = await request.json()

    if (!username?.trim() || !password?.trim() || !full_name?.trim()) {
      return NextResponse.json({ error: 'username, password and full_name are required' }, { status: 400 })
    }
    if (password.trim().length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const email = `${username.trim().toLowerCase()}@fmb.internal`

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password.trim(),
      email_confirm: true,
    })

    if (authError) {
      const alreadyExists = authError.message?.toLowerCase().includes('already')
      return NextResponse.json(
        { error: alreadyExists ? 'Username already exists' : 'Failed to create auth account' },
        { status: 400 }
      )
    }

    const authId = authData.user.id

    const { error: insertError } = await supabaseAdmin.from('admin_users').insert({
      auth_id: authId,
      full_name: full_name.trim(),
      username: username.trim(),
      user_group_id: user_group_id ? parseInt(user_group_id) : null,
      status: 'active',
    })

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(authId)
      return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
    }

    return NextResponse.json({ success: true, auth_id: authId })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
