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

  const { phone, message } = await req.json()

  if (!phone || !message) {
    return NextResponse.json({ error: 'phone and message are required' }, { status: 400 })
  }

  // Clean phone: strip non-digits, must be 10–15 digits
  const cleaned = String(phone).replace(/\D/g, '')
  if (cleaned.length < 10 || cleaned.length > 15) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const { data: config } = await supabase
    .from('wa_config')
    .select('session_name, mode, is_active')
    .eq('is_active', true)
    .single()

  if (!config) {
    return NextResponse.json({ error: 'No active WAHA config' }, { status: 404 })
  }

  const wahaBase = process.env.WAHA_BASE_URL
  const wahaKey  = process.env.WAHA_API_KEY

  if (!wahaBase || !wahaKey) {
    return NextResponse.json({ error: 'WAHA_BASE_URL or WAHA_API_KEY not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${wahaBase}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': wahaKey,
      },
      body: JSON.stringify({
        session: config.session_name,
        chatId: `${cleaned}@c.us`,
        text: message,
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message ?? `WAHA error ${res.status}` },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, waha_message_id: data?.id ?? null, mode: config.mode })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not reach WAHA' },
      { status: 500 }
    )
  }
}
