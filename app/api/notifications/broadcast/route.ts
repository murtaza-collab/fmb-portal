import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { tokens, title, body, segment, event_type } = await req.json()

  if (!tokens?.length || !title || !body) {
    return NextResponse.json({ error: 'tokens, title, body required' }, { status: 400 })
  }

  if (!Array.isArray(tokens)) {
    return NextResponse.json({ error: 'tokens must be an array' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ tokens, title, body, segment, event_type }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Notification function error: ${res.status}`, detail: errText },
        { status: 502 }
      )
    }

    const result = await res.json()
    return NextResponse.json(result)

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach notification service' },
      { status: 500 }
    )
  }
}
