import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { mumin_id, sf_no, its_no } = await request.json()

    if (!mumin_id || !sf_no || !its_no) {
      return NextResponse.json({ error: 'mumin_id, sf_no and its_no are required' }, { status: 400 })
    }

    if (its_no.trim().length < 6) {
      return NextResponse.json({ error: 'ITS# must be at least 6 characters' }, { status: 400 })
    }

    // Server-side — can safely use service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const email = `${sf_no.trim().toLowerCase()}@fmb.internal`
    const password = its_no.trim()

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const authId = authData.user.id

    // Link auth_id to mumineen row
    const { error: updateError } = await supabaseAdmin
      .from('mumineen')
      .update({ auth_id: authId })
      .eq('id', mumin_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, auth_id: authId })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}