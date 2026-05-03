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

  const { data, error } = await supabase
    .from('wa_broadcast_queue')
    .select('campaign_name, status, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by campaign_name
  const map: Record<string, {
    campaign_name: string
    total: number
    sent: number
    failed: number
    pending: number
    last_activity: string
  }> = {}

  for (const row of data ?? []) {
    if (!map[row.campaign_name]) {
      map[row.campaign_name] = {
        campaign_name:  row.campaign_name,
        total:          0,
        sent:           0,
        failed:         0,
        pending:        0,
        last_activity:  row.created_at,
      }
    }
    const c = map[row.campaign_name]
    c.total++
    if (row.status === 'sent')    c.sent++
    if (row.status === 'failed')  c.failed++
    if (row.status === 'pending') c.pending++
    if (row.created_at > c.last_activity) c.last_activity = row.created_at
  }

  const campaigns = Object.values(map).sort((a, b) =>
    b.last_activity.localeCompare(a.last_activity)
  )

  return NextResponse.json({ campaigns })
}
