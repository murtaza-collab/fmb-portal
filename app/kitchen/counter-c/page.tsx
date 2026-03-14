'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { loadKitchenDayData, todayISO } from '@/lib/kitchen-eligible';

type View = 'sessions' | 'filling' | 'tally';

type DefaultThaali = {
  registration_id: number;
  thaali_id: number;
  thaali_number: string;
  mumin_id: number;
  mumin_name: string;
  sf_no: string;
  filled: boolean;
  reconciled: boolean;
  missing: boolean;
};

type Session = {
  id: number;
  distributor_id: number;
  distributor_name: string;
  default_thaalis: number;
  status: string;
};

export default function CounterC() {
  const [view, setView] = useState<View>('sessions');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const [thaalis, setThaalis] = useState<DefaultThaali[]>([]);
  const [loadingThaalis, setLoadingThaalis] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [allMarked, setAllMarked] = useState(false);
  const [error, setError] = useState('');
  const [completingSession, setCompletingSession] = useState(false);

  const today = todayISO();

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const { data } = await supabase
        .from('distribution_sessions')
        .select('id, distributor_id, default_thaalis, status, distributors(full_name)')
        .eq('session_date', today)
        .in('status', ['in_progress', 'arrived', 'counter_b_done', 'counter_c_done']);

      const all = (data || []).map((s: any) => ({
        id: s.id,
        distributor_id: s.distributor_id,
        distributor_name: s.distributors?.full_name || 'Unknown',
        default_thaalis: s.default_thaalis || 0,
        status: s.status,
      }));

      setSessions(all.filter(s => s.status !== 'counter_c_done'));
      setCompletedSessions(all.filter(s => s.status === 'counter_c_done'));
    } finally {
      setLoadingSessions(false);
    }
  };

  // ── startSession — uses kitchen-eligible for correct eligible list ──────────
  const startSession = async (session: Session) => {
    setActiveSession(session);
    setAllMarked(false);
    setError('');
    setLoadingThaalis(true);

    try {
      // 1. Get schedule-filtered eligible list (HOF, correct niyyat, not stopped, has thaali)
      const { eligible, noThaaliDay } = await loadKitchenDayData({
        distributorId: session.distributor_id,
      });

      if (noThaaliDay || eligible.length === 0) {
        setThaalis([]);
        setView('filling');
        setLoadingThaalis(false);
        return;
      }

      // 2. Fetch today's customizations — Counter C only handles NON-customized
      const muminIds = eligible.map(r => r.mumin_id);
      const { data: customRes } = await supabase
        .from('thaali_customizations')
        .select('mumin_id')
        .in('mumin_id', muminIds)
        .eq('request_date', today)
        .eq('status', 'active');

      const customizedMuminIds = new Set(customRes?.map((c: any) => c.mumin_id) || []);

      // 3. Default = eligible but not customized
      const defaults: DefaultThaali[] = eligible
        .filter(r => !customizedMuminIds.has(r.mumin_id))
        .map(r => ({
          registration_id: r.registration_id,
          thaali_id: r.thaali_id,
          thaali_number: String(r.thaali_number),
          mumin_id: r.mumin_id,
          mumin_name: r.full_name,
          sf_no: r.sf_no,
          filled: false,
          reconciled: false,
          missing: false,
        }));

      setThaalis(defaults);
      setView('filling');
    } catch (err: any) {
      setError(err.message || 'Failed to load session');
    } finally {
      setLoadingThaalis(false);
    }
  };

  const handleMarkAllFilled = async () => {
    if (!activeSession || thaalis.length === 0) return;
    setMarkingAll(true);
    setError('');
    try {
      await supabase.from('thaali_daily_status').upsert(
        thaalis.map(t => ({
          session_id: activeSession.id,
          thaali_id: t.thaali_id,
          mumin_id: t.mumin_id,
          date: today,
          status: 'counter_c_filled',
          packed_at: new Date().toISOString(),
        })),
        { onConflict: 'session_id,thaali_id' }
      );
      setThaalis(prev => prev.map(t => ({ ...t, filled: true })));
      setAllMarked(true);
    } catch (err: any) {
      setError(err.message || 'Failed to mark as filled');
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleMissing = (thaaliId: number) => {
    setThaalis(prev => prev.map(t =>
      t.thaali_id === thaaliId ? { ...t, missing: !t.missing, reconciled: false } : t
    ));
  };

  const toggleReconciled = (thaaliId: number) => {
    setThaalis(prev => prev.map(t =>
      t.thaali_id === thaaliId ? { ...t, reconciled: !t.reconciled, missing: false } : t
    ));
  };

  const handleMarkSessionDone = async () => {
    if (!activeSession) return;
    setCompletingSession(true);
    try {
      await supabase
        .from('distribution_sessions')
        .update({ status: 'counter_c_done' })
        .eq('id', activeSession.id);
      await loadSessions();
      setView('sessions');
      setActiveSession(null);
      setThaalis([]);
      setAllMarked(false);
    } catch (err: any) {
      setError(err.message || 'Failed to complete session');
    } finally {
      setCompletingSession(false);
    }
  };

  const tallyFilled   = thaalis.filter(t => t.filled && !t.missing);
  const tallyMissing  = thaalis.filter(t => t.missing);
  const tallyUnfilled = thaalis.filter(t => !t.filled && !t.reconciled && !t.missing);
  const allAccountedFor = tallyUnfilled.length === 0;

  // ─── VIEW: SESSIONS ────────────────────────────────────────────────────────
  if (view === 'sessions') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
        <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px', marginBottom: '1.5rem' }}>
          <div className="d-flex justify-content-between align-items-center">
            <Link href="/kitchen" className="btn btn-outline-secondary">
              <i className="bi bi-arrow-left me-2"></i>Back
            </Link>
            <h1 className="h4 mb-0 fw-bold text-success">
              <i className="bi bi-box-seam me-2"></i>Counter C — Default Filling
            </h1>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadSessions}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>

        <div className="container-fluid px-4">
          <div className="alert alert-success mb-4" style={{ fontSize: '0.9rem' }}>
            <i className="bi bi-info-circle me-2"></i>
            Counter C fills all <strong>default thaalis</strong> — eligible mumineen with no customization request today.
          </div>

          <h5 className="fw-bold mb-3">
            <i className="bi bi-person-walking me-2 text-warning"></i>
            Awaiting Counter C
            <span className="badge bg-primary ms-2">{sessions.length}</span>
          </h5>

          {loadingSessions ? (
            <div className="text-center py-4"><div className="spinner-border text-success"></div></div>
          ) : sessions.length === 0 ? (
            <div className="alert alert-warning mb-4">
              <i className="bi bi-exclamation-triangle me-2"></i>
              No active sessions. Counter A must confirm a distributor first.
            </div>
          ) : (
            <div className="row g-3 mb-4">
              {sessions.map(s => (
                <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                  <div className="card border-0 shadow-sm h-100" style={{ background: 'var(--bs-body-bg)' }}>
                    <div className="card-body p-4">
                      <h5 className="fw-bold mb-1 text-success">{s.distributor_name}</h5>
                      <div className="mb-3">
                        <span style={{ color: 'var(--bs-secondary-color)', fontSize: '0.9rem' }}>
                          <i className="bi bi-box-seam me-1"></i>
                          {s.default_thaalis} default thaalis to fill
                        </span>
                      </div>
                      <button className="btn btn-success w-100 fw-bold" onClick={() => startSession(s)}>
                        <i className="bi bi-play-circle me-2"></i>Start Filling
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {completedSessions.length > 0 && (
            <>
              <h5 className="fw-bold mb-3">
                <i className="bi bi-check-circle me-2 text-success"></i>
                Done Today
                <span className="badge bg-success ms-2">{completedSessions.length}</span>
              </h5>
              <div className="row g-3">
                {completedSessions.map(s => (
                  <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                    <div className="card border-0 shadow-sm opacity-75" style={{ background: 'var(--bs-body-bg)' }}>
                      <div className="card-body p-3 d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>{s.distributor_name}</div>
                          <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{s.default_thaalis} default thaalis</div>
                        </div>
                        <span className="badge bg-success"><i className="bi bi-check2 me-1"></i>Done</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── VIEW: FILLING ─────────────────────────────────────────────────────────
  if (view === 'filling') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
        <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px', marginBottom: '1.5rem' }}>
          <div className="d-flex justify-content-between align-items-center">
            <button className="btn btn-outline-secondary" onClick={() => setView('sessions')}>
              <i className="bi bi-arrow-left me-2"></i>Back
            </button>
            <h1 className="h4 mb-0 fw-bold text-success">
              Counter C — {activeSession?.distributor_name}
            </h1>
            {allMarked
              ? <button className="btn btn-success fw-bold" onClick={() => setView('tally')}>
                  <i className="bi bi-list-check me-2"></i>Tally &amp; Done
                </button>
              : <div style={{ width: 120 }} />
            }
          </div>
        </div>

        <div className="container-fluid px-4">
          {error && <div className="alert alert-danger mb-3">{error}</div>}

          {loadingThaalis ? (
            <div className="text-center py-5">
              <div className="spinner-border text-success" style={{ width: '3rem', height: '3rem' }}></div>
              <div className="mt-3" style={{ color: 'var(--bs-secondary-color)' }}>Loading thaalis...</div>
            </div>
          ) : (
            <>
              <div className="row g-3 mb-4">
                {[
                  { label: 'Total Default', value: thaalis.length,                   color: 'success' },
                  { label: 'Filled',        value: thaalis.filter(t => t.filled).length, color: 'primary' },
                  { label: 'Remaining',     value: thaalis.filter(t => !t.filled).length, color: 'warning' },
                  { label: 'Complete',      value: `${thaalis.length > 0 ? Math.round((thaalis.filter(t => t.filled).length / thaalis.length) * 100) : 0}%`, color: 'info' },
                ].map(stat => (
                  <div className="col-6 col-md-3" key={stat.label}>
                    <div className="card border-0 shadow-sm text-center p-3" style={{ background: 'var(--bs-body-bg)' }}>
                      <div className={`display-6 fw-bold text-${stat.color}`}>{stat.value}</div>
                      <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {thaalis.length === 0 ? (
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  No default thaalis for this distributor today — all eligible mumineen have customization requests or today is a no-thaali day.
                </div>
              ) : !allMarked ? (
                <>
                  <div className="card border-0 shadow-sm mb-4" style={{ background: 'var(--bs-body-bg)' }}>
                    <div className="card-body p-4">
                      <div className="row align-items-center">
                        <div className="col-md-8">
                          <h5 className="fw-bold mb-1" style={{ color: 'var(--bs-body-color)' }}>Ready to fill all default thaalis?</h5>
                          <p style={{ color: 'var(--bs-secondary-color)' }} className="mb-0">
                            Standard recipe — full quantity for all <strong>{thaalis.length} thaalis</strong>.
                          </p>
                        </div>
                        <div className="col-md-4 mt-3 mt-md-0">
                          <button className="btn btn-success btn-lg w-100 fw-bold"
                            onClick={handleMarkAllFilled} disabled={markingAll}>
                            {markingAll
                              ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                              : <><i className="bi bi-check-all me-2"></i>Mark All {thaalis.length} Filled</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card border-0 shadow-sm" style={{ background: 'var(--bs-body-bg)' }}>
                    <div className="card-header py-3 d-flex justify-content-between"
                      style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)' }}>
                      <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Default Thaalis List</h6>
                      <span style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{thaalis.length} total</span>
                    </div>
                    <div className="card-body p-0" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table className="table table-hover table-sm mb-0">
                        <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                          <tr>
                            <th className="ps-3">Thaali #</th><th>Mumin Name</th><th>SF#</th><th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {thaalis.map(t => (
                            <tr key={t.registration_id} className={t.filled ? 'table-success' : ''}>
                              <td className="ps-3 fw-bold">#{t.thaali_number}</td>
                              <td style={{ color: 'var(--bs-body-color)' }}>{t.mumin_name}</td>
                              <td style={{ color: 'var(--bs-secondary-color)' }}>{t.sf_no}</td>
                              <td>
                                {t.filled
                                  ? <span className="badge bg-success"><i className="bi bi-check me-1"></i>Filled</span>
                                  : <span className="badge bg-secondary">Default</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card border-0 shadow-sm" style={{ border: '2px solid #16a34a', background: 'var(--bs-body-bg)' }}>
                  <div className="card-body p-5 text-center">
                    <div style={{ fontSize: '4rem' }}>✅</div>
                    <h3 className="text-success fw-bold mt-3">All {thaalis.length} Default Thaalis Filled!</h3>
                    <p style={{ color: 'var(--bs-secondary-color)' }} className="mb-4">
                      Do a quick tally count before marking this session as done.
                    </p>
                    <button className="btn btn-success btn-lg px-5 fw-bold" onClick={() => setView('tally')}>
                      <i className="bi bi-list-check me-2"></i>Proceed to Tally
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── VIEW: TALLY ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px', marginBottom: '1.5rem' }}>
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => setView('filling')}>
            <i className="bi bi-arrow-left me-2"></i>Back
          </button>
          <div className="text-center">
            <h1 className="h4 mb-0 fw-bold text-success">
              <i className="bi bi-list-check me-2"></i>Tally — {activeSession?.distributor_name}
            </h1>
            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>Count physical thaalis against this list</div>
          </div>
          <button className="btn btn-success btn-lg fw-bold px-4"
            onClick={handleMarkSessionDone}
            disabled={completingSession || !allAccountedFor}>
            {completingSession
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Completing...</>
              : <><i className="bi bi-check-circle me-2"></i>Mark Session Done</>
            }
          </button>
        </div>
      </div>

      <div className="container-fluid px-4">
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Default', value: thaalis.length,      color: 'success' },
            { label: 'Filled ✓',     value: tallyFilled.length,   color: 'success' },
            { label: 'Not Filled',   value: tallyUnfilled.length, color: 'warning' },
            { label: 'Missing',      value: tallyMissing.length,  color: 'danger'  },
          ].map(stat => (
            <div className="col-6 col-md-3" key={stat.label}>
              <div className="card border-0 shadow-sm text-center p-3" style={{ background: 'var(--bs-body-bg)' }}>
                <div className={`display-6 fw-bold text-${stat.color}`}>{stat.value}</div>
                <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {allAccountedFor ? (
          <div className="alert alert-success mb-4">
            <i className="bi bi-check-circle-fill me-2"></i>
            <strong>All thaalis accounted for.</strong> You can now mark this session as done.
          </div>
        ) : (
          <div className="alert alert-warning mb-4">
            <i className="bi bi-exclamation-triangle me-2"></i>
            <strong>{tallyUnfilled.length} thaali{tallyUnfilled.length > 1 ? 's' : ''} not filled.</strong>
            {' '}Mark each as <strong>Found</strong> or <strong>Missing</strong> to proceed.
          </div>
        )}

        <div className="card border-0 shadow-sm mb-4" style={{ background: 'var(--bs-body-bg)' }}>
          <div className="card-header py-3 d-flex justify-content-between"
            style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)' }}>
            <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Default Thaalis — Physical Count</h6>
            <span style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{tallyFilled.length}/{thaalis.length} accounted for</span>
          </div>
          <div className="card-body p-0">
            {thaalis.length === 0 ? (
              <div className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>
                <i className="bi bi-inbox fs-2 d-block mb-2"></i>No default thaalis
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Thaali #</th><th>Mumin Name</th><th>SF#</th><th>Status</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thaalis.map(t => (
                      <tr key={t.thaali_id} className={
                        t.missing ? 'table-danger' : t.reconciled ? 'table-warning' : t.filled ? 'table-success' : ''
                      }>
                        <td className="ps-3 fw-bold">#{t.thaali_number}</td>
                        <td style={{ color: 'var(--bs-body-color)' }}>{t.mumin_name}</td>
                        <td style={{ color: 'var(--bs-secondary-color)' }}>{t.sf_no}</td>
                        <td>
                          {t.missing    ? <span className="badge bg-danger">Missing</span> :
                           t.reconciled ? <span className="badge bg-warning text-dark">Reconciled</span> :
                           t.filled     ? <span className="badge bg-success"><i className="bi bi-check me-1"></i>Filled</span> :
                                          <span className="badge bg-secondary">Not Filled</span>}
                        </td>
                        <td>
                          {!t.filled && !t.reconciled && !t.missing && (
                            <div className="d-flex gap-2">
                              <button className="btn btn-sm btn-outline-success" onClick={() => toggleReconciled(t.thaali_id)}>
                                <i className="bi bi-check2 me-1"></i>Found
                              </button>
                              <button className="btn btn-sm btn-outline-danger" onClick={() => toggleMissing(t.thaali_id)}>
                                <i className="bi bi-x me-1"></i>Missing
                              </button>
                            </div>
                          )}
                          {(t.reconciled || t.missing) && (
                            <button className="btn btn-sm btn-outline-secondary"
                              onClick={() => setThaalis(prev => prev.map(ti =>
                                ti.thaali_id === t.thaali_id ? { ...ti, reconciled: false, missing: false } : ti
                              ))}>
                              Undo
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="text-center pb-4">
          <button className="btn btn-success btn-lg px-5 fw-bold"
            onClick={handleMarkSessionDone} disabled={completingSession || !allAccountedFor}>
            {completingSession
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Completing...</>
              : <><i className="bi bi-check-circle me-2"></i>Mark Session Done — Next Distributor</>
            }
          </button>
          {!allAccountedFor && (
            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem', marginTop: 8 }}>
              Resolve {tallyUnfilled.length} unfilled thaali{tallyUnfilled.length > 1 ? 's' : ''} above first
            </div>
          )}
        </div>
      </div>
    </div>
  );
}