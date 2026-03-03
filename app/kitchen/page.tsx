'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function KitchenHome() {
  const [arrivedSessions, setArrivedSessions] = useState<any[]>([]);
  const [completedSessions, setCompletedSessions] = useState<any[]>([]);
  const [allDistributors, setAllDistributors] = useState<any[]>([]);
  const [yetToArrive, setYetToArrive] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [today] = useState(new Date().toISOString().split('T')[0]);

  // Check-in state
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinId, setCheckinId] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState('');
  const [checkinSuccess, setCheckinSuccess] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadData();
    const refreshInterval = setInterval(loadData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  const loadData = async () => {
    try {
      // 1. Load all today's sessions
      const { data: sessions } = await supabase
        .from('distribution_sessions')
        .select(`
          id,
          distributor_id,
          total_thaalis,
          stopped_thaalis,
          customized_thaalis,
          default_thaalis,
          status,
          arrived_at,
          distributors (
            id,
            full_name,
            phone_no
          )
        `)
        .eq('session_date', today)
        .order('arrived_at', { ascending: false });

      const arrived = sessions?.filter(s =>
        ['arrived', 'pending', 'in_progress'].includes(s.status)
      ) || [];
      const completed = sessions?.filter(s =>
        ['completed', 'dispatched'].includes(s.status)
      ) || [];

      setArrivedSessions(arrived);
      setCompletedSessions(completed);

      // 2. Load all active distributors
      const { data: distributors } = await supabase
        .from('distributors')
        .select('id, full_name')
        .eq('status', 'active')
        .order('full_name');

      setAllDistributors(distributors || []);

      // 3. Compute yet to arrive — active distributors with no session today
      const arrivedIds = new Set(sessions?.map(s => s.distributor_id) || []);
      const notArrived = (distributors || []).filter(d => !arrivedIds.has(d.id));
      setYetToArrive(notArrived);

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheckin = async () => {
    if (!checkinId) return;
    setCheckinLoading(true);
    setCheckinError('');
    setCheckinSuccess('');

    try {
      const res = await fetch('/api/kitchen/arrival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributor_id: parseInt(checkinId, 10) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCheckinError(data.error || 'Check-in failed');
        return;
      }

      setCheckinSuccess(`${data.distributor_name} checked in — card appears below`);
      setCheckinId('');
      await loadData();

      setTimeout(() => {
        setCheckinSuccess('');
        setShowCheckin(false);
      }, 3000);

    } catch (err: any) {
      setCheckinError(err.message || 'Check-in failed');
    } finally {
      setCheckinLoading(false);
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const arrivedTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const DistributorCard = ({ session, done = false }: { session: any; done?: boolean }) => {
    const distributor = session.distributors;
    const net = (session.total_thaalis || 0) - (session.stopped_thaalis || 0);
    return (
      <Link
        href={`/kitchen/counter-a/${session.distributor_id}`}
        className={`card border-0 shadow-sm text-decoration-none d-block dist-card ${done ? 'opacity-75' : ''}`}
      >
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <h3 className="h6 mb-0 fw-bold text-primary">
              {distributor?.full_name || 'Unknown'}
            </h3>
            <span className={`badge ${
              session.status === 'dispatched' ? 'bg-success' :
              session.status === 'completed' ? 'bg-secondary' :
              session.status === 'in_progress' ? 'bg-info text-dark' :
              'bg-warning text-dark'
            }`}>
              {session.status === 'dispatched' ? '✓ Dispatched' :
               session.status === 'completed' ? '✓ Done' :
               session.status === 'in_progress' ? 'In Progress' :
               'Arrived'}
            </span>
          </div>
          <div className="row g-1 text-center mb-2">
            <div className="col-4">
              <div className="fw-bold">{session.total_thaalis || 0}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Total</div>
            </div>
            <div className="col-4">
              <div className="fw-bold text-danger">{session.stopped_thaalis || 0}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Stopped</div>
            </div>
            <div className="col-4">
              <div className="fw-bold text-success">{net}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>To Dispatch</div>
            </div>
          </div>
          {session.arrived_at && (
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
              <i className="bi bi-clock me-1"></i>{arrivedTime(session.arrived_at)}
              {!done && <span className="text-primary ms-2">→ Tap to open</span>}
            </div>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="min-vh-100 bg-light">
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-3">
        <div className="d-flex justify-content-between align-items-center">
          <h1 className="h4 mb-0">
            <i className="bi bi-truck me-2 text-primary"></i>
            Kitchen — Arrival
          </h1>
          <div className="text-end">
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDate(currentTime)}</div>
            <div className="fw-bold fs-5">{formatTime(currentTime)}</div>
          </div>
        </div>
      </div>

      <div className="container-fluid p-4">

        {/* Check-in Panel */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-3">
            {!showCheckin ? (
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="fw-bold">Distributor Check-in</span>
                  <span className="text-muted ms-2 small">Manual entry — fallback if scan fails</span>
                  {yetToArrive.length > 0 && (
                    <span className="badge bg-warning text-dark ms-2">
                      {yetToArrive.length} yet to arrive
                    </span>
                  )}
                </div>
                <button className="btn btn-primary" onClick={() => setShowCheckin(true)}>
                  <i className="bi bi-plus-circle me-2"></i>Check In
                </button>
              </div>
            ) : (
              <div>
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold mb-1">
                      Select Distributor
                      <span className="text-muted fw-normal ms-2 small">(yet to arrive today)</span>
                    </label>
                    <select
                      className="form-select form-select-lg"
                      value={checkinId}
                      onChange={e => setCheckinId(e.target.value)}
                    >
                      <option value="">— Select distributor —</option>
                      {yetToArrive.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name}</option>
                      ))}
                      {yetToArrive.length === 0 && (
                        <option disabled>All distributors have arrived</option>
                      )}
                    </select>
                    <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                      Or type ID directly:
                      <input
                        type="number"
                        className="form-control form-control-sm mt-1"
                        placeholder="Enter distributor ID manually"
                        value={checkinId}
                        onChange={e => setCheckinId(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleManualCheckin()}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <button
                      className="btn btn-success btn-lg w-100"
                      onClick={handleManualCheckin}
                      disabled={!checkinId || checkinLoading}
                    >
                      {checkinLoading
                        ? <span className="spinner-border spinner-border-sm"></span>
                        : <><i className="bi bi-check-circle me-2"></i>Check In</>
                      }
                    </button>
                  </div>
                  <div className="col-6 col-md-3">
                    <button
                      className="btn btn-outline-secondary btn-lg w-100"
                      onClick={() => {
                        setShowCheckin(false);
                        setCheckinId('');
                        setCheckinError('');
                        setCheckinSuccess('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                {checkinError && (
                  <div className="alert alert-danger mt-3 mb-0 py-2">
                    <i className="bi bi-exclamation-triangle me-2"></i>{checkinError}
                  </div>
                )}
                {checkinSuccess && (
                  <div className="alert alert-success mt-3 mb-0 py-2">
                    <i className="bi bi-check-circle me-2"></i>{checkinSuccess}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary"></div>
          </div>
        ) : (
          <>
            {/* Section 1 — Arrived / In Progress */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h5 mb-0 fw-bold">
                <i className="bi bi-person-walking me-2 text-warning"></i>
                Arrived — Awaiting Counter A
                <span className="badge bg-primary ms-2">{arrivedSessions.length}</span>
              </h2>
              <button className="btn btn-sm btn-outline-secondary" onClick={loadData}>
                <i className="bi bi-arrow-clockwise me-1"></i>Refresh
              </button>
            </div>

            {arrivedSessions.length === 0 ? (
              <div className="alert alert-info mb-4">
                <i className="bi bi-info-circle me-2"></i>
                No distributors have arrived yet. Use Check In above.
              </div>
            ) : (
              <div className="row g-3 mb-4">
                {arrivedSessions.map(session => (
                  <div className="col-12 col-md-6 col-lg-4" key={session.id}>
                    <DistributorCard session={session} />
                  </div>
                ))}
              </div>
            )}

            {/* Section 2 — Yet to Arrive */}
            {yetToArrive.length > 0 && (
              <>
                <h2 className="h5 mb-3 fw-bold">
                  <i className="bi bi-hourglass me-2 text-secondary"></i>
                  Yet to Arrive
                  <span className="badge bg-secondary ms-2">{yetToArrive.length}</span>
                </h2>
                <div className="row g-2 mb-4">
                  {yetToArrive.map(d => (
                    <div className="col-12 col-md-6 col-lg-4" key={d.id}>
                      <div className="card border-0 bg-white shadow-sm">
                        <div className="card-body py-2 px-3 d-flex justify-content-between align-items-center">
                          <span className="fw-semibold text-muted">{d.full_name}</span>
                          <span className="badge bg-light text-secondary border">Not arrived</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Section 3 — Done Today */}
            {completedSessions.length > 0 && (
              <>
                <h2 className="h5 mb-3 fw-bold">
                  <i className="bi bi-check-circle me-2 text-success"></i>
                  Done Today
                  <span className="badge bg-success ms-2">{completedSessions.length}</span>
                </h2>
                <div className="row g-3">
                  {completedSessions.map(session => (
                    <div className="col-12 col-md-6 col-lg-4" key={session.id}>
                      <DistributorCard session={session} done={true} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .dist-card {
          transition: all 0.2s;
          cursor: pointer;
        }
        .dist-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.12) !important;
        }
      `}</style>
    </div>
  );
}