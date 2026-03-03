import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { distributor_id } = await request.json();

    if (!distributor_id) {
      return NextResponse.json({ error: 'distributor_id is required' }, { status: 400 });
    }

    const distId = parseInt(distributor_id, 10);
    const today = new Date().toISOString().split('T')[0];

    // 1. Check distributor exists
    const { data: distributor, error: distError } = await supabase
      .from('distributors')
      .select('id, full_name')
      .eq('id', distId)
      .single();

    if (distError || !distributor) {
      return NextResponse.json({ error: 'Distributor not found' }, { status: 404 });
    }

    // 2. Get all approved thaali registrations for this distributor
    const { data: registrations, error: regError } = await supabase
      .from('thaali_registrations')
      .select('id, thaali_id, mumin_id')
      .eq('distributor_id', distId)
      .eq('status', 'approved');

    if (regError) {
      return NextResponse.json({ error: regError.message }, { status: 500 });
    }

    const totalThaalis = registrations?.length || 0;
    const registrationIds = registrations?.map(r => r.id) || [];
    const thaaliIds = registrations?.map(r => r.thaali_id) || [];
    const muminIds = registrations?.map(r => r.mumin_id) || [];

    // 3. Count stopped thaalis (stop_thaalis table for today)
    let stoppedCount = 0;
    if (thaaliIds.length > 0) {
      const { data: stopped } = await supabase
        .from('stop_thaalis')
        .select('id, thaali_id')
        .in('thaali_id', thaaliIds)
        .lte('stop_date', today)
        .or(`resume_date.is.null,resume_date.gt.${today}`);

      stoppedCount = stopped?.length || 0;
    }

    // 4. Count customized thaalis for today
    let customizedCount = 0;
    if (muminIds.length > 0) {
      const { data: customizations } = await supabase
        .from('thaali_customizations')
        .select('id, mumin_id')
        .in('mumin_id', muminIds)
        .eq('request_date', today)
        .eq('status', 'active');

      customizedCount = customizations?.length || 0;
    }

    const netThaalis = totalThaalis - stoppedCount;
    const defaultCount = netThaalis - customizedCount;

    // 5. Check if session already exists for today
    const { data: existingSession } = await supabase
      .from('distribution_sessions')
      .select('id, status')
      .eq('distributor_id', distId)
      .eq('session_date', today)
      .single();

    let session;

    if (existingSession) {
      // Update existing session
      const { data: updated, error: updateError } = await supabase
        .from('distribution_sessions')
        .update({
          total_thaalis: totalThaalis,
          stopped_thaalis: stoppedCount,
          customized_thaalis: customizedCount,
          default_thaalis: defaultCount < 0 ? 0 : defaultCount,
          status: existingSession.status === 'dispatched' ? 'dispatched' : 'arrived',
          arrived_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      session = updated;
    } else {
      // Create new session
      const { data: created, error: createError } = await supabase
        .from('distribution_sessions')
        .insert({
          distributor_id: distId,
          session_date: today,
          total_thaalis: totalThaalis,
          stopped_thaalis: stoppedCount,
          customized_thaalis: customizedCount,
          default_thaalis: defaultCount < 0 ? 0 : defaultCount,
          status: 'arrived',
          arrived_at: new Date().toISOString(),
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

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const distributor_id = searchParams.get('distributor_id');
  const today = new Date().toISOString().split('T')[0];

  if (!distributor_id) {
    return NextResponse.json({ error: 'distributor_id required' }, { status: 400 });
  }

  const { data: session, error } = await supabase
    .from('distribution_sessions')
    .select('*')
    .eq('distributor_id', parseInt(distributor_id, 10))
    .eq('session_date', today)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'No session found for today' }, { status: 404 });
  }

  return NextResponse.json({ session });
}