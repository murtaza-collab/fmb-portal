import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET: Fetch HOF's family members
export async function GET(req: NextRequest) {
  const supabase = await createClient()  // ← Note: await here
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get HOF record
  const { data: hof, error: hofError } = await supabase
    .from('mumineen')
    .select('id, sf_no, its_no, full_name')
    .eq('auth_id', user.id)
    .eq('is_hof', true)
    .single()

  if (hofError || !hof) {
    return NextResponse.json({ error: 'HOF not found' }, { status: 404 })
  }

  // Get family members
  const { data: members, error: membersError } = await supabase
    .from('mumineen')
    .select('*')
    .eq('hof_id', hof.id)
    .eq('is_hof', false)
    .order('full_name')

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  return NextResponse.json({ hof, members })
}

// POST: Add family member
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get HOF record
  const { data: hof, error: hofError } = await supabase
    .from('mumineen')
    .select('id, sf_no')
    .eq('auth_id', user.id)
    .eq('is_hof', true)
    .single()

  if (hofError || !hof) {
    return NextResponse.json({ error: 'HOF not found' }, { status: 404 })
  }

  // Check ITS# uniqueness
  const { data: itsCheck } = await supabase
    .from('mumineen')
    .select('id, full_name')
    .eq('its_no', body.its_no)
    .maybeSingle()

  if (itsCheck) {
    return NextResponse.json(
      { error: `ITS# ${body.its_no} already used by: ${itsCheck.full_name}` },
      { status: 400 }
    )
  }

  // Insert family member
  const { data, error } = await supabase
    .from('mumineen')
    .insert({
      full_name: body.full_name,
      its_no: body.its_no,
      sf_no: hof.sf_no,
      dob: body.dob || null,
      phone_no: body.phone_no || null,
      whatsapp_no: body.whatsapp_no || null,
      hof_id: hof.id,
      is_hof: false,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Recalculate family counts
  await recalculateFamilyCounts(supabase, hof.id)

  return NextResponse.json({ success: true, data })
}

// PUT: Update family member
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get HOF record
  const { data: hof, error: hofError } = await supabase
    .from('mumineen')
    .select('id, sf_no')
    .eq('auth_id', user.id)
    .eq('is_hof', true)
    .single()

  if (hofError || !hof) {
    return NextResponse.json({ error: 'HOF not found' }, { status: 404 })
  }

  // Verify member belongs to this HOF
  const { data: member, error: memberError } = await supabase
    .from('mumineen')
    .select('id')
    .eq('id', body.id)
    .eq('hof_id', hof.id)
    .eq('is_hof', false)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // Check ITS# uniqueness (excluding self)
  const { data: itsCheck } = await supabase
    .from('mumineen')
    .select('id, full_name')
    .eq('its_no', body.its_no)
    .neq('id', body.id)
    .maybeSingle()

  if (itsCheck) {
    return NextResponse.json(
      { error: `ITS# ${body.its_no} already used by: ${itsCheck.full_name}` },
      { status: 400 }
    )
  }

  // Update family member
  const { error } = await supabase
    .from('mumineen')
    .update({
      full_name: body.full_name,
      its_no: body.its_no,
      dob: body.dob || null,
      phone_no: body.phone_no || null,
      whatsapp_no: body.whatsapp_no || null
    })
    .eq('id', body.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Recalculate family counts
  await recalculateFamilyCounts(supabase, hof.id)

  return NextResponse.json({ success: true })
}

// DELETE: Remove family member
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('id')

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

  // Verify member belongs to this HOF
  const { data: member, error: memberError } = await supabase
    .from('mumineen')
    .select('id')
    .eq('id', memberId)
    .eq('hof_id', hof.id)
    .eq('is_hof', false)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // Delete member
  const { error } = await supabase
    .from('mumineen')
    .delete()
    .eq('id', memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Recalculate family counts
  await recalculateFamilyCounts(supabase, hof.id)

  return NextResponse.json({ success: true })
}

// Helper: Recalculate family counts
async function recalculateFamilyCounts(supabase: any, hofId: number) {
  const { data: members } = await supabase
    .from('mumineen')
    .select('dob')
    .eq('hof_id', hofId)
    .eq('is_hof', false)

  let total_adult = 0, total_child = 0, total_infant = 0

  members?.forEach((m: any) => {
    if (!m.dob) return
    const age = new Date().getFullYear() - new Date(m.dob).getFullYear()
    if (age <= 3) total_infant++
    else if (age <= 6) total_child++  // Adjust per your age logic in lib/hijri.ts
    else total_adult++
  })

  await supabase
    .from('mumineen')
    .update({ total_adult, total_child, total_infant })
    .eq('id', hofId)
}