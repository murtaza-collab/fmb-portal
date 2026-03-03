'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

export default function Dispatch() {
  const [view, setView] = useState<View>('sessions');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [dispatched, setDispatched] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active session detail
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [thaalis, setThaalis] = useState<ThaaliDetail[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showDispatchedToday, setShowDispatchedToday] = useState(false);

  const [today] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { loadSessions(); }, []);

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
        const bDone = s.customized_thaalis === 0 ||
                      ['counter_b_done', 'counter_c_done', 'dispatched'].includes(s.status);
        const cDone = s.default_thaalis === 0 ||
                      ['counter_c_done', 'dispatched'].includes(s.status);
        // Actually check status more carefully
        const isDispatched = s.status === 'dispatched';
        return {
          id: s.id,
          distributor_id: s.distributor_id,
          distributor_name: s.distributors?.full_name || 'Unknown',
          distributor_phone: s.distributors?.phone_no || '',
          total_thaalis: s.total_thaalis || 0,
          stopped_thaalis: s.stopped_thaalis || 0,
          customized_thaalis: s.customized_thaalis || 0,
          default_thaalis: s.default_thaalis || 0,
          status: s.status,
          arrived_at: s.arrived_at,
          counter_b_done: bDone,
          counter_c_done: cDone,
          ready: (bDone && cDone) && !isDispatched,
          isDispatched,
        };
      });

      setSessions(rows.filter((r: any) => r.status !== 'dispatched'));
      setDispatched(rows.filter((r: any) => r.status === 'dispatched'));
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const openSession = async (session: SessionRow) => {
    setActiveSession(session);
    setLoadingDetail(true);
    setView('handover');
    setError('');

    try {
      const distId = session.distributor_id;

      const { data: registrations } = await supabase
        .from('thaali_registrations')
        .select('id, thaali_id, mumin_id')
        .eq('distributor_id', distId)
        .eq('status', 'approved');

      if (!registrations?.length) { setThaalis([]); setLoadingDetail(false); return; }

      const thaaliIds = registrations.map(r => r.thaali_id);
      const muminIds = registrations.map(r => r.mumin_id);

      const [thaaliRes, muminRes, customRes, stopRes, filledRes] = await Promise.all([
        supabase.from('thaalis').select('id, thaali_number').in('id', thaaliIds),
        supabase.from('mumineen').select('id, full_name, sf_no').in('id', muminIds),
        supabase.from('thaali_customizations')
          .select('mumin_id')
          .in('mumin_id', muminIds)
          .eq('request_date', today)
          .eq('status', 'active'),
        supabase.from('stop_thaalis')
          .select('thaali_id')
          .in('thaali_id', thaaliIds)
          .lte('stop_date', today)
          .or(`resume_date.is.null,resume_date.gt.${today}`),
        supabase.from('thaali_daily_status')
          .select('thaali_id, status')
          .eq('session_id', session.id),
      ]);

      const thaaliMap = new Map(thaaliRes.data?.map(t => [t.id, t]) || []);
      const muminMap = new Map(muminRes.data?.map(m => [m.id, m]) || []);
      const customizedIds = new Set(customRes.data?.map(c => c.mumin_id) || []);
      const stoppedIds = new Set(stopRes.data?.map(s => s.thaali_id) || []);
      const filledIds = new Set(filledRes.data?.map(f => f.thaali_id) || []);

      const details: ThaaliDetail[] = registrations.map(r => {
        const thaali = thaaliMap.get(r.thaali_id);
        const mumin = muminMap.get(r.mumin_id);
        const type: 'customized' | 'default' | 'stopped' =
          stoppedIds.has(r.thaali_id) ? 'stopped' :
          customizedIds.has(r.mumin_id) ? 'customized' : 'default';
        return {
          thaali_id: r.thaali_id,
          thaali_number: thaali?.thaali_number || String(r.thaali_id),
          mumin_name: mumin?.full_name || 'Unknown',
          sf_no: mumin?.sf_no || '',
          type,
          filled: filledIds.has(r.thaali_id),
        };
      });

      // Sort: customized first, then default, stopped last
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

  const confirmDispatch = async () => {
    if (!activeSession) return;
    setConfirming(true);
    setError('');
    try {
      await supabase
        .from('distribution_sessions')
        .update({
          status: 'dispatched',
          dispatched_at: new Date().toISOString(),
        })
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

  const netThaalis = (s: SessionRow) =>
    (s.total_thaalis || 0) - (s.stopped_thaalis || 0);

  const readySessions = sessions.filter(s => (s as any).ready);
  const pendingSessions = sessions.filter(s => !(s as any).ready);

  const filledCount = thaalis.filter(t => t.filled).length;
  const stoppedCount = thaalis.filter(t => t.type === 'stopped').length;
  const toDispatchCount = thaalis.filter(t => t.type !== 'stopped').length;

  // ─────────────────────────────────────────────
  // VIEW: SESSIONS
  // ─────────────────────────────────────────────
  if (view === 'sessions') {
    return (
      <div className="min-vh-100 bg-light">
        <div className="bg-white border-bottom px-4 py-3 mb-4">
          <div className="d-flex justify-content-between align-items-center">
            <Link href="/kitchen" className="btn btn-outline-secondary">
              <i className="bi bi-arrow-left me-2"></i>Back
            </Link>
            <h1 className="h4 mb-0 fw-bold" style={{ color: '#f59e0b' }}>
              <i className="bi bi-truck me-2"></i>
              Dispatch — Final Handover
            </h1>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadSessions}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>

        <div className="container-fluid px-4">
          {error && <div className="alert alert-danger mb-3">{error}</div>}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" style={{ color: '#f59e0b' }}></div>
            </div>
          ) : (
            <>
              {/* ── READY TO DISPATCH */}
              <h5 className="fw-bold mb-3">
                <i className="bi bi-check-circle me-2 text-success"></i>
                Ready to Dispatch
                <span className="badge bg-success ms-2">{readySessions.length}</span>
              </h5>

              {readySessions.length === 0 ? (
                <div className="alert alert-info mb-4" style={{ fontSize: '0.9rem' }}>
                  <i className="bi bi-hourglass me-2"></i>
                  No sessions fully ready yet. Waiting for Counter B and Counter C to complete.
                </div>
              ) : (
                <div className="row g-3 mb-4">
                  {readySessions.map(s => (
                    <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                      <div
                        className="card border-0 shadow-sm h-100"
                        style={{ cursor: 'pointer', borderLeft: '4px solid #16a34a !important' }}
                        onClick={() => openSession(s)}
                      >
                        <div className="card-body p-4">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h5 className="fw-bold mb-0 text-success">{s.distributor_name}</h5>
                            <span className="badge bg-success">
                              <i className="bi bi-check2 me-1"></i>Ready
                            </span>
                          </div>
                          {s.distributor_phone && (
                            <div className="text-muted small mb-2">
                              <i className="bi bi-telephone me-1"></i>{s.distributor_phone}
                            </div>
                          )}
                          <div className="row g-2 text-center mb-3">
                            <div className="col-4">
                              <div className="fw-bold">{netThaalis(s)}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>To Dispatch</div>
                            </div>
                            <div className="col-4">
                              <div className="fw-bold text-info">{s.customized_thaalis}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Customized</div>
                            </div>
                            <div className="col-4">
                              <div className="fw-bold text-danger">{s.stopped_thaalis}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Stopped</div>
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
                            <i className="bi bi-truck me-2"></i>Open Handover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── PENDING */}
              {pendingSessions.length > 0 && (
                <>
                  <h5 className="fw-bold mb-3">
                    <i className="bi bi-hourglass me-2 text-warning"></i>
                    Still Being Filled
                    <span className="badge bg-warning text-dark ms-2">{pendingSessions.length}</span>
                  </h5>
                  <div className="row g-3 mb-4">
                    {pendingSessions.map(s => (
                      <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                        <div
                          className="card border-0 shadow-sm opacity-75 h-100"
                          style={{ cursor: 'pointer' }}
                          onClick={() => openSession(s)}
                        >
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <h6 className="fw-bold mb-0">{s.distributor_name}</h6>
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
                            <div className="text-muted small">
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

              {/* ── DISPATCHED TODAY */}
              {dispatched.length > 0 && (
                <>
                  <div
                    className="d-flex justify-content-between align-items-center mb-3 mt-2"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowDispatchedToday(p => !p)}
                  >
                    <h5 className="fw-bold mb-0">
                      <i className="bi bi-check-circle-fill me-2 text-success"></i>
                      Dispatched Today
                      <span className="badge bg-success ms-2">{dispatched.length}</span>
                    </h5>
                    <i className={`bi bi-chevron-${showDispatchedToday ? 'up' : 'down'} text-muted`}></i>
                  </div>
                  {showDispatchedToday && (
                    <div className="row g-3">
                      {dispatched.map(s => (
                        <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                          <div className="card border-0 bg-white shadow-sm opacity-75">
                            <div className="card-body p-3 d-flex justify-content-between align-items-center">
                              <div>
                                <div className="fw-semibold">{s.distributor_name}</div>
                                <div className="text-muted small">
                                  {netThaalis(s)} dispatched · arrived {arrivedTime(s.arrived_at)}
                                </div>
                              </div>
                              <span className="badge bg-success">
                                <i className="bi bi-truck me-1"></i>Dispatched
                              </span>
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
                  No sessions today. Distributors appear here after checking in at Counter A.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // VIEW: HANDOVER
  // ─────────────────────────────────────────────
  const isReady = activeSession ? (activeSession as any).ready : false;

  return (
    <div className="min-vh-100 bg-light">
      <div className="bg-white border-bottom px-4 py-3 mb-4">
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => { setView('sessions'); setActiveSession(null); }}>
            <i className="bi bi-arrow-left me-2"></i>Back
          </button>
          <div className="text-center">
            <h1 className="h4 mb-0 fw-bold" style={{ color: '#f59e0b' }}>
              <i className="bi bi-truck me-2"></i>
              Handover — {activeSession?.distributor_name}
            </h1>
            {activeSession?.distributor_phone && (
              <div className="text-muted small">
                <i className="bi bi-telephone me-1"></i>{activeSession.distributor_phone}
              </div>
            )}
          </div>
          <span className={`badge fs-6 px-3 py-2 ${isReady ? 'bg-success' : 'bg-warning text-dark'}`}>
            {isReady ? '✓ Ready' : '⏳ Pending'}
          </span>
        </div>
      </div>

      <div className="container-fluid px-4">
        {error && <div className="alert alert-danger mb-3">{error}</div>}

        {loadingDetail ? (
          <div className="text-center py-5">
            <div className="spinner-border" style={{ color: '#f59e0b' }}></div>
            <div className="mt-3 text-muted">Loading session details...</div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="row g-3 mb-4">
              {[
                { label: 'Total Registered', value: activeSession?.total_thaalis || 0, color: 'primary' },
                { label: 'To Dispatch', value: toDispatchCount, color: 'success' },
                { label: 'Customized', value: activeSession?.customized_thaalis || 0, color: 'info' },
                { label: 'Default', value: activeSession?.default_thaalis || 0, color: 'secondary' },
                { label: 'Stopped', value: stoppedCount, color: 'danger' },
                { label: 'Filled', value: filledCount, color: filledCount === toDispatchCount ? 'success' : 'warning' },
              ].map(stat => (
                <div className="col-6 col-md-4 col-lg-2" key={stat.label}>
                  <div className="card border-0 shadow-sm text-center p-3">
                    <div className={`display-6 fw-bold text-${stat.color}`}>{stat.value}</div>
                    <div className="small text-muted">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Counter status */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-3">
                <div className="row g-3">
                  <div className="col-md-4">
                    <div className={`p-3 rounded text-center ${activeSession?.counter_b_done || activeSession?.customized_thaalis === 0 ? 'bg-success bg-opacity-10 border border-success' : 'bg-warning bg-opacity-10 border border-warning'}`}>
                      <div className="fw-bold">
                        {activeSession?.customized_thaalis === 0 ? (
                          <><i className="bi bi-dash-circle me-2 text-secondary"></i>Counter B — N/A</>
                        ) : activeSession?.counter_b_done ? (
                          <><i className="bi bi-check-circle-fill me-2 text-success"></i>Counter B — Done</>
                        ) : (
                          <><i className="bi bi-hourglass me-2 text-warning"></i>Counter B — Pending</>
                        )}
                      </div>
                      <div className="text-muted small">{activeSession?.customized_thaalis || 0} customized thaalis</div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className={`p-3 rounded text-center ${activeSession?.counter_c_done || activeSession?.default_thaalis === 0 ? 'bg-success bg-opacity-10 border border-success' : 'bg-warning bg-opacity-10 border border-warning'}`}>
                      <div className="fw-bold">
                        {activeSession?.default_thaalis === 0 ? (
                          <><i className="bi bi-dash-circle me-2 text-secondary"></i>Counter C — N/A</>
                        ) : activeSession?.counter_c_done ? (
                          <><i className="bi bi-check-circle-fill me-2 text-success"></i>Counter C — Done</>
                        ) : (
                          <><i className="bi bi-hourglass me-2 text-warning"></i>Counter C — Pending</>
                        )}
                      </div>
                      <div className="text-muted small">{activeSession?.default_thaalis || 0} default thaalis</div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className={`p-3 rounded text-center ${stoppedCount === 0 ? 'bg-light' : 'bg-danger bg-opacity-10 border border-danger'}`}>
                      <div className="fw-bold">
                        {stoppedCount === 0 ? (
                          <><i className="bi bi-check-circle me-2 text-success"></i>No Stopped Thaalis</>
                        ) : (
                          <><i className="bi bi-x-circle-fill me-2 text-danger"></i>{stoppedCount} Stopped — Back to Store</>
                        )}
                      </div>
                      <div className="text-muted small">Do not dispatch stopped thaalis</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm dispatch */}
            {isReady ? (
              <div className="card border-0 shadow-sm border-success border-2 mb-4">
                <div className="card-body p-4">
                  <div className="row align-items-center">
                    <div className="col-md-8">
                      <h5 className="fw-bold mb-1 text-success">
                        <i className="bi bi-check-circle-fill me-2"></i>
                        All {toDispatchCount} thaalis ready for handover
                      </h5>
                      <p className="text-muted mb-0">
                        Distributor <strong>{activeSession?.distributor_name}</strong> should verify
                        the count before you confirm. Once confirmed this session is complete.
                      </p>
                    </div>
                    <div className="col-md-4 mt-3 mt-md-0">
                      <button
                        className="btn btn-success btn-lg w-100 fw-bold"
                        onClick={confirmDispatch}
                        disabled={confirming}
                      >
                        {confirming ? (
                          <><span className="spinner-border spinner-border-sm me-2"></span>Confirming...</>
                        ) : (
                          <><i className="bi bi-truck me-2"></i>Confirm Dispatch</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card border-0 shadow-sm border-warning border-2 mb-4">
                <div className="card-body p-4">
                  <h5 className="fw-bold mb-2 text-warning">
                    <i className="bi bi-hourglass me-2"></i>
                    Not ready to dispatch yet
                  </h5>
                  <p className="text-muted mb-3">
                    Waiting for counters to complete filling before this session can be dispatched.
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

            {/* Thaali detail list */}
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                <h6 className="mb-0 fw-bold">
                  <i className="bi bi-list-ul me-2"></i>Thaali List
                </h6>
                <div className="d-flex gap-2" style={{ fontSize: '0.8rem' }}>
                  <span className="badge bg-info text-dark">{thaalis.filter(t => t.type === 'customized').length} custom</span>
                  <span className="badge bg-secondary">{thaalis.filter(t => t.type === 'default').length} default</span>
                  {stoppedCount > 0 && <span className="badge bg-danger">{stoppedCount} stopped</span>}
                </div>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {thaalis.length === 0 ? (
                  <div className="text-center py-4 text-muted">No thaalis found</div>
                ) : (
                  <table className="table table-hover table-sm mb-0">
                    <thead className="table-light sticky-top">
                      <tr>
                        <th className="ps-3">Thaali #</th>
                        <th>Mumin Name</th>
                        <th>SF#</th>
                        <th>Type</th>
                        <th>Filled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thaalis.map(t => (
                        <tr
                          key={t.thaali_id}
                          className={
                            t.type === 'stopped' ? 'table-danger' :
                            t.filled ? 'table-success' : ''
                          }
                        >
                          <td className="ps-3 fw-bold">#{t.thaali_number}</td>
                          <td>{t.mumin_name}</td>
                          <td className="text-muted">{t.sf_no}</td>
                          <td>
                            <span className={`badge ${
                              t.type === 'stopped' ? 'bg-danger' :
                              t.type === 'customized' ? 'bg-info text-dark' : 'bg-secondary'
                            }`}>
                              {t.type === 'stopped' ? '✕ Stopped' :
                               t.type === 'customized' ? 'Customized' : 'Default'}
                            </span>
                          </td>
                          <td>
                            {t.type === 'stopped' ? (
                              <span className="text-danger small">Return to store</span>
                            ) : t.filled ? (
                              <span className="badge bg-success">
                                <i className="bi bi-check me-1"></i>Filled
                              </span>
                            ) : (
                              <span className="badge bg-warning text-dark">Pending</span>
                            )}
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