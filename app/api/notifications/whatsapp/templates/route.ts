import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { data, error } = await supabase
    .from('notification_templates')
    .select('id, title, body, variables, is_whatsapp, channel')
    .eq('is_whatsapp', true)
    .order('id', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { title, body } = await req.json()

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
  }

  // Extract {{variable}} names from body
  const variables = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m: RegExpMatchArray) => m[1])

  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      title:        title.trim(),
      body:         body.trim(),
      variables:    [...new Set(variables)],
      channel:      'whatsapp',
      is_whatsapp:  true,
      event_type:   `whatsapp_${Date.now()}`,
      enabled:      true,
    })
    .select('id, title, body, variables')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('notification_templates')
    .delete()
    .eq('id', id)
    .eq('is_whatsapp', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
