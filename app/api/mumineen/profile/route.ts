import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Define the expected body type
interface ProfileUpdateBody {
  phone_no?: string | null
  whatsapp_no?: string | null
  email?: string | null
  dob?: string | null
  address_type_id?: number | null
  address_block_id?: number | null
  address_sector_id?: number | null
  address_number?: string | null
  address_category?: string | null
  address_floor?: string | null
  remarks?: string | null
}

// PUT: Update HOF's own profile
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get HOF record
  const { data: hof, error: hofError } = await supabase
    .from('mumineen')
    .select('id')
    .eq('auth_id', user.id)
    .eq('is_hof', true)
    .single()

  if (hofError || !hof) {
    return NextResponse.json({ error: 'HOF not found' }, { status: 404 })
  }

  // Parse and type the body
  const body: ProfileUpdateBody = await req.json()

  // Update allowed fields only (SF# and ITS# are immutable)
  const { error } = await supabase
    .from('mumineen')
    .update({
      phone_no: body.phone_no ?? null,
      whatsapp_no: body.whatsapp_no ?? null,
      email: body.email ?? null,
      dob: body.dob ?? null,
      address_type_id: body.address_type_id ?? null,
      address_block_id: body.address_block_id ?? null,
      address_sector_id: body.address_sector_id ?? null,
      address_number: body.address_number ?? null,
      address_category: body.address_category ?? null,
      address_floor: body.address_floor ?? null,
      remarks: body.remarks ?? null
    })
    .eq('id', hof.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

// GET: Get HOF profile
export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: hof, error: hofError } = await supabase
    .from('mumineen')
    .select('*')
    .eq('auth_id', user.id)
    .eq('is_hof', true)
    .single()

  if (hofError || !hof) {
    return NextResponse.json({ error: 'HOF not found' }, { status: 404 })
  }

  return NextResponse.json(hof)
}