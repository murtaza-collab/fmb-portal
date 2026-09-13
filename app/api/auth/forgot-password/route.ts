import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Public (unauthenticated) endpoint behind /forgot-password.
 *
 * anon is revoked from admin_users and password_reset_requests, so the browser
 * cannot look up a username or file a request itself — both go through the
 * service-role key here. Nothing in the response exposes a row: only whether
 * the username resolves, which is a deliberate product decision (see below).
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// In-memory rate limiter keyed by client IP: max 5 requests per 10 minutes.
// Mirrors app/api/kitchen/arrival/route.ts. Per-process, so it resets on
// redeploy and is not shared across instances — enough to stop casual abuse of
// an endpoint that enumerates usernames, not a substitute for a WAF.
const rateMap = new Map<string, number[]>()
const RATE_LIMIT = 5
const RATE_WINDOW = 600_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return false
  hits.push(now)
  rateMap.set(ip, hits)
  return true
}

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  return fwd?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()

    const name = typeof username === 'string' ? username.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }
    if (name.length > 64) {
      return NextResponse.json({ error: 'Username is too long' }, { status: 400 })
    }

    const ip = clientIp(request)
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests — please wait a few minutes and try again' },
        { status: 429 },
      )
    }

    // ilike, not eq: login itself matches the username case-insensitively
    // (app/login/page.tsx), so resetting must accept the same spellings.
    const { data: admin, error: lookupError } = await supabaseAdmin
      .from('admin_users')
      .select('id, full_name, username, status')
      .ilike('username', name)
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json({ error: 'Something went wrong — please try again' }, { status: 500 })
    }

    // The portal deliberately confirms non-existent usernames rather than
    // returning a uniform response. This does let a visitor enumerate valid
    // admin usernames; it was chosen so staff who mistype get a usable error.
    if (!admin) {
      return NextResponse.json({ error: 'No account found with that username' }, { status: 404 })
    }

    // An open request already exists — treat repeat submits as success rather
    // than stacking rows. Matches the partial unique index in the migration.
    const { data: existing } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id')
      .eq('admin_user_id', admin.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, alreadyPending: true })
    }

    const { error: insertError } = await supabaseAdmin
      .from('password_reset_requests')
      .insert({
        username: admin.username,
        admin_user_id: admin.id,
        full_name: admin.full_name,
        status: 'pending',
        requested_ip: ip,
      })

    if (insertError) {
      // 23505 = the partial unique index on (admin_user_id) where status='pending'.
      // The check above races with it, and swallows its own errors, so this is
      // the authoritative duplicate signal — report it as success, not failure.
      if ((insertError as { code?: string }).code === '23505') {
        return NextResponse.json({ success: true, alreadyPending: true })
      }
      return NextResponse.json({ error: 'Could not file your request — please try again' }, { status: 500 })
    }

    // Surface it in the admin notification bell. Best-effort: the request row
    // is the source of truth, so a failure here must not fail the response.
    const { error: notifyError } = await supabaseAdmin.from('notifications').insert({
      title: 'Password reset requested',
      message: `${admin.full_name || admin.username} (@${admin.username}) requested a password reset.`,
      type: 'warning',
      category: 'users',
      is_read: false,
    })
    if (notifyError) {
      console.warn('forgot-password: notification not created —', notifyError.message)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    )
  }
}
