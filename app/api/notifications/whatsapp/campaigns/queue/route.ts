import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { template_id, campaign_name, segment, test_numbers } = await req.json()

  if (!template_id || !campaign_name?.trim()) {
    return NextResponse.json({ error: 'template_id and campaign_name are required' }, { status: 400 })
  }

  // 1. Fetch template
  const { data: template, error: tplError } = await supabase
    .from('notification_templates')
    .select('title, body, variables')
    .eq('id', template_id)
    .eq('is_whatsapp', true)
    .single()

  if (tplError || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  // 2. Fetch recipients based on segment

  // Test mode — use provided numbers directly, no DB lookup
  if (segment === 'test') {
    const phones: string[] = String(test_numbers ?? '')
      .split(',')
      .map((p: string) => p.trim().replace(/\D/g, ''))
      .filter((p: string) => p.length >= 10 && p.length <= 15)

    if (!phones.length) {
      return NextResponse.json({ error: 'No valid phone numbers provided' }, { status: 400 })
    }

    const rows = phones.map(phone => ({
      campaign_name: campaign_name.trim(),
      mumin_id:      null,
      phone,
      rendered_message: template.body
        .replace(/\{\{mumin_name\}\}/g, 'Test User')
        .replace(/\{\{sf_no\}\}/g, ''),
      status:   'pending',
      attempts: 0,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('wa_broadcast_queue')
      .insert(rows)
      .select('id')

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    return NextResponse.json({ queued: inserted?.length ?? rows.length, skipped: 0, total_recipients: phones.length })
  }

  let query = supabase
    .from('mumineen')
    .select('id, full_name, sf_no, whatsapp_no')
    .eq('status', 'active')
    .eq('is_hof', true)
    .not('whatsapp_no', 'is', null)

  if (segment === 'takhmeen_pending') {
    // Get mumin_ids with pending takhmeen in active fiscal year
    const { data: fy } = await supabase
      .from('fiscal_years')
      .select('id')
      .eq('is_active', true)
      .single()

    if (fy) {
      const { data: pendingIds } = await supabase
        .from('takhmeen')
        .select('mumin_id')
        .eq('fiscal_year_id', fy.id)
        .eq('status', 'pending')

      if (pendingIds?.length) {
        query = query.in('id', pendingIds.map((r: { mumin_id: string }) => r.mumin_id))
      } else {
        return NextResponse.json({ queued: 0, skipped: 0, message: 'No pending takhmeen recipients found' })
      }
    }
  }

  const { data: recipients, error: recError } = await query
  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })
  if (!recipients?.length) {
    return NextResponse.json({ queued: 0, skipped: 0, message: 'No recipients with WhatsApp numbers found' })
  }

  // 3. Render messages + build queue rows
  const rows = []
  let skipped = 0

  for (const mumin of recipients) {
    const phone = String(mumin.whatsapp_no).replace(/\D/g, '')
    if (phone.length < 10 || phone.length > 15) { skipped++; continue }

    const message = template.body
      .replace(/\{\{mumin_name\}\}/g, mumin.full_name ?? 'Mumin')
      .replace(/\{\{sf_no\}\}/g,     mumin.sf_no    ?? '')

    rows.push({
      campaign_name: campaign_name.trim(),
      mumin_id:      mumin.id,
      phone,
      rendered_message: message,
      status:  'pending',
      attempts: 0,
    })
  }

  if (!rows.length) {
    return NextResponse.json({ queued: 0, skipped, message: 'All recipients had invalid phone numbers' })
  }

  // 4. Bulk insert — skip duplicates (unique constraint on campaign+mumin)
  const { data: inserted, error: insertError } = await supabase
    .from('wa_broadcast_queue')
    .upsert(rows, { onConflict: 'campaign_name,mumin_id', ignoreDuplicates: true })
    .select('id')

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({
    queued:  inserted?.length ?? rows.length,
    skipped,
    total_recipients: recipients.length,
  })
}
