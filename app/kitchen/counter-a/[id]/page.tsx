'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loadKitchenDayData, getStoppedMuminIds, todayISO, type TodaySchedule, type EligibleRegistration } from '@/lib/kitchen-eligible';

type FilterView = 'stopped' | 'counter_b' | 'counter_c';
type ThaaliRow = EligibleRegistration & { preStoppedBySystem?: boolean };
type Session = {
  id: number; distributor_id: number; distributor_name: string;
  total_thaalis: number | null; stopped_thaalis: number | null;
  customized_thaalis: number | null; default_thaalis: number | null;
  status: string; confirmed_at: string | null;
};

export default function CounterADetail() {
  const params = useParams();
  const distributorId = parseInt(params.id as string, 10);

  const [session, setSession]         = useState<Session | null>(null);
  const [schedule, setSchedule]       = useState<TodaySchedule | null>(null);
  const [allRows, setAllRows]         = useState<ThaaliRow[]>([]);
  const [noThaaliDay, setNoThaaliDay] = useState(false);
  const [filter, setFilter]           = useState<FilterView>('stopped');
  const [distributorName, setDistributorName] = useState('');
  const [loading, setLoading]         = useState(true);
  const [confirming, setConfirming]   = useState(false);
  const [confirmed, setConfirmed]     = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => { if (distributorId) init(); }, [distributorId]);

  const init = async () => {
    setLoading(true); setError('');
    const today = todayISO();
    const [distRes, sessionRes, dayData] = await Promise.all([
      supabase.from('distributors').select('id, full_name').eq('id', distributorId).single(),
      supabase.from('distribution_sessions').select('*').eq('distributor_id', distributorId).eq('session_date', today).maybeSingle(),
      loadKitchenDayData({ distributorId }),
    ]);
    if (distRes.error || !distRes.data) { setError(`Distributor not found (id=${distributorId})`); setLoading(false); return; }
    setDistributorName(distRes.data.full_name);
    setSchedule(dayData.schedule);
    setNoThaaliDay(dayData.noThaaliDay);

    const { data: allRegs } = await supabase
      .from('thaali_registrations')
      .select(`id, mumin_id, thaali_id, thaali_type_id, thaali_category_id, distributor_id,
        thaalis(thaali_number), mumineen(full_name, sf_no, niyyat_status_id)`)
      .eq('distributor_id', distributorId)
      .not('thaali_id', 'is', null);

    const stoppedIds = await getStoppedMuminIds(today);
    const eligibleMuminIds = new Set(dayData.eligible.map(r => r.mumin_id));
    const stoppedRows: ThaaliRow[] = (allRegs || [])
      .filter((r: any) => stoppedIds.has(r.mumin_id) && !eligibleMuminIds.has(r.mumin_id) && r.mumineen)
      .map((r: any) => ({
        registration_id: r.id, mumin_id: r.mumin_id, thaali_id: r.thaali_id,
        thaali_number: r.thaalis?.thaali_number, thaali_type_id: r.thaali_type_id,
        thaali_category_id: r.thaali_category_id, distributor_id: r.distributor_id,
        full_name: r.mumineen?.full_name || '', sf_no: r.mumineen?.sf_no || '',
        niyyat_status_id: r.mumineen?.niyyat_status_id, preStoppedBySystem: true,
      }));

    setAllRows([...dayData.eligible, ...stoppedRows]);
    if (sessionRes.data) {
      setSession({ ...sessionRes.data, distributor_name: distRes.data.full_name });
      if (['in_progress', 'completed', 'dispatched'].includes(sessionRes.data.status)) setConfirmed(true);
    }
    setLoading(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const stoppedList   = allRows.filter(r => r.preStoppedBySystem);
  const counterBList  = [] as ThaaliRow[];
  const counterCList  = allRows.filter(r => !r.preStoppedBySystem);
  const extraCount    = schedule?.extra_thaali_count || 0;
  const totalCount    = allRows.length + extraCount;
  const stoppedCount  = stoppedList.length;
  const counterBCount = counterBList.length;
  const counterCCount = counterCList.length;
  const toDispatch    = counterBCount + counterCCount;

  const displayList =
    filter === 'stopped'   ? stoppedList :
    filter === 'counter_b' ? counterBList :
    counterCList;

  const handleConfirmAndSend = async () => {
    if (confirmed || allRows.length === 0) return;
    setConfirming(true); setError('');
    const today = todayISO();
    try {
      let sessionId = session?.id;
      if (!sessionId) {
        const { data: newSession, error: e } = await supabase
          .from('distribution_sessions')
          .insert({ distributor_id: distributorId, session_date: today, status: 'active' })
          .select('id').single();
        if (e) throw e;
        sessionId = newSession.id;
      }
      const { error: ue } = await supabase.from('distribution_sessions').update({
  total_thaalis: totalCount, stopped_thaalis: stoppedCount,
  customized_thaalis: counterBCount, default_thaalis: counterCCount,
  status: 'in_progress',
}).eq('id', sessionId);
      if (ue) throw ue;
      const seedRows = allRows.map(r => ({
        session_id: sessionId, thaali_id: r.thaali_id, thaali_number: r.thaali_number,
        mumin_id: r.mumin_id, date: today,
        status: r.preStoppedBySystem ? 'stopped' : 'counter_c_pending',
      }));
      const { error: se } = await supabase.from('thaali_daily_status')
        .upsert(seedRows, { onConflict: 'session_id,thaali_id' });
      if (se) throw se;
      setConfirmed(true);
    } catch (err: any) {
      setError(err.message || 'Confirm failed');
    } finally { setConfirming(false); }
  };

  if (loading) return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--bs-tertiary-bg)' }}>
      <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} />
    </div>
  );
  if (error && !allRows.length) return (
    <div className="min-vh-100 p-4" style={{ background: 'var(--bs-tertiary-bg)' }}>
      <Link href="/kitchen" className="btn btn-outline-secondary mb-4"><i className="bi bi-arrow-left me-2" />Back</Link>
      <div className="alert alert-danger">{error}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

      {/* ── Header ── */}
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
        <div className="d-flex justify-content-between align-items-center">
          <Link href="/kitchen" className="btn btn-outline-secondary">
            <i className="bi bi-arrow-left me-2" />Back
          </Link>
          <h1 className="h4 mb-0 fw-bold text-center">
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 1 }}>Store Counter A</div>
            <div style={{ color: '#364574' }}>{distributorName || '—'}</div>
          </h1>
          <span className={`badge fs-6 ${confirmed ? 'bg-success' : 'bg-warning text-dark'}`}>
            {confirmed ? '✓ Sent to Counters' : 'Awaiting Confirmation'}
          </span>
        </div>
      </div>

      <div className="container-fluid p-4">
        {error && <div className="alert alert-warning mb-3">{error}</div>}

        {noThaaliDay ? (
          <div className="alert alert-danger d-flex align-items-center gap-2">
            <i className="bi bi-calendar-x fs-4" />
            <div><strong>No Thaali Today</strong>{schedule?.event_name && <span className="ms-2">— {schedule.event_name}</span>}</div>
          </div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <div className="row g-3 mb-4">

              {/* Total — text only, not clickable */}
              <div className="col-6 col-md-4 col-lg">
                <div style={{
                  background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)',
                  borderRadius: 16, padding: '20px 12px 16px', textAlign: 'center', minHeight: 110,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                }}>
                  <i className="bi bi-box-seam" style={{ fontSize: 22, color: '#364574', opacity: 0.6, marginBottom: 4 }} />
                  <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#364574' }}>{totalCount}</div>
                  <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)', fontWeight: 500, marginTop: 4 }}>Total Thaalis</div>
                </div>
              </div>

              {/* Stopped — clickable */}
              {(() => {
                const isActive = filter === 'stopped';
                return (
                  <div className="col-6 col-md-4 col-lg">
                    <div role="button" tabIndex={0}
                      onClick={() => setFilter('stopped')}
                      onKeyDown={e => e.key === 'Enter' && setFilter('stopped')}
                      style={{
                        background: 'var(--bs-body-bg)', borderRadius: 16, padding: '20px 12px 16px', textAlign: 'center',
                        border: isActive ? '2.5px solid #f06548' : '1px solid var(--bs-border-color)',
                        cursor: 'pointer', minHeight: 110,
                        transform: isActive ? 'translateY(-2px) scale(1.03)' : 'scale(1)',
                        boxShadow: isActive ? '0 6px 18px #f0654844' : '0 2px 8px rgba(0,0,0,0.07)',
                        transition: 'all 0.15s ease',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      }}>
                      <i className="bi bi-x-circle" style={{ fontSize: 22, color: '#f06548', opacity: isActive ? 1 : 0.7, marginBottom: 4 }} />
                      <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#f06548' }}>{stoppedCount}</div>
                      <div style={{ fontSize: 12, color: isActive ? '#f06548' : 'var(--bs-secondary-color)', fontWeight: isActive ? 600 : 500, marginTop: 4 }}>Stopped</div>
                      <div style={{ fontSize: 10, marginTop: 3, padding: '2px 8px', borderRadius: 10,
                        background: isActive ? '#f0654822' : 'var(--bs-tertiary-bg)',
                        color: isActive ? '#f06548' : 'var(--bs-secondary-color)', fontWeight: 500 }}>
                        {isActive ? '▲ viewing' : '⊙ Back to store'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Counter B — clickable */}
              {(() => {
                const isActive = filter === 'counter_b';
                return (
                  <div className="col-6 col-md-4 col-lg">
                    <div role="button" tabIndex={0}
                      onClick={() => setFilter('counter_b')}
                      onKeyDown={e => e.key === 'Enter' && setFilter('counter_b')}
                      style={{
                        background: 'var(--bs-body-bg)', borderRadius: 16, padding: '20px 12px 16px', textAlign: 'center',
                        border: isActive ? '2.5px solid #405189' : '1px solid var(--bs-border-color)',
                        cursor: 'pointer', minHeight: 110,
                        transform: isActive ? 'translateY(-2px) scale(1.03)' : 'scale(1)',
                        boxShadow: isActive ? '0 6px 18px #40518944' : '0 2px 8px rgba(0,0,0,0.07)',
                        transition: 'all 0.15s ease',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      }}>
                      <i className="bi bi-stars" style={{ fontSize: 22, color: '#405189', opacity: isActive ? 1 : 0.7, marginBottom: 4 }} />
                      <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#405189' }}>{counterBCount}</div>
                      <div style={{ fontSize: 12, color: isActive ? '#405189' : 'var(--bs-secondary-color)', fontWeight: isActive ? 600 : 500, marginTop: 4 }}>Counter B</div>
                      <div style={{ fontSize: 10, marginTop: 3, padding: '2px 8px', borderRadius: 10,
                        background: isActive ? '#40518922' : 'var(--bs-tertiary-bg)',
                        color: isActive ? '#405189' : 'var(--bs-secondary-color)', fontWeight: 500 }}>
                        {isActive ? '▲ viewing' : '⊙ Customized'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Counter C — clickable */}
              {(() => {
                const isActive = filter === 'counter_c';
                return (
                  <div className="col-6 col-md-4 col-lg">
                    <div role="button" tabIndex={0}
                      onClick={() => setFilter('counter_c')}
                      onKeyDown={e => e.key === 'Enter' && setFilter('counter_c')}
                      style={{
                        background: 'var(--bs-body-bg)', borderRadius: 16, padding: '20px 12px 16px', textAlign: 'center',
                        border: isActive ? '2.5px solid #0ab39c' : '1px solid var(--bs-border-color)',
                        cursor: 'pointer', minHeight: 110,
                        transform: isActive ? 'translateY(-2px) scale(1.03)' : 'scale(1)',
                        boxShadow: isActive ? '0 6px 18px #0ab39c44' : '0 2px 8px rgba(0,0,0,0.07)',
                        transition: 'all 0.15s ease',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      }}>
                      <i className="bi bi-check2-square" style={{ fontSize: 22, color: '#0ab39c', opacity: isActive ? 1 : 0.7, marginBottom: 4 }} />
                      <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#0ab39c' }}>{counterCCount}</div>
                      <div style={{ fontSize: 12, color: isActive ? '#0ab39c' : 'var(--bs-secondary-color)', fontWeight: isActive ? 600 : 500, marginTop: 4 }}>Counter C</div>
                      <div style={{ fontSize: 10, marginTop: 3, padding: '2px 8px', borderRadius: 10,
                        background: isActive ? '#0ab39c22' : 'var(--bs-tertiary-bg)',
                        color: isActive ? '#0ab39c' : 'var(--bs-secondary-color)', fontWeight: 500 }}>
                        {isActive ? '▲ viewing' : '⊙ Default'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* To Dispatch — text only, not clickable */}
              <div className="col-6 col-md-4 col-lg">
                <div style={{
                  background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)',
                  borderRadius: 16, padding: '20px 12px 16px', textAlign: 'center', minHeight: 110,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                }}>
                  <i className="bi bi-truck" style={{ fontSize: 22, color: '#ffbf69', opacity: 0.7, marginBottom: 4 }} />
                  <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#ffbf69' }}>{toDispatch}</div>
                  <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)', fontWeight: 500, marginTop: 4 }}>To Dispatch</div>
                </div>
              </div>
            </div>

            {/* ── Confirm & Send ── */}
            {!confirmed ? (
              <div className="card border-0 shadow-sm mb-4">
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                    <div style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
                      <span className="text-danger fw-semibold">{stoppedCount} stopped</span>
                      <span className="mx-2">·</span>
                      <span style={{ color: '#405189' }} className="fw-semibold">{counterBCount} Counter B</span>
                      <span className="mx-2">·</span>
                      <span className="text-success fw-semibold">{counterCCount} Counter C</span>
                      {extraCount > 0 && <><span className="mx-2">·</span><span className="text-success">+{extraCount} extra</span></>}
                    </div>
                    <button className="btn btn-success btn-lg fw-bold px-5"
                      onClick={handleConfirmAndSend} disabled={confirming || allRows.length === 0}>
                      {confirming
                        ? <><span className="spinner-border spinner-border-sm me-2" />Confirming...</>
                        : <><i className="bi bi-check-circle me-2" />Confirm &amp; Send</>}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="alert alert-success mb-4 d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill fs-5" />
                <div>
                  <strong>Sent to Counters</strong>
                  <span className="ms-3" style={{ fontSize: 13 }}>
                    {counterCCount > 0 && <span className="text-success fw-semibold me-3">{counterCCount} → Counter C</span>}
                    {counterBCount > 0 && <span style={{ color: '#405189' }} className="fw-semibold me-3">{counterBCount} → Counter B</span>}
                    {stoppedCount > 0 && <span className="text-danger fw-semibold">{stoppedCount} stopped</span>}
                  </span>
                </div>
              </div>
            )}

            {/* ── Thaali list ── */}
            {allRows.length === 0 ? (
              <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
                <i className="bi bi-inbox fs-2 d-block mb-2" />
                <div className="fw-semibold">No thaalis for this distributor today</div>
                <div className="small mt-1">Check niyyat approvals or thaali assignments.</div>
              </div>
            ) : (
              <div className="card border-0 shadow-sm">
                <div className="card-header pt-3 pb-0" style={{ background: 'var(--bs-body-bg)' }}>
                  <ul className="nav nav-tabs card-header-tabs">
                    {([
                      { key: 'stopped',   label: 'Stopped',   count: stoppedCount,  color: '#f06548' },
                      { key: 'counter_b', label: 'Counter B', count: counterBCount, color: '#405189' },
                      { key: 'counter_c', label: 'Counter C', count: counterCCount, color: '#0ab39c' },
                    ] as const).map(tab => (
                      <li className="nav-item" key={tab.key}>
                        <button
                          className={`nav-link ${filter === tab.key ? 'active fw-bold' : ''}`}
                          style={{ color: filter === tab.key ? tab.color : 'var(--bs-secondary-color)' }}
                          onClick={() => setFilter(tab.key)}>
                          {tab.label}
                          <span className="ms-1 badge rounded-pill" style={{
                            background: filter === tab.key ? tab.color : 'var(--bs-secondary-bg)',
                            color: filter === tab.key ? '#fff' : 'var(--bs-secondary-color)',
                            fontSize: 11,
                          }}>{tab.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-body p-0">
                  {displayList.length === 0 ? (
                    <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
                      <i className="bi bi-inbox fs-3 d-block mb-2" />
                      <div>None in this category</div>
                      {filter === 'counter_b' && <div className="small mt-1 text-muted">Customizations are assigned via portal admin</div>}
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{ color: 'var(--bs-secondary-color)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Thaali #</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mumin Name</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>SF#</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Route</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayList.map(r => {
                            const isStopped = r.preStoppedBySystem;
                            return (
                              <tr key={r.mumin_id}
                                style={{ borderLeft: isStopped ? '3px solid #f06548' : '3px solid transparent' }}
                                className={isStopped ? 'table-danger' : filter === 'counter_b' ? 'table-info' : ''}>
                                <td className="fw-bold fs-5" style={{ color: isStopped ? '#f06548' : '#364574' }}>#{r.thaali_number}</td>
                                <td style={{ color: 'var(--bs-body-color)' }}>
                                  {r.full_name}
                                  {isStopped && (
                                    <span className="ms-2 badge bg-danger" style={{ fontSize: 10 }}>STOP</span>
                                  )}
                                </td>
                                <td style={{ color: 'var(--bs-secondary-color)' }}>{r.sf_no}</td>
                                <td>
                                  {isStopped
                                    ? <span className="badge bg-danger">✕ Back to Store</span>
                                    : filter === 'counter_b'
                                      ? <span className="badge bg-info text-dark">→ Counter B</span>
                                      : <span className="badge bg-success">→ Counter C</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}