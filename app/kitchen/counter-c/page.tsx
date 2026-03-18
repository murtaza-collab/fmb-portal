'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/kitchen-eligible';

type Session = {
  id: number;
  distributor_id: number;
  distributor_name: string;
  default_thaalis: number;
  status: string;
};

type DefaultThaali = {
  thaali_id: number;
  thaali_number: string;
  mumin_name: string;
  sf_no: string;
};

export default function CounterC() {
  const router = useRouter();
  const [sessions, setSessions]                   = useState<Session[]>([]);
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions]     = useState(true);
  const [activeSession, setActiveSession]         = useState<Session | null>(null);
  const [thaalis, setThaalis]                     = useState<DefaultThaali[]>([]);
  const [loadingThaalis, setLoadingThaalis]       = useState(false);
  const [marking, setMarking]                     = useState(false);
  const [error, setError]                         = useState('');

  const today = todayISO();

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 10000);
    return () => clearInterval(timer);
  }, []);

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

      setSessions(all.filter(s => s.status !== 'counter_c_done' && s.default_thaalis > 0));
      setCompletedSessions(all.filter(s => s.status === 'counter_c_done'));
    } finally {
      setLoadingSessions(false);
    }
  };

  const startSession = async (session: Session) => {
    setActiveSession(session);
    setError('');
    setLoadingThaalis(true);

    // Read counter_c_pending rows seeded by Counter A
    const { data: statusRows } = await supabase
      .from('thaali_daily_status')
      .select('thaali_id, thaali_number, mumin_id, status')
      .eq('session_id', session.id)
      .in('status', ['counter_c_pending', 'counter_c_filled']);

    if (!statusRows || statusRows.length === 0) {
      setThaalis([]);
      setLoadingThaalis(false);
      return;
    }

    const muminIds = statusRows.map((r: any) => r.mumin_id);
    const { data: muminRows } = await supabase
      .from('mumineen').select('id, full_name, sf_no').in('id', muminIds);

    const muminMap = new Map((muminRows || []).map((m: any) => [m.id, m]));

    setThaalis(statusRows.map((r: any) => ({
      thaali_id:     r.thaali_id,
      thaali_number: String(r.thaali_number),
      mumin_name:    muminMap.get(r.mumin_id)?.full_name || 'Unknown',
      sf_no:         muminMap.get(r.mumin_id)?.sf_no || '',
    })));

    setLoadingThaalis(false);
  };

  // One button: mark all filled + mark session done + go back
  const handleMarkAllDone = async () => {
    if (!activeSession) return;
    setMarking(true); setError('');
    try {
      // 1. Mark all thaalis filled
      await supabase.from('thaali_daily_status').upsert(
        thaalis.map(t => ({
          session_id:    activeSession.id,
          thaali_id:     t.thaali_id,
          thaali_number: t.thaali_number,
          date:          today,
          status:        'counter_c_filled',
          packed_at:     new Date().toISOString(),
        })),
        { onConflict: 'session_id,thaali_id' }
      );

      // 2. Mark session done
      await supabase
        .from('distribution_sessions')
        .update({ status: 'counter_c_done' })
        .eq('id', activeSession.id);

      // 3. Back to session list
      await loadSessions();
      setActiveSession(null);
      setThaalis([]);
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setMarking(false);
    }
  };

  // ── Session list view ─────────────────────────────────────────────────────
  if (!activeSession) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
        <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
          <div className="d-flex justify-content-between align-items-center">
            <div style={{ width: 80 }} /> {/* spacer to keep title centered */}
            <div className="text-center">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--bs-secondary-color)', textTransform: 'uppercase' }}>
                Counter C
              </div>
              <h1 className="h4 mb-0 fw-bold text-success">Default Filling</h1>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadSessions}>
              <i className="bi bi-arrow-clockwise me-1" />Refresh
            </button>
          </div>
        </div>

        <div className="container-fluid px-4 mt-4">
          <div className="alert alert-success mb-4" style={{ fontSize: '0.9rem' }}>
            <i className="bi bi-info-circle me-2" />
            Fill all default thaalis on the list, then tap <strong>All Filled — Send to Dispatch</strong>.
          </div>

          <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
            <i className="bi bi-box-seam me-2" style={{ color: '#f97316' }} />
            Ready for filling
            <span className="badge bg-primary ms-2">{sessions.length}</span>
          </h5>

          {loadingSessions ? (
            <div className="text-center py-4"><div className="spinner-border text-success" /></div>
          ) : sessions.length === 0 ? (
            <div className="alert alert-warning mb-4">
              <i className="bi bi-hourglass-split me-2" />
              No sessions waiting. Counter A must confirm first.
            </div>
          ) : (
            <div className="row g-3 mb-4">
              {sessions.map(s => (
                <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                  <div className="card border-0 shadow-sm h-100" style={{ background: 'var(--bs-body-bg)' }}>
                    <div className="card-body p-4">
                      <h5 className="fw-bold mb-1" style={{ color: 'var(--bs-success-text-emphasis)' }}>
                        {s.distributor_name}
                      </h5>
                      <div className="mb-3" style={{ color: 'var(--bs-secondary-color)', fontSize: '0.9rem' }}>
                        <i className="bi bi-box-seam me-1" />
                        {s.default_thaalis} default thaali{s.default_thaalis !== 1 ? 's' : ''}
                      </div>
                      <button className="btn btn-success w-100 fw-bold" onClick={() => startSession(s)}>
                        <i className="bi bi-play-circle me-2" />Start Filling
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {completedSessions.length > 0 && (
            <>
              <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
                <i className="bi bi-check-circle me-2 text-success" />
                Done today
                <span className="badge bg-success ms-2">{completedSessions.length}</span>
              </h5>
              <div className="row g-3">
                {completedSessions.map(s => (
                  <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                    <div className="card border-0 shadow-sm opacity-75" style={{ background: 'var(--bs-body-bg)' }}>
                      <div className="card-body p-3 d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>{s.distributor_name}</div>
                          <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{s.default_thaalis} thaalis</div>
                        </div>
                        <span className="badge bg-success"><i className="bi bi-check2 me-1" />Done</span>
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

  // ── Filling view ──────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => { setActiveSession(null); setThaalis([]); }}>
            <i className="bi bi-arrow-left me-2" />Back
          </button>
          <div className="text-center">
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--bs-secondary-color)', textTransform: 'uppercase' }}>
              Counter C
            </div>
            <h1 className="h5 mb-0 fw-bold text-success">{activeSession.distributor_name}</h1>
            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.82rem' }}>
              {thaalis.length} default thaali{thaalis.length !== 1 ? 's' : ''} to fill
            </div>
          </div>
          {/* Big action button in topbar */}
          <button
            className="btn btn-success fw-bold px-4"
            onClick={handleMarkAllDone}
            disabled={marking || loadingThaalis || thaalis.length === 0}
          >
            {marking
              ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</>
              : <><i className="bi bi-check-all me-2" />All Filled — Send to Dispatch</>
            }
          </button>
        </div>
      </div>

      <div className="container-fluid px-4 mt-4">
        {error && <div className="alert alert-danger mb-3">{error}</div>}

        {loadingThaalis ? (
          <div className="text-center py-5">
            <div className="spinner-border text-success" style={{ width: '3rem', height: '3rem' }} />
            <div className="mt-3" style={{ color: 'var(--bs-secondary-color)' }}>Loading thaalis…</div>
          </div>
        ) : thaalis.length === 0 ? (
          <div className="alert alert-info">
            <i className="bi bi-info-circle me-2" />
            No default thaalis for this session.
          </div>
        ) : (
          <>
            {/* Stat strip */}
            <div className="card border-0 shadow-sm mb-4" style={{ background: 'var(--bs-body-bg)' }}>
              <div className="card-body p-3 d-flex align-items-center gap-4 flex-wrap">
                <div className="text-center">
                  <div className="fw-bold fs-3 text-success">{thaalis.length}</div>
                  <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.8rem' }}>Total to fill</div>
                </div>
                <div style={{ flex: 1, color: 'var(--bs-secondary-color)', fontSize: '0.9rem' }}>
                  <i className="bi bi-info-circle me-2" />
                  Fill all thaalis with standard recipe — full quantity for all items. When done, tap <strong>All Filled — Send to Dispatch</strong>.
                </div>
              </div>
            </div>

            {/* Thaali list */}
            <div className="card border-0 shadow-sm" style={{ background: 'var(--bs-body-bg)' }}>
              <div className="card-header py-3"
                style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)' }}>
                <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                  Default thaalis — {activeSession.distributor_name}
                </h6>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr style={{ background: 'var(--bs-secondary-bg)' }}>
                        <th className="ps-3" style={{ color: 'var(--bs-secondary-color)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>#</th>
                        <th style={{ color: 'var(--bs-secondary-color)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Thaali</th>
                        <th style={{ color: 'var(--bs-secondary-color)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mumin name</th>
                        <th style={{ color: 'var(--bs-secondary-color)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>SF#</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thaalis.map((t, i) => (
                        <tr key={t.thaali_id}>
                          <td className="ps-3" style={{ color: 'var(--bs-secondary-color)', fontSize: 13 }}>{i + 1}</td>
                          <td className="fw-bold" style={{ color: '#364574', fontSize: 15 }}>#{t.thaali_number}</td>
                          <td style={{ color: 'var(--bs-body-color)' }}>{t.mumin_name}</td>
                          <td style={{ color: 'var(--bs-secondary-color)' }}>{t.sf_no}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Bottom CTA — same button repeated for long lists */}
            <div className="text-center mt-4 pb-4">
              <button
                className="btn btn-success btn-lg px-5 fw-bold"
                onClick={handleMarkAllDone}
                disabled={marking}
              >
                {marking
                  ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</>
                  : <><i className="bi bi-check-all me-2" />All Filled — Send to Dispatch</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}