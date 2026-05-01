import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { todayPKT, nowUTC } from '@/lib/time';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// In-memory rate limiter: max 5 requests per 60s per distributor_id
const rateMap = new Map<number, number[]>()
const RATE_LIMIT    = 5
const RATE_WINDOW   = 60_000

function checkRateLimit(distId: number): boolean {
  const now  = Date.now()
  const hits = (rateMap.get(distId) || []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return false
  hits.push(now)
  rateMap.set(distId, hits)
  return true
}

export async function POST(request: NextRequest) {
  try {
    const { distributor_id } = await request.json();

    if (!distributor_id) {
      return NextResponse.json({ error: 'distributor_id is required' }, { status: 400 });
    }

    const distId = parseInt(String(distributor_id), 10);
    if (isNaN(distId)) {
      return NextResponse.json({ error: 'distributor_id must be a number' }, { status: 400 });
    }

    if (!checkRateLimit(distId)) {
      return NextResponse.json({ error: 'Too many requests — wait a moment and try again' }, { status: 429 });
    }

    const today = todayPKT();

    // 1. Check distributor exists AND is active
    const { data: distributor, error: distError } = await supabase
      .from('distributors')
      .select('id, full_name, status')
      .eq('id', distId)
      .single();

    if (distError || !distributor) {
      return NextResponse.json({ error: 'Distributor not found' }, { status: 404 });
    }

    if (distributor.status !== 'active') {
      return NextResponse.json({ error: 'Distributor is not active' }, { status: 403 });
    }

    // 2. Check if already dispatched today — prevent re-check-in rolling back status
    const { data: existingSession } = await supabase
      .from('distribution_sessions')
      .select('id, status')
      .eq('distributor_id', distId)
      .eq('session_date', today)
      .single();

    if (existingSession?.status === 'dispatched') {
      return NextResponse.json(
        { error: 'This distributor has already been dispatched today', session: existingSession },
        { status: 409 }
      );
    }

    // 3. Get all thaali registrations for this distributor with a thaali assigned
    const { data: registrations, error: regError } = await supabase
      .from('thaali_registrations')
      .select('id, thaali_id, mumin_id')
      .eq('distributor_id', distId)
      .not('thaali_id', 'is', null);

    if (regError) {
      return NextResponse.json({ error: regError.message }, { status: 500 });
    }

    const totalThaalis = registrations?.length ?? 0;
    const muminIds     = registrations?.map(r => r.mumin_id) ?? [];

    // 4. Count stopped thaalis for today (approved stops where today falls in range)
    let stoppedCount = 0;
    if (muminIds.length > 0) {
      const { data: stopped } = await supabase
        .from('stop_thaalis')
        .select('id')
        .in('mumin_id', muminIds)
        .eq('status', 'approved')
        .lte('from_date', today)
        .gte('to_date', today);

      stoppedCount = stopped?.length ?? 0;
    }

    // 5. Count customized thaalis for today
    let customizedCount = 0;
    if (muminIds.length > 0) {
      const { data: customizations } = await supabase
        .from('thaali_customizations')
        .select('id')
        .in('mumin_id', muminIds)
        .eq('request_date', today)
        .eq('status', 'active');

      customizedCount = customizations?.length ?? 0;
    }

    const netThaalis   = totalThaalis - stoppedCount;
    const defaultCount = Math.max(0, netThaalis - customizedCount);

    // 6. Create or update session
    let session;

    if (existingSession) {
      const { data: updated, error: updateError } = await supabase
        .from('distribution_sessions')
        .update({
          total_thaalis:      totalThaalis,
          stopped_thaalis:    stoppedCount,
          customized_thaalis: customizedCount,
          default_thaalis:    defaultCount,
          status:             'arrived',
          arrived_at:         nowUTC(),
        })
        .eq('id', existingSession.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      session = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from('distribution_sessions')
        .insert({
          distributor_id:     distId,
          session_date:       today,
          total_thaalis:      totalThaalis,
          stopped_thaalis:    stoppedCount,
          customized_thaalis: customizedCount,
          default_thaalis:    defaultCount,
          status:             'arrived',
          arrived_at:         nowUTC(),
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      session = created;
    }

    return NextResponse.json({
      success: true,
      session,
      distributor_name: distributor.full_name,
    });

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const distributor_id   = searchParams.get('distributor_id');
  const today            = todayPKT();

  if (!distributor_id) {
    return NextResponse.json({ error: 'distributor_id required' }, { status: 400 });
  }

  const distId = parseInt(distributor_id, 10);
  if (isNaN(distId)) {
    return NextResponse.json({ error: 'distributor_id must be a number' }, { status: 400 });
  }

  const { data: session, error } = await supabase
    .from('distribution_sessions')
    .select('*')
    .eq('distributor_id', distId)
    .eq('session_date', today)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'No session found for today' }, { status: 404 });
  }

  return NextResponse.json({ session });
}
