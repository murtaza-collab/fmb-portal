import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/api-auth'

export async function POST(request: Request) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  try {
    const { mumin_id, sf_no, its_no } = await request.json()

    if (!mumin_id || !sf_no || !its_no) {
      return NextResponse.json({ error: 'mumin_id, sf_no and its_no are required' }, { status: 400 })
    }

    if (!/^\d{8}$/.test(String(its_no).trim())) {
      return NextResponse.json({ error: 'ITS# must be exactly 8 digits' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const email = `${String(sf_no).trim().toLowerCase()}@fmb.internal`
    const password = String(its_no).trim()

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      // Return a generic message — do not reveal whether the email already exists
      const alreadyExists = authError.message?.toLowerCase().includes('already')
      return NextResponse.json(
        { error: alreadyExists ? 'An auth account already exists for this member' : 'Failed to create user account' },
        { status: 400 }
      )
    }

    const authId = authData.user.id

    const { error: updateError } = await supabaseAdmin
      .from('mumineen')
      .update({ auth_id: authId })
      .eq('id', mumin_id)

    if (updateError) {
      // Rollback: delete the created auth user to avoid orphaned accounts
      await supabaseAdmin.auth.admin.deleteUser(authId)
      return NextResponse.json({ error: 'Failed to link auth account to member record' }, { status: 500 })
    }

    return NextResponse.json({ success: true, auth_id: authId })

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
