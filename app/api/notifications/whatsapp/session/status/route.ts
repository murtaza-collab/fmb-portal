import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { data: config, error } = await supabase
    .from('wa_config')
    .select('session_name, phone_number, mode, is_active')
    .eq('is_active', true)
    .single()

  if (error || !config) {
    return NextResponse.json({ error: 'No active WAHA config found' }, { status: 404 })
  }

  const wahaBase = process.env.WAHA_BASE_URL
  const wahaKey  = process.env.WAHA_API_KEY

  if (!wahaBase || !wahaKey) {
    return NextResponse.json({ error: 'WAHA_BASE_URL or WAHA_API_KEY not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${wahaBase}/api/sessions/${config.session_name}`, {
      headers: { 'X-Api-Key': wahaKey },
      // 5s timeout
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({
        is_connected: false,
        state: 'UNKNOWN',
        config,
        error: `WAHA returned ${res.status}`,
      })
    }

    const data = await res.json()
    const state = data?.status ?? data?.state ?? 'UNKNOWN'

    return NextResponse.json({
      is_connected: state === 'WORKING',
      state,
      config,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      is_connected: false,
      state: 'UNREACHABLE',
      config,
      error: err instanceof Error ? err.message : 'Could not reach WAHA',
    })
  }
}
