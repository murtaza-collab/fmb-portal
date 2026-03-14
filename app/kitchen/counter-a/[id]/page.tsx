'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loadKitchenDayData, todayISO, type TodaySchedule, type EligibleRegistration } from '@/lib/kitchen-eligible';

type Override = 'customized' | 'stopped';
type FilterView = 'all' | 'stopped' | 'counter_b' | 'counter_c';

type Session = {
  id: number;
  distributor_id: number;
  distributor_name: string;
  total_thaalis: number | null;
  stopped_thaalis: number | null;
  customized_thaalis: number | null;
  default_thaalis: number | null;
  status: string;
  confirmed_at: string | null;
};

export default function CounterADetail() {
  const params = useParams();
  const router = useRouter();
  const distributorId = parseInt(params.id as string, 10);

  const [session, setSession] = useState<Session | null>(null);
  const [schedule, setSchedule] = useState<TodaySchedule | null>(null);
  const [eligible, setEligible] = useState<EligibleRegistration[]>([]);
  const [noThaaliDay, setNoThaaliDay] = useState(false);

  // per-mumin overrides: only staff can mark customized/stopped at the counter
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [filter, setFilter] = useState<FilterView>('all');

  const [distributorName, setDistributorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (distributorId) init(); }, [distributorId]);

  const init = async () => {
    setLoading(true);
    setError('');
    const today = todayISO();

    const [distRes, sessionRes, dayData] = await Promise.all([
      supabase.from('distributors').select('id, full_name').eq('id', distributorId).single(),
      supabase.from('distribution_sessions').select('*').eq('distributor_id', distributorId).eq('session_date', today).maybeSingle(),
      loadKitchenDayData({ distributorId }),
    ]);

    if (distRes.error || !distRes.data) {
      setError(`Distributor not found. (id=${distributorId})`);
      setLoading(false);
      return;
    }

    setDistributorName(distRes.data.full_name);
    setSchedule(dayData.schedule);
    setNoThaaliDay(dayData.noThaaliDay);
    setEligible(dayData.eligible);

    if (sessionRes.data) {
      setSession({ ...sessionRes.data, distributor_name: distRes.data.full_name });
      if (sessionRes.data.confirmed_at) setConfirmed(true);
    } else {
      setSession(null);
    }

    setLoading(false);
  };

  // ── Derived lists — all computed from schedule-filtered eligible list ──────
  const stoppedList    = eligible.filter(r => overrides[r.mumin_id] === 'stopped');
  const customizedList = eligible.filter(r => overrides[r.mumin_id] === 'customized');
  const defaultList    = eligible.filter(r => !overrides[r.mumin_id]);

  const extraCount   = schedule?.extra_thaali_count || 0;
  const totalCount   = eligible.length + extraCount;
  const stoppedCount = stoppedList.length;
  const counterBCount = customizedList.length;
  const counterCCount = defaultList.length;
  const toDispatch   = counterBCount + counterCCount;

  const displayList =
    filter === 'stopped'   ? stoppedList :
    filter === 'counter_b' ? customizedList :
    filter === 'counter_c' ? defaultList :
    eligible;

  const toggleOverride = (muminId: number, type: Override) => {
    if (confirmed) return;
    setOverrides(prev => {
      if (prev[muminId] === type) { const n = { ...prev }; delete n[muminId]; return n; }
      return { ...prev, [muminId]: type };
    });
  };

  const handleConfirmAndSend = async () => {
    if (confirmed || eligible.length === 0) return;
    setConfirming(true);
    setError('');
    const today = todayISO();

    try {
      // 1. Create session if not exists
      let sessionId = session?.id;
      if (!sessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('distribution_sessions')
          .insert({ distributor_id: distributorId, session_date: today, status: 'active' })
          .select('id').single();
        if (sessionError) throw sessionError;
        sessionId = newSession.id;
      }

      // 2. Write counts
      const { error: updateError } = await supabase
        .from('distribution_sessions')
        .update({
          total_thaalis: totalCount,
          stopped_thaalis: stoppedCount,
          customized_thaalis: counterBCount,
          default_thaalis: counterCCount,
          confirmed_at: new Date().toISOString(),
          status: 'in_progress',
        })
        .eq('id', sessionId);
      if (updateError) throw updateError;

      // 3. Seed thaali_daily_status — one row per eligible thaali
      //    status driven by override OR default → counter_c_pending
      const seedRows = eligible.map(r => ({
        session_id: sessionId,
        thaali_id: r.thaali_id,
        thaali_number: r.thaali_number,
        mumin_id: r.mumin_id,
        date: today,
        status:
          overrides[r.mumin_id] === 'stopped'    ? 'stopped' :
          overrides[r.mumin_id] === 'customized' ? 'counter_b_pending' :
          'counter_c_pending',
      }));

      const { error: seedError } = await supabase
        .from('thaali_daily_status')
        .upsert(seedRows, { onConflict: 'session_id,thaali_id' });
      if (seedError) throw seedError;

      setConfirmed(true);
    } catch (err: any) {
      setError(err.message || 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  };

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const CARDS = [
    { key: 'all',       label: 'Total Thaalis', value: totalCount,    color: '#364574', filterable: false, icon: 'bi-box-seam'      },
    { key: 'stopped',   label: 'Stopped',       value: stoppedCount,  color: '#f06548', filterable: true,  icon: 'bi-x-circle'      },
    { key: 'counter_b', label: 'Counter B',     value: counterBCount, color: '#405189', filterable: true,  icon: 'bi-stars',      hint: 'Customized' },
    { key: 'counter_c', label: 'Counter C',     value: counterCCount, color: '#0ab39c', filterable: true,  icon: 'bi-check2-square', hint: 'Default' },
    { key: 'dispatch',  label: 'To Dispatch',   value: toDispatch,    color: '#ffbf69', filterable: false, icon: 'bi-truck'         },
  ] as const;

  if (loading) return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} />
    </div>
  );

  if (error && !session && !eligible.length) return (
    <div className="min-vh-100 p-4">
      <Link href="/kitchen" className="btn btn-outline-secondary mb-4">
        <i className="bi bi-arrow-left me-2" />Back
      </Link>
      <div className="alert alert-danger">{error}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

      {/* Header */}
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
        <div className="d-flex justify-content-between align-items-center">
          <Link href="/kitchen" className="btn btn-outline-secondary">
            <i className="bi bi-arrow-left me-2" />Back
          </Link>
          <h1 className="h4 mb-0 fw-bold text-center">
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 1 }}>Store Counter</div>
            <div style={{ color: '#364574' }}>{distributorName || '—'}</div>
          </h1>
          <span className={`badge fs-6 ${confirmed ? 'bg-success' : 'bg-warning text-dark'}`}>
            {confirmed ? '✓ Sent to Counters' : 'Awaiting Confirmation'}
          </span>
        </div>
      </div>

      <div className="container-fluid p-4">
        {error && <div className="alert alert-warning mb-3">{error}</div>}

        {/* No thaali day */}
        {noThaaliDay && (
          <div className="alert alert-danger d-flex align-items-center gap-2">
            <i className="bi bi-calendar-x fs-4" />
            <div>
              <strong>No Thaali Today</strong>
              {schedule?.event_name && <span className="ms-2">— {schedule.event_name}</span>}
              <div className="small">This date is marked as a no-thaali day in the calendar.</div>
            </div>
          </div>
        )}

        {/* Schedule banner */}
        {!noThaaliDay && schedule && (
          <div className="alert alert-info py-2 mb-3 d-flex flex-wrap gap-3 align-items-center" style={{ fontSize: 13 }}>
            <span><i className="bi bi-calendar-check me-1 text-success" />Thaali day</span>
            <span>Eligible niyyat status IDs: <strong>{schedule.niyyat_status_ids.join(', ')}</strong></span>
            {extraCount > 0 && <span>Extra thaalis: <strong className="text-success">+{extraCount}</strong></span>}
            {(schedule.thaali_category_ids?.length || 0) > 0 && <span>Category filter: <strong>active</strong></span>}
          </div>
        )}

        {/* Stat cards */}
        {!noThaaliDay && (
          <div className="row g-3 mb-4">
            {CARDS.map(card => {
              const isActive = filter === card.key;
              return (
                <div className="col-6 col-md-4 col-lg" key={card.key}>
                  <div
                    role={card.filterable ? 'button' : undefined}
                    tabIndex={card.filterable ? 0 : undefined}
                    onClick={() => card.filterable && !confirmed && setFilter(f => f === card.key ? 'all' : card.key as FilterView)}
                    onKeyDown={e => card.filterable && e.key === 'Enter' && !confirmed && setFilter(f => f === card.key ? 'all' : card.key as FilterView)}
                    style={{
                      background: 'var(--bs-body-bg)',
                      border: isActive ? `2.5px solid ${card.color}` : '1px solid var(--bs-border-color)',
                      borderRadius: 16, padding: '20px 12px 16px', textAlign: 'center',
                      cursor: card.filterable && !confirmed ? 'pointer' : 'default',
                      transform: isActive ? 'translateY(-2px) scale(1.03)' : 'scale(1)',
                      boxShadow: isActive ? `0 6px 18px ${card.color}44` : '0 2px 8px rgba(0,0,0,0.07)',
                      transition: 'all 0.15s ease', minHeight: 110,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    }}
                  >
                    <i className={`bi ${card.icon}`} style={{ fontSize: 22, color: card.color, opacity: isActive ? 1 : 0.7, marginBottom: 4 }} />
                    <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: card.color }}>{card.value}</div>
                    <div style={{ fontSize: 12, color: isActive ? card.color : 'var(--bs-secondary-color)', fontWeight: isActive ? 600 : 500, marginTop: 4 }}>
                      {card.label}
                    </div>
                    {'hint' in card && card.hint && (
                      <div style={{ fontSize: 10, marginTop: 3, padding: '2px 8px', borderRadius: 10,
                        background: isActive ? `${card.color}22` : 'var(--bs-tertiary-bg)',
                        color: isActive ? card.color : 'var(--bs-secondary-color)', fontWeight: 500 }}>
                        {isActive ? '▲ filtering' : `⊙ ${card.hint}`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stopped alert */}
        {stoppedList.length > 0 && (
          <div className="alert alert-danger mb-4">
            <h6 className="fw-bold mb-2">
              <i className="bi bi-exclamation-triangle me-2" />
              {stoppedList.length} Thaali{stoppedList.length > 1 ? 's' : ''} marked STOPPED — Put back to store:
            </h6>
            <div className="d-flex flex-wrap gap-2">
              {stoppedList.map(r => (
                <span key={r.mumin_id} className="badge bg-danger fs-6 px-3 py-2">#{r.thaali_number} — {r.full_name}</span>
              ))}
            </div>
          </div>
        )}

        {/* Confirm & Send */}
        {!noThaaliDay && !confirmed && eligible.length > 0 && (
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <div className="row align-items-center">
                <div className="col-md-8">
                  <h5 className="mb-1 fw-bold">Ready to start filling?</h5>
                  <p className="text-muted mb-0">
                    <span className="text-danger fw-bold">{stoppedCount} stopped</span> → back to store &nbsp;|&nbsp;
                    <span className="fw-bold" style={{ color: '#405189' }}>{counterBCount} customized</span> → Counter B &nbsp;|&nbsp;
                    <span className="text-success fw-bold">{counterCCount} default</span> → Counter C
                    {extraCount > 0 && <> &nbsp;|&nbsp; <span className="text-success">+{extraCount} extra</span></>}
                  </p>
                </div>
                <div className="col-md-4 mt-3 mt-md-0">
                  <button className="btn btn-success btn-lg w-100 fw-bold"
                    onClick={handleConfirmAndSend} disabled={confirming || eligible.length === 0}>
                    {confirming
                      ? <><span className="spinner-border spinner-border-sm me-2" />Confirming...</>
                      : <><i className="bi bi-check-circle me-2" />Confirm &amp; Send</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {confirmed && (
          <div className="alert alert-success mb-4">
            <i className="bi bi-check-circle me-2" />
            <strong>Sent!</strong>{' '}
            {counterBCount > 0 && <><span className="fw-bold">{counterBCount} customized</span> → Counter B &nbsp;|&nbsp;</>}
            <span className="fw-bold text-success">{counterCCount} default</span> → Counter C
            {stoppedCount > 0 && <> &nbsp;|&nbsp; <span className="text-danger fw-bold">{stoppedCount} stopped</span> → back to store</>}
          </div>
        )}

        {/* Empty state */}
        {!noThaaliDay && eligible.length === 0 && (
          <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
            <i className="bi bi-inbox fs-2 d-block mb-2" />
            <div className="fw-semibold">No eligible thaalis for this distributor today</div>
            <div className="small mt-1">Check niyyat approvals or thaali assignments for this distributor.</div>
          </div>
        )}

        {/* Tabs + thaali list */}
        {!noThaaliDay && eligible.length > 0 && (
          <div className="card border-0 shadow-sm">
            <div className="card-header pt-3 pb-0" style={{ background: 'var(--bs-body-bg)' }}>
              <ul className="nav nav-tabs card-header-tabs">
                {[
                  { key: 'all',       label: `All (${eligible.length})` },
                  { key: 'stopped',   label: `Stopped (${stoppedCount})`,    danger: stoppedCount > 0 },
                  { key: 'counter_b', label: `Counter B (${counterBCount})` },
                  { key: 'counter_c', label: `Counter C (${counterCCount})` },
                ].map(tab => (
                  <li className="nav-item" key={tab.key}>
                    <button
                      className={`nav-link ${filter === tab.key ? 'active fw-bold' : ''} ${tab.danger ? 'text-danger' : ''}`}
                      onClick={() => setFilter(tab.key as FilterView)}
                    >{tab.label}</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-body p-0">
              {displayList.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-inbox fs-3" /><div className="mt-2">None in this category</div>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Thaali #</th><th>Mumin Name</th><th>SF#</th><th>Route</th>
                        {!confirmed && <th>Override</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {displayList.map(r => {
                        const ov = overrides[r.mumin_id];
                        return (
                          <tr key={r.mumin_id}
                            className={ov === 'stopped' ? 'table-danger' : ov === 'customized' ? 'table-info' : ''}>
                            <td className="fw-bold fs-5">#{r.thaali_number}</td>
                            <td>{r.full_name}</td>
                            <td className="text-muted">{r.sf_no}</td>
                            <td>
                              {ov === 'stopped'    && <span className="badge bg-danger">✕ Stopped — Back to Store</span>}
                              {ov === 'customized' && <span className="badge bg-info text-dark">→ Counter B</span>}
                              {!ov               && <span className="badge bg-success">→ Counter C</span>}
                            </td>
                            {!confirmed && (
                              <td>
                                <button
                                  className={`btn btn-sm me-1 ${ov === 'customized' ? 'btn-info' : 'btn-outline-info'}`}
                                  style={{ fontSize: 11 }}
                                  onClick={() => toggleOverride(r.mumin_id, 'customized')}
                                >Custom</button>
                                <button
                                  className={`btn btn-sm ${ov === 'stopped' ? 'btn-danger' : 'btn-outline-danger'}`}
                                  style={{ fontSize: 11 }}
                                  onClick={() => toggleOverride(r.mumin_id, 'stopped')}
                                >Stop</button>
                              </td>
                            )}
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
      </div>
    </div>
  );
}