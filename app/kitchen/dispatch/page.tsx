'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/kitchen-eligible';

// ─── Types ───────────────────────────────────────────────────────────────────

type View = 'sessions' | 'handover';

type SessionRow = {
  id: number;
  distributor_id: number;
  distributor_name: string;
  distributor_phone: string;
  total_thaalis: number;
  stopped_thaalis: number;
  customized_thaalis: number;
  default_thaalis: number;
  status: string;
  arrived_at: string;
  counter_b_done: boolean;
  counter_c_done: boolean;
  ready: boolean;
};

type ThaaliDetail = {
  thaali_id: number;
  thaali_number: string;
  mumin_name: string;
  sf_no: string;
  type: 'customized' | 'default' | 'stopped';
  filled: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dispatch() {
  const [view, setView]           = useState<View>('sessions');
  const [sessions, setSessions]   = useState<SessionRow[]>([]);
  const [dispatched, setDispatched] = useState<SessionRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const [activeSession, setActiveSession]   = useState<SessionRow | null>(null);
  const [thaalis, setThaalis]               = useState<ThaaliDetail[]>([]);
  const [loadingDetail, setLoadingDetail]   = useState(false);
  const [confirming, setConfirming]         = useState(false);
  const [showDispatchedToday, setShowDispatchedToday] = useState(false);

  const today = todayISO();

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 10000);
    return () => clearInterval(timer);
  }, []);

  // ─── loadSessions ──────────────────────────────────────────────────────────
  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('distribution_sessions')
        .select(`
          id, distributor_id, total_thaalis, stopped_thaalis,
          customized_thaalis, default_thaalis, status, arrived_at,
          distributors(full_name, phone_no)
        `)
        .eq('session_date', today)
        .order('arrived_at', { ascending: true });

      if (err) throw err;

      const rows = (data || []).map((s: any) => {
        const isDispatched  = s.status === 'dispatched';
        // Counter A confirms by moving status from 'arrived' → 'in_progress'
        // Until that happens, customized/default counts are 0 and meaningless.
        const counterADone  = s.status !== 'arrived';
        // B is done only if no customized thaalis, OR status has passed counter_b_done stage
        const bDone = counterADone && (
          s.customized_thaalis === 0 ||
          ['counter_b_done', 'dispatched'].includes(s.status)
        );
        // C is done only if no default thaalis, OR status has reached counter_c_done
        const cDone = counterADone && (
          s.default_thaalis === 0 ||
          ['counter_c_done', 'dispatched'].includes(s.status)
        );
        return {
          id:                  s.id,
          distributor_id:      s.distributor_id,
          distributor_name:    s.distributors?.full_name || 'Unknown',
          distributor_phone:   s.distributors?.phone_no || '',
          total_thaalis:       s.total_thaalis || 0,
          stopped_thaalis:     s.stopped_thaalis || 0,
          customized_thaalis:  s.customized_thaalis || 0,
          default_thaalis:     s.default_thaalis || 0,
          status:              s.status,
          arrived_at:          s.arrived_at,
          counter_b_done:      bDone,
          counter_c_done:      cDone,
          ready:               counterADone && bDone && cDone && !isDispatched,
        };
      });

      setSessions(rows.filter(r => r.status !== 'dispatched'));
      setDispatched(rows.filter(r => r.status === 'dispatched'));
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  // ─── openSession ───────────────────────────────────────────────────────────
  // Counter A seeded thaali_daily_status with the authoritative list.
  // Read it directly — no eligibility re-check needed.
  const openSession = async (session: SessionRow) => {
    setActiveSession(session);
    setLoadingDetail(true);
    setView('handover');
    setError('');

    try {
      // 1. All status rows for this session
      const { data: statusRows } = await supabase
        .from('thaali_daily_status')
        .select('thaali_id, thaali_number, mumin_id, status')
        .eq('session_id', session.id);

      if (!statusRows || statusRows.length === 0) {
        setThaalis([]);
        setLoadingDetail(false);
        return;
      }

      // 2. Mumin names in one query
      const muminIds = statusRows.map((r: any) => r.mumin_id);
      const { data: muminRows } = await supabase
        .from('mumineen')
        .select('id, full_name, sf_no')
        .in('id', muminIds);

      const muminMap = new Map((muminRows || []).map((m: any) => [m.id, m]));

      // 3. Map status → display type
      //    counter_b_pending / counter_b_filled → customized
      //    counter_c_pending / counter_c_filled → default
      //    stopped                              → stopped
      const statusToType = (status: string): 'customized' | 'default' | 'stopped' => {
        if (status === 'stopped')                                      return 'stopped';
        if (status === 'counter_b_pending' || status === 'counter_b_filled') return 'customized';
        return 'default';
      };

      const isFilled = (status: string) =>
        status === 'counter_b_filled' || status === 'counter_c_filled';

      const details: ThaaliDetail[] = statusRows.map((r: any) => ({
        thaali_id:     r.thaali_id,
        thaali_number: String(r.thaali_number),
        mumin_name:    muminMap.get(r.mumin_id)?.full_name || 'Unknown',
        sf_no:         muminMap.get(r.mumin_id)?.sf_no || '',
        type:          statusToType(r.status),
        filled:        isFilled(r.status),
      }));

      // Sort: customized → default → stopped
      details.sort((a, b) => {
        const order = { customized: 0, default: 1, stopped: 2 };
        return order[a.type] - order[b.type];
      });

      setThaalis(details);
    } catch (err: any) {
      setError(err.message || 'Failed to load thaali details');
    } finally {
      setLoadingDetail(false);
    }
  };

  // ─── confirmDispatch ───────────────────────────────────────────────────────
  const confirmDispatch = async () => {
    if (!activeSession) return;
    setConfirming(true);
    setError('');
    try {
      await supabase
        .from('distribution_sessions')
        .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
        .eq('id', activeSession.id);
      await loadSessions();
      setView('sessions');
      setActiveSession(null);
      setThaalis([]);
    } catch (err: any) {
      setError(err.message || 'Failed to confirm dispatch');
    } finally {
      setConfirming(false);
    }
  };

  const arrivedTime = (ts: string) =>
    ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';

  const netThaalis = (s: SessionRow) => (s.total_thaalis || 0) - (s.stopped_thaalis || 0);

  const readySessions      = sessions.filter(s => s.ready);
  const atCounterASessions = sessions.filter(s => s.status === 'arrived');
  const pendingSessions    = sessions.filter(s => !s.ready && s.status !== 'arrived');

  const stoppedCount    = thaalis.filter(t => t.type === 'stopped').length;
  const toDispatchCount = thaalis.filter(t => t.type !== 'stopped').length;
  const filledCount     = thaalis.filter(t => t.filled && t.type !== 'stopped').length;

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: SESSIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'sessions') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

        {/* Topbar */}
        <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
          <div className="d-flex justify-content-between align-items-center">
            <div style={{ width: 80 }} />
            <div className="text-center">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--bs-secondary-color)', textTransform: 'uppercase' }}>
                Dispatch
              </div>
              <h1 className="h4 mb-0 fw-bold" style={{ color: '#f59e0b' }}>
                Final Handover
              </h1>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadSessions}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>

        <div className="container-fluid px-4 mt-4">
          {error && <div className="alert alert-danger mb-3">{error}</div>}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" style={{ color: '#f59e0b' }}></div>
            </div>
          ) : (
            <>
              {/* Ready to dispatch */}
              <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
                <i className="bi bi-check-circle me-2 text-success"></i>
                Ready to dispatch
                <span className="badge bg-success ms-2">{readySessions.length}</span>
              </h5>

              {readySessions.length === 0 ? (
                <div className="alert alert-info mb-4" style={{ fontSize: '0.9rem' }}>
                  <i className="bi bi-hourglass me-2"></i>
                  No sessions fully ready yet. Waiting for Counter B and C to complete.
                </div>
              ) : (
                <div className="row g-3 mb-4">
                  {readySessions.map(s => (
                    <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                      <div className="card border-0 shadow-sm h-100"
                        style={{ cursor: 'pointer', background: 'var(--bs-body-bg)' }}
                        onClick={() => openSession(s)}>
                        <div className="card-body p-4">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h5 className="fw-bold mb-0" style={{ color: 'var(--bs-success-text-emphasis)' }}>
                              {s.distributor_name}
                            </h5>
                            <span className="badge bg-success"><i className="bi bi-check2 me-1"></i>Ready</span>
                          </div>
                          {s.distributor_phone && (
                            <div className="mb-2" style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                              <i className="bi bi-telephone me-1"></i>{s.distributor_phone}
                            </div>
                          )}
                          <div className="row g-2 text-center mb-3">
                            <div className="col-4">
                              <div className="fw-bold" style={{ color: 'var(--bs-body-color)' }}>{netThaalis(s)}</div>
                              <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.7rem' }}>To dispatch</div>
                            </div>
                            <div className="col-4">
                              <div className="fw-bold text-info">{s.customized_thaalis}</div>
                              <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.7rem' }}>Customized</div>
                            </div>
                            <div className="col-4">
                              <div className="fw-bold text-danger">{s.stopped_thaalis}</div>
                              <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.7rem' }}>Stopped</div>
                            </div>
                          </div>
                          <div className="d-flex gap-2 mb-3" style={{ fontSize: '0.75rem' }}>
                            <span className={`badge ${s.counter_b_done || s.customized_thaalis === 0 ? 'bg-success' : 'bg-warning text-dark'}`}>
                              {s.customized_thaalis === 0 ? 'B: N/A' : s.counter_b_done ? 'B: Done ✓' : 'B: Pending'}
                            </span>
                            <span className={`badge ${s.counter_c_done || s.default_thaalis === 0 ? 'bg-success' : 'bg-warning text-dark'}`}>
                              {s.default_thaalis === 0 ? 'C: N/A' : s.counter_c_done ? 'C: Done ✓' : 'C: Pending'}
                            </span>
                            <span className="badge bg-secondary">
                              <i className="bi bi-clock me-1"></i>{arrivedTime(s.arrived_at)}
                            </span>
                          </div>
                          <button className="btn btn-success w-100 fw-bold">
                            <i className="bi bi-truck me-2"></i>Open handover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* At Counter A — not yet confirmed by Counter A */}
              {atCounterASessions.length > 0 && (
                <>
                  <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
                    <i className="bi bi-stopwatch me-2" style={{ color: '#364574' }}></i>
                    At Counter A
                    <span className="badge ms-2" style={{ background: '#364574' }}>{atCounterASessions.length}</span>
                  </h5>
                  <div className="row g-3 mb-4">
                    {atCounterASessions.map(s => (
                      <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                        <div className="card border-0 shadow-sm opacity-75 h-100"
                          style={{ background: 'var(--bs-body-bg)', borderLeft: '3px solid #364574' }}>
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <h6 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>
                                {s.distributor_name}
                              </h6>
                              <span className="badge text-white" style={{ background: '#364574' }}>
                                <i className="bi bi-hourglass-split me-1"></i>Counter A
                              </span>
                            </div>
                            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                              <i className="bi bi-clock me-1"></i>Arrived {arrivedTime(s.arrived_at)}
                            </div>
                            <div className="mt-2" style={{ color: 'var(--bs-secondary-color)', fontSize: '0.8rem' }}>
                              Waiting for Counter A to confirm &amp; send
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Still being filled — Counter A done, B/C in progress */}
              {pendingSessions.length > 0 && (
                <>
                  <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
                    <i className="bi bi-hourglass me-2 text-warning"></i>
                    Being filled
                    <span className="badge bg-warning text-dark ms-2">{pendingSessions.length}</span>
                  </h5>
                  <div className="row g-3 mb-4">
                    {pendingSessions.map(s => (
                      <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                        <div className="card border-0 shadow-sm opacity-75 h-100"
                          style={{ cursor: 'pointer', background: 'var(--bs-body-bg)' }}
                          onClick={() => openSession(s)}>
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <h6 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>
                                {s.distributor_name}
                              </h6>
                              <span className="badge bg-warning text-dark">Pending</span>
                            </div>
                            <div className="d-flex gap-2 flex-wrap mb-2" style={{ fontSize: '0.75rem' }}>
                              <span className={`badge ${s.counter_b_done || s.customized_thaalis === 0 ? 'bg-success' : 'bg-danger'}`}>
                                {s.customized_thaalis === 0 ? 'B: N/A' : s.counter_b_done ? 'B: Done ✓' : `B: ${s.customized_thaalis} pending`}
                              </span>
                              <span className={`badge ${s.counter_c_done || s.default_thaalis === 0 ? 'bg-success' : 'bg-danger'}`}>
                                {s.default_thaalis === 0 ? 'C: N/A' : s.counter_c_done ? 'C: Done ✓' : `C: ${s.default_thaalis} pending`}
                              </span>
                            </div>
                            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                              <i className="bi bi-clock me-1"></i>Arrived {arrivedTime(s.arrived_at)}
                              <span className="ms-2">· {netThaalis(s)} thaalis</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Dispatched today (collapsible) */}
              {dispatched.length > 0 && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-3 mt-2"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowDispatchedToday(p => !p)}>
                    <h5 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>
                      <i className="bi bi-check-circle-fill me-2 text-success"></i>
                      Dispatched today
                      <span className="badge bg-success ms-2">{dispatched.length}</span>
                    </h5>
                    <i className={`bi bi-chevron-${showDispatchedToday ? 'up' : 'down'}`}
                      style={{ color: 'var(--bs-secondary-color)' }}></i>
                  </div>
                  {showDispatchedToday && (
                    <div className="row g-3">
                      {dispatched.map(s => (
                        <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                          <div className="card border-0 shadow-sm opacity-75" style={{ background: 'var(--bs-body-bg)' }}>
                            <div className="card-body p-3 d-flex justify-content-between align-items-center">
                              <div>
                                <div className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>
                                  {s.distributor_name}
                                </div>
                                <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                                  {netThaalis(s)} dispatched · arrived {arrivedTime(s.arrived_at)}
                                </div>
                              </div>
                              <span className="badge bg-success"><i className="bi bi-truck me-1"></i>Dispatched</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {sessions.length === 0 && dispatched.length === 0 && (
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  No sessions today. Distributors appear here after checking in at the kitchen arrival.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: HANDOVER
  // ══════════════════════════════════════════════════════════════════════════
  const isReady = activeSession?.ready || false;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

      {/* Topbar */}
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary"
            onClick={() => { setView('sessions'); setActiveSession(null); }}>
            <i className="bi bi-arrow-left me-2"></i>Back
          </button>
          <div className="text-center">
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--bs-secondary-color)', textTransform: 'uppercase' }}>
              Dispatch — Handover
            </div>
            <h1 className="h4 mb-0 fw-bold" style={{ color: '#f59e0b' }}>
              {activeSession?.distributor_name}
            </h1>
            {activeSession?.distributor_phone && (
              <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                <i className="bi bi-telephone me-1"></i>{activeSession.distributor_phone}
              </div>
            )}
          </div>
          <span className={`badge fs-6 px-3 py-2 ${isReady ? 'bg-success' : 'bg-warning text-dark'}`}>
            {isReady ? '✓ Ready' : '⏳ Pending'}
          </span>
        </div>
      </div>

      <div className="container-fluid px-4 mt-4">
        {error && <div className="alert alert-danger mb-3">{error}</div>}

        {loadingDetail ? (
          <div className="text-center py-5">
            <div className="spinner-border" style={{ color: '#f59e0b' }}></div>
            <div className="mt-3" style={{ color: 'var(--bs-secondary-color)' }}>Loading session details…</div>
          </div>
        ) : (
          <>
            {/* Summary stat cards */}
            <div className="row g-3 mb-4">
              {[
                { label: 'Total',       value: thaalis.length,        color: 'primary'                                      },
                { label: 'To dispatch', value: toDispatchCount,       color: 'success'                                      },
                { label: 'Customized',  value: activeSession?.customized_thaalis || 0, color: 'info'             },
                { label: 'Default',     value: activeSession?.default_thaalis    || 0, color: 'secondary'        },
                { label: 'Stopped',     value: stoppedCount,          color: 'danger'                                       },
                { label: 'Filled',      value: filledCount,           color: filledCount === toDispatchCount ? 'success' : 'warning' },
              ].map(stat => (
                <div className="col-6 col-md-4 col-lg-2" key={stat.label}>
                  <div className="card border-0 shadow-sm text-center p-3" style={{ background: 'var(--bs-body-bg)' }}>
                    <div className={`display-6 fw-bold text-${stat.color}`}>{stat.value}</div>
                    <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Counter status row */}
            <div className="card border-0 shadow-sm mb-4" style={{ background: 'var(--bs-body-bg)' }}>
              <div className="card-body p-3">
                <div className="row g-3">
                  {[
                    {
                      done:  activeSession?.counter_b_done || activeSession?.customized_thaalis === 0,
                      na:    activeSession?.customized_thaalis === 0,
                      label: 'Counter B',
                      count: activeSession?.customized_thaalis || 0,
                      unit:  'customized',
                    },
                    {
                      done:  activeSession?.counter_c_done || activeSession?.default_thaalis === 0,
                      na:    activeSession?.default_thaalis === 0,
                      label: 'Counter C',
                      count: activeSession?.default_thaalis || 0,
                      unit:  'default',
                    },
                  ].map(c => (
                    <div className="col-md-4" key={c.label}>
                      <div className={`p-3 rounded text-center ${c.done ? 'bg-success bg-opacity-10 border border-success' : 'bg-warning bg-opacity-10 border border-warning'}`}>
                        <div className="fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                          {c.na
                            ? <><i className="bi bi-dash-circle me-2 text-secondary"></i>{c.label} — N/A</>
                            : c.done
                            ? <><i className="bi bi-check-circle-fill me-2 text-success"></i>{c.label} — Done</>
                            : <><i className="bi bi-hourglass me-2 text-warning"></i>{c.label} — Pending</>
                          }
                        </div>
                        <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                          {c.count} {c.unit} thaalis
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="col-md-4">
                    <div className={`p-3 rounded text-center ${stoppedCount === 0 ? 'bg-success bg-opacity-10 border border-success' : 'bg-danger bg-opacity-10 border border-danger'}`}>
                      <div className="fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                        {stoppedCount === 0
                          ? <><i className="bi bi-check-circle me-2 text-success"></i>No stopped thaalis</>
                          : <><i className="bi bi-x-circle-fill me-2 text-danger"></i>{stoppedCount} stopped — back to store</>
                        }
                      </div>
                      <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                        Do not dispatch stopped thaalis
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm dispatch / waiting banner */}
            {isReady ? (
              <div className="card border-0 shadow-sm mb-4"
                style={{ borderLeft: '4px solid var(--bs-success)', background: 'var(--bs-body-bg)' }}>
                <div className="card-body p-4">
                  <div className="row align-items-center">
                    <div className="col-md-8">
                      <h5 className="fw-bold mb-1" style={{ color: 'var(--bs-success-text-emphasis)' }}>
                        <i className="bi bi-check-circle-fill me-2"></i>
                        All {toDispatchCount} thaalis ready for handover
                      </h5>
                      <p className="mb-0" style={{ color: 'var(--bs-secondary-color)' }}>
                        Distributor <strong style={{ color: 'var(--bs-body-color)' }}>{activeSession?.distributor_name}</strong> should verify the count before you confirm.
                      </p>
                    </div>
                    <div className="col-md-4 mt-3 mt-md-0">
                      <button className="btn btn-success btn-lg w-100 fw-bold"
                        onClick={confirmDispatch} disabled={confirming}>
                        {confirming
                          ? <><span className="spinner-border spinner-border-sm me-2"></span>Confirming…</>
                          : <><i className="bi bi-truck me-2"></i>Confirm dispatch</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card border-0 shadow-sm mb-4"
                style={{ borderLeft: '4px solid #d97706', background: 'var(--bs-body-bg)' }}>
                <div className="card-body p-4">
                  <h5 className="fw-bold mb-2" style={{ color: 'var(--bs-warning-text-emphasis)' }}>
                    <i className="bi bi-hourglass me-2"></i>Not ready to dispatch yet
                  </h5>
                  <p className="mb-3" style={{ color: 'var(--bs-secondary-color)' }}>
                    Waiting for counters to finish before this session can be dispatched.
                  </p>
                  <div className="d-flex gap-2 flex-wrap">
                    {!(activeSession?.counter_b_done || activeSession?.customized_thaalis === 0) && (
                      <Link href="/kitchen/counter-b" className="btn btn-outline-info btn-sm">
                        <i className="bi bi-clipboard-check me-1"></i>Go to Counter B
                      </Link>
                    )}
                    {!(activeSession?.counter_c_done || activeSession?.default_thaalis === 0) && (
                      <Link href="/kitchen/counter-c" className="btn btn-outline-success btn-sm">
                        <i className="bi bi-box-seam me-1"></i>Go to Counter C
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Thaali list */}
            <div className="card border-0 shadow-sm" style={{ background: 'var(--bs-body-bg)' }}>
              <div className="card-header py-3 d-flex justify-content-between"
                style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)' }}>
                <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                  <i className="bi bi-list-ul me-2"></i>Thaali list
                </h6>
                <div className="d-flex gap-2" style={{ fontSize: '0.8rem' }}>
                  <span className="badge bg-info text-dark">
                    {thaalis.filter(t => t.type === 'customized').length} custom
                  </span>
                  <span className="badge bg-secondary">
                    {thaalis.filter(t => t.type === 'default').length} default
                  </span>
                  {stoppedCount > 0 && (
                    <span className="badge bg-danger">{stoppedCount} stopped</span>
                  )}
                </div>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {thaalis.length === 0 ? (
                  <div className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>
                    <i className="bi bi-inbox fs-2 d-block mb-2"></i>
                    No thaalis found for this session
                  </div>
                ) : (
                  <table className="table table-hover table-sm mb-0">
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bs-secondary-bg)' }}>
                      <tr>
                        <th className="ps-3" style={{ color: 'var(--bs-body-color)' }}>Thaali #</th>
                        <th style={{ color: 'var(--bs-body-color)' }}>Mumin name</th>
                        <th style={{ color: 'var(--bs-body-color)' }}>SF#</th>
                        <th style={{ color: 'var(--bs-body-color)' }}>Type</th>
                        <th style={{ color: 'var(--bs-body-color)' }}>Filled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thaalis.map(t => (
                        <tr key={t.thaali_id} className={
                          t.type === 'stopped' ? 'table-danger' : t.filled ? 'table-success' : ''
                        }>
                          <td className="ps-3 fw-bold" style={{ color: 'var(--bs-body-color)' }}>#{t.thaali_number}</td>
                          <td style={{ color: 'var(--bs-body-color)' }}>{t.mumin_name}</td>
                          <td style={{ color: 'var(--bs-secondary-color)' }}>{t.sf_no}</td>
                          <td>
                            <span className={`badge ${
                              t.type === 'stopped'    ? 'bg-danger' :
                              t.type === 'customized' ? 'bg-info text-dark' : 'bg-secondary'
                            }`}>
                              {t.type === 'stopped' ? '✕ Stopped' :
                               t.type === 'customized' ? 'Customized' : 'Default'}
                            </span>
                          </td>
                          <td>
                            {t.type === 'stopped'
                              ? <span style={{ color: 'var(--bs-danger-text-emphasis)', fontSize: '0.85rem' }}>Return to store</span>
                              : t.filled
                              ? <span className="badge bg-success"><i className="bi bi-check me-1"></i>Filled</span>
                              : <span className="badge bg-warning text-dark">Pending</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}