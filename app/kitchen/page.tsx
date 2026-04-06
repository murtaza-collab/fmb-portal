'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { loadKitchenDayData, getStoppedMuminIds, todayISO } from '@/lib/kitchen-eligible';

export default function KitchenHome() {
  const [arrivedSessions, setArrivedSessions]     = useState<any[]>([]);
  const [startedSessions, setStartedSessions]     = useState<any[]>([]);
  const [completedSessions, setCompletedSessions] = useState<any[]>([]);
  const [yetToArrive, setYetToArrive]             = useState<any[]>([]);
  const [eligibleByDist, setEligibleByDist]       = useState<Record<number, number>>({});
  const [stoppedByDist, setStoppedByDist]         = useState<Record<number, number>>({});
  const [scheduleInfo, setScheduleInfo]           = useState<{ enabled: boolean; eventName: string | null; total: number } | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [demoMode, setDemoMode]                   = useState(false);

  // Check-in state
  const [showCheckin, setShowCheckin]       = useState(false);
  const [checkinId, setCheckinId]           = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError]     = useState('');
  const [checkinSuccess, setCheckinSuccess] = useState('');

  // QR / RFID scan state
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scanMode, setScanMode]           = useState<'qr' | 'rfid' | 'manual'>('manual');
  const qrScannerRef                      = useRef<any>(null);

  // Always poll every 10s — fast enough to catch biometric/scan check-ins
  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, []);

  // QR scanner lifecycle
  useEffect(() => {
    if (!showQRScanner || scanMode !== 'qr') return;
    const timer = setTimeout(async () => {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode');
        const scanner = new Html5QrcodeScanner('arrival-qr-reader', { fps: 10, qrbox: { width: 220, height: 220 } }, false);
        scanner.render(
          async (decoded: string) => {
            const distId = parseInt(decoded.replace('DIST-', '').trim());
            if (!isNaN(distId)) {
              scanner.clear().catch(() => {});
              setShowQRScanner(false);
              await doCheckin(distId);
            }
          },
          () => {}
        );
        qrScannerRef.current = scanner;
      } catch (e) { console.error('QR scanner error:', e); }
    }, 300);
    return () => {
      clearTimeout(timer);
      qrScannerRef.current?.clear().catch(() => {});
    };
  }, [showQRScanner, scanMode]);

  const loadData = async () => {
    const today = todayISO(); // always computed fresh — correct local date
    try {
      const { data: sessions } = await supabase
        .from('distribution_sessions')
        .select('id, distributor_id, total_thaalis, stopped_thaalis, status, arrived_at, distributors(id, full_name, phone_no)')
        .eq('session_date', today)
        .order('arrived_at', { ascending: false });

      const { data: distributors } = await supabase
        .from('distributors').select('id, full_name').eq('status', 'active').order('full_name');

      const [dayData, stoppedMuminIds] = await Promise.all([
        loadKitchenDayData({}),
        getStoppedMuminIds(today),
      ]);

      // Eligible count per distributor
      const byDist: Record<number, number> = {};
      for (const reg of dayData.eligible) {
        if (reg.distributor_id) byDist[reg.distributor_id] = (byDist[reg.distributor_id] || 0) + 1;
      }
      setEligibleByDist(byDist);

      // Stopped count per distributor
      if (stoppedMuminIds.size > 0) {
        const { data: stoppedRegs } = await supabase
          .from('thaali_registrations')
          .select('mumin_id, distributor_id')
          .in('mumin_id', [...stoppedMuminIds])
          .not('thaali_id', 'is', null);

        const byDistStopped: Record<number, number> = {};
        for (const reg of stoppedRegs || []) {
          if (reg.distributor_id) byDistStopped[reg.distributor_id] = (byDistStopped[reg.distributor_id] || 0) + 1;
        }
        setStoppedByDist(byDistStopped);
      } else {
        setStoppedByDist({});
      }

      setScheduleInfo({
        enabled:   dayData.schedule.thaali_enabled,
        eventName: dayData.schedule.event_name || null,
        total:     dayData.eligible.length + (dayData.schedule.extra_thaali_count || 0),
      });

      const arrivedIds = new Set(sessions?.map(s => String(s.distributor_id)) || []);

      // FIX: split into arrived (waiting for Counter A) vs started (Counter A confirmed)
      // Sort arrived ascending — first come first served
      const arrivedOnly = (sessions || [])
        .filter(s => s.status === 'arrived')
        .sort((a, b) => new Date(a.arrived_at).getTime() - new Date(b.arrived_at).getTime());

      const startedSessions = (sessions || [])
        .filter(s => ['in_progress', 'counter_b_done', 'counter_c_done', 'counter_bc_done'].includes(s.status))
        .sort((a, b) => new Date(a.arrived_at).getTime() - new Date(b.arrived_at).getTime());

      setArrivedSessions(arrivedOnly);
      setCompletedSessions(sessions?.filter(s => s.status === 'dispatched') || []);
      // Reuse completedSessions for dispatched, add startedSessions to state
      setStartedSessions(startedSessions);
      setYetToArrive((distributors || []).filter(d => !arrivedIds.has(String(d.id))));

    } catch (err) {
      console.error('Error loading kitchen data:', err);
    } finally {
      setLoading(false);
    }
  };

  const doCheckin = async (distributorId: number) => {
    setCheckinLoading(true); setCheckinError(''); setCheckinSuccess('');
    try {
      const res = await fetch('/api/kitchen/arrival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributor_id: distributorId }),
      });
      const data = await res.json();
      if (!res.ok) { setCheckinError(data.error || 'Check-in failed'); return; }
      setCheckinSuccess(`✓ ${data.distributor_name} checked in`);
      setCheckinId('');
      await loadData();
      setTimeout(() => { setCheckinSuccess(''); setShowCheckin(false); }, 3000);
    } catch (err: any) {
      setCheckinError(err.message || 'Check-in failed');
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleManualCheckin = async () => {
    if (!checkinId) return;
    await doCheckin(parseInt(checkinId, 10));
  };

  const arrivedTimeStr = (ts: string) =>
    new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const statusLabel = (status: string) => {
    switch (status) {
      case 'arrived':        return { label: 'Arrived',     cls: 'bg-warning text-dark' }
      case 'in_progress':    return { label: 'Counter A',   cls: 'bg-info text-dark'    }
      case 'counter_b_done':  return { label: 'Counter B ✓',   cls: 'bg-primary' }
      case 'counter_c_done':  return { label: 'Counter C ✓',   cls: 'bg-success' }
      case 'counter_bc_done': return { label: 'B & C Done ✓',  cls: 'bg-success' }
      case 'dispatched':     return { label: '✓ Dispatched', cls: 'bg-success'          }
      default:               return { label: status,         cls: 'bg-secondary'        }
    }
  }

  // ── Distributor Card ──────────────────────────────────────────────────────
  const DistributorCard = ({ session, done = false }: { session: any; done?: boolean }) => {
    const dist       = session.distributors;
    const eligible   = eligibleByDist[session.distributor_id] ?? 0;
    const stopped    = stoppedByDist[session.distributor_id] ?? session.stopped_thaalis ?? 0;
    const toDispatch = Math.max(0, eligible - stopped);
    const { label, cls } = statusLabel(session.status);

    return (
      <Link href={`/kitchen/counter-a/${session.distributor_id}`}
        className="text-decoration-none d-block" style={{ borderRadius: 12 }}>
        <div className="card border-0 shadow-sm" style={{
          background: 'var(--bs-body-bg)', borderRadius: 12, opacity: done ? 0.75 : 1,
          transition: 'all 0.2s', cursor: 'pointer',
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}>
          <div className="card-body p-3">
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h6 className="mb-0 fw-bold" style={{ fontSize: 15, color: '#364574' }}>{dist?.full_name || 'Unknown'}</h6>
              <span className={`badge ${cls}`} style={{ fontSize: 11 }}>{label}</span>
            </div>
            <div className="row g-0 text-center mb-3" style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--bs-border-color)' }}>
              <div className="col-4 py-2" style={{ borderRight: '1px solid var(--bs-border-color)', background: 'var(--bs-tertiary-bg)' }}>
                <div className="fw-bold" style={{ fontSize: 18, color: 'var(--bs-body-color)' }}>{eligible}</div>
                <div style={{ fontSize: 10, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Eligible</div>
              </div>
              <div className="col-4 py-2" style={{ borderRight: '1px solid var(--bs-border-color)' }}>
                <div className="fw-bold" style={{ fontSize: 18, color: stopped > 0 ? '#f06548' : 'var(--bs-body-color)' }}>{stopped}</div>
                <div style={{ fontSize: 10, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Stopped</div>
              </div>
              <div className="col-4 py-2" style={{ background: toDispatch > 0 ? '#0ab39c12' : undefined }}>
                <div className="fw-bold" style={{ fontSize: 18, color: '#0ab39c' }}>{toDispatch}</div>
                <div style={{ fontSize: 10, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>To Dispatch</div>
              </div>
            </div>
            {session.arrived_at && (
              <div className="d-flex align-items-center justify-content-between">
                <span style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                  <i className="bi bi-clock me-1" />{arrivedTimeStr(session.arrived_at)}
                </span>
                {!done && <span style={{ fontSize: 12, color: '#364574', fontWeight: 600 }}>Tap to open →</span>}
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  };

  // ── Yet to Arrive Card ────────────────────────────────────────────────────
  const WaitingCard = ({ dist }: { dist: any }) => {
    const eligible = eligibleByDist[dist.id] ?? 0;
    const stopped  = stoppedByDist[dist.id] ?? 0;
    const total    = eligible + stopped;
    return (
      <div className="card border-0 shadow-sm" style={{ background: 'var(--bs-body-bg)', borderRadius: 10 }}>
        <div className="card-body py-2 px-3 d-flex justify-content-between align-items-center">
          <div>
            <span className="fw-semibold" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>{dist.full_name}</span>
            {total > 0 ? (
              <span className="ms-2" style={{ fontSize: 12, color: '#0ab39c' }}>
                {eligible} eligible{stopped > 0 ? `, ${stopped} stopped` : ''}
              </span>
            ) : (
              <span className="ms-2" style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>No thaalis</span>
            )}
          </div>
          <span className="badge" style={{ background: 'var(--bs-secondary-bg)', color: 'var(--bs-secondary-color)', fontSize: 11 }}>
            Not arrived
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
        <h1 className="h4 mb-0" style={{ color: 'var(--bs-body-color)' }}>
          <i className="bi bi-truck me-2 text-primary" />Kitchen — Arrival
        </h1>
      </div>

      <div className="container-fluid p-4">

        {/* Demo Mode banner */}
        {demoMode && (
          <div className="mb-3 px-3 py-2 d-flex align-items-center justify-content-between flex-wrap gap-2"
            style={{ background: '#36457415', border: '1px solid #36457430', borderRadius: 10 }}>
            <div className="d-flex align-items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#364574' }}>Demo Mode — Listening for scans</span>
              <span style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                Open <code>/kitchen/scan</code> on your phone to simulate arrivals
              </span>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setDemoMode(false)} style={{ fontSize: 12 }}>
              Exit Demo
            </button>
          </div>
        )}

        {/* Schedule banner */}
        {scheduleInfo && (
          <div className="mb-3 px-3 py-2 rounded d-flex align-items-center gap-3 flex-wrap"
            style={{ background: scheduleInfo.enabled ? '#0ab39c12' : '#f0654812', border: `1px solid ${scheduleInfo.enabled ? '#0ab39c30' : '#f0654830'}`, borderRadius: 10 }}>
            <i className={`bi ${scheduleInfo.enabled ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}
              style={{ color: scheduleInfo.enabled ? '#0ab39c' : '#f06548', fontSize: 18 }} />
            <div>
              <span style={{ fontWeight: 700, color: scheduleInfo.enabled ? '#0ab39c' : '#f06548', fontSize: 14 }}>
                {scheduleInfo.enabled ? `Thaali Day — ${scheduleInfo.total} eligible thaalis` : 'No Thaali Today'}
              </span>
              {scheduleInfo.eventName && (
                <span style={{ fontSize: 12, color: 'var(--bs-secondary-color)', marginLeft: 10 }}>
                  {scheduleInfo.eventName}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Check-in Panel */}
        <div className="card border-0 shadow-sm mb-4" style={{ background: 'var(--bs-body-bg)' }}>
          <div className="card-body p-3">
            {checkinSuccess && (
              <div className="alert alert-success py-2 mb-3 d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill" style={{ fontSize: 18 }} /><strong>{checkinSuccess}</strong>
              </div>
            )}
            {checkinError && (
              <div className="alert alert-danger py-2 mb-3">
                <i className="bi bi-exclamation-triangle me-2" />{checkinError}
              </div>
            )}

            {!showCheckin ? (
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="fw-bold" style={{ color: 'var(--bs-body-color)' }}>Distributor Check-in</span>
                  {yetToArrive.length > 0 && (
                    <span className="badge bg-warning text-dark">{yetToArrive.length} yet to arrive</span>
                  )}
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  <button className="btn btn-outline-primary"
                    onClick={() => { setShowCheckin(true); setScanMode('qr'); setShowQRScanner(true); }}>
                    <i className="bi bi-qr-code-scan me-2" />Scan QR
                  </button>
                  <button className="btn btn-outline-secondary"
                    onClick={() => { setShowCheckin(true); setScanMode('rfid'); setShowQRScanner(false); }}>
                    <i className="bi bi-credit-card me-2" />RFID / Tap
                  </button>
                  <button className="btn btn-primary"
                    onClick={() => { setShowCheckin(true); setScanMode('manual'); setShowQRScanner(false); }}>
                    <i className="bi bi-keyboard me-2" />Manual
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                  <span className="fw-bold me-1" style={{ color: 'var(--bs-body-color)' }}>Check-in mode:</span>
                  {[
                    { key: 'qr',     icon: 'bi-qr-code-scan', label: 'QR Scan'    },
                    { key: 'rfid',   icon: 'bi-credit-card',  label: 'RFID / Tap' },
                    { key: 'manual', icon: 'bi-keyboard',     label: 'Manual'     },
                  ].map(m => (
                    <button key={m.key}
                      className={`btn btn-sm ${scanMode === m.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => { setScanMode(m.key as any); setShowQRScanner(m.key === 'qr'); if (m.key !== 'qr') qrScannerRef.current?.clear().catch(() => {}); }}>
                      <i className={`bi ${m.icon} me-1`} />{m.label}
                    </button>
                  ))}
                  <button className="btn btn-sm btn-outline-danger ms-auto"
                    onClick={() => { setShowCheckin(false); setCheckinId(''); setCheckinError(''); setCheckinSuccess(''); setShowQRScanner(false); qrScannerRef.current?.clear().catch(() => {}); }}>
                    <i className="bi bi-x me-1" />Cancel
                  </button>
                </div>

                {scanMode === 'qr' && (
                  <div className="text-center">
                    <div id="arrival-qr-reader" style={{ maxWidth: 280, margin: '0 auto' }} />
                    <p className="text-muted small mt-2">Point camera at distributor QR code</p>
                    <p style={{ fontSize: 11, color: 'var(--bs-secondary-color)' }}>
                      QR should encode: <code>DIST-{'{'}id{'}'}</code> e.g. <code>DIST-1</code>
                    </p>
                  </div>
                )}

                {scanMode === 'rfid' && (
                  <div>
                    <p className="text-muted small mb-3">
                      <i className="bi bi-info-circle me-1" />
                      Click a distributor below to simulate RFID tap check-in
                    </p>
                    {checkinLoading && <div className="text-center py-3"><span className="spinner-border text-primary" /></div>}
                    <div className="row g-2">
                      {yetToArrive.map(d => {
                        const el = eligibleByDist[d.id] || 0;
                        const st = stoppedByDist[d.id] || 0;
                        return (
                          <div key={d.id} className="col-12 col-sm-6 col-md-4">
                            <button className="btn w-100 text-start p-3"
                              style={{ background: 'var(--bs-body-bg)', border: '2px solid var(--bs-border-color)', borderRadius: 12, transition: 'all 0.15s' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#364574'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--bs-border-color)'}
                              disabled={checkinLoading}
                              onClick={() => doCheckin(d.id)}>
                              <div className="d-flex align-items-center gap-3">
                                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#36457420', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <i className="bi bi-person-fill" style={{ color: '#364574', fontSize: 20 }} />
                                </div>
                                <div>
                                  <div className="fw-bold" style={{ color: 'var(--bs-body-color)', fontSize: 15 }}>{d.full_name}</div>
                                  <div style={{ fontSize: 12, color: '#0ab39c' }}>
                                    {el > 0 ? `${el} eligible` : ''}{st > 0 ? `, ${st} stopped` : ''}{el === 0 && st === 0 ? 'No thaalis' : ''}
                                  </div>
                                </div>
                                <i className="bi bi-wifi ms-auto" style={{ color: '#364574', opacity: 0.4, fontSize: 18 }} />
                              </div>
                            </button>
                          </div>
                        );
                      })}
                      {yetToArrive.length === 0 && (
                        <div className="col-12"><div className="alert alert-info mb-0">All distributors have arrived.</div></div>
                      )}
                    </div>
                  </div>
                )}

                {scanMode === 'manual' && (
                  <div className="row g-3 align-items-end">
                    <div className="col-12 col-md-6">
                      <label className="form-label fw-bold mb-1" style={{ color: 'var(--bs-body-color)' }}>
                        Select Distributor
                        <span className="text-muted fw-normal ms-2 small">(yet to arrive today)</span>
                      </label>
                      <select className="form-select form-select-lg" value={checkinId} onChange={e => setCheckinId(e.target.value)}>
                        <option value="">— Select distributor —</option>
                        {yetToArrive.map(d => {
                          const el = eligibleByDist[d.id] || 0;
                          const st = stoppedByDist[d.id] || 0;
                          const label = el > 0 || st > 0 ? ` (${el} eligible${st > 0 ? `, ${st} stopped` : ''})` : ' (0 thaalis)';
                          return <option key={d.id} value={d.id}>{d.full_name}{label}</option>;
                        })}
                        {yetToArrive.length === 0 && <option disabled>All distributors have arrived</option>}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <button className="btn btn-success btn-lg w-100" onClick={handleManualCheckin} disabled={!checkinId || checkinLoading}>
                        {checkinLoading ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-check-circle me-2" />Check In</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
        ) : (
          <>
            {/* Yet to arrive — TOP */}
            {yetToArrive.length > 0 && (
              <>
                <h2 className="h5 mb-3 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                  <i className="bi bi-hourglass me-2" style={{ color: 'var(--bs-secondary-color)' }} />
                  Yet to Arrive
                  <span className="badge bg-secondary ms-2">{yetToArrive.length}</span>
                </h2>
                <div className="row g-2 mb-4">
                  {yetToArrive.map(d => (
                    <div className="col-12 col-md-6 col-lg-4" key={d.id}>
                      <WaitingCard dist={d} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Arrived — waiting for Counter A, first come first */}
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h2 className="h5 mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                <i className="bi bi-person-walking me-2 text-warning" />
                Arrived
                <span className="badge bg-warning text-dark ms-2">{arrivedSessions.length}</span>
              </h2>
              <div className="d-flex gap-2">
                {!demoMode && (
                  <button className="btn btn-sm"
                    onClick={() => setDemoMode(true)}
                    style={{ background: '#36457415', color: '#364574', border: '1px solid #36457430', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                    <i className="bi bi-broadcast me-1" />Demo Mode
                  </button>
                )}
                <button className="btn btn-sm btn-outline-secondary" onClick={loadData}>
                  <i className="bi bi-arrow-clockwise me-1" />Refresh
                </button>
              </div>
            </div>

            {arrivedSessions.length === 0 ? (
              <div className="alert alert-info mb-4">
                <i className="bi bi-info-circle me-2" />No distributors waiting for Counter A.
              </div>
            ) : (
              <div className="row g-3 mb-4">
                {arrivedSessions.map(s => (
                  <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                    <DistributorCard session={s} />
                  </div>
                ))}
              </div>
            )}

            {/* Started — Counter A confirmed, being filled */}
            {startedSessions.length > 0 && (
              <>
                <h2 className="h5 mb-3 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                  <i className="bi bi-cup-hot me-2" style={{ color: '#ffbf69' }} />
                  Being Filled
                  <span className="badge ms-2" style={{ background: '#ffbf69', color: '#212529' }}>{startedSessions.length}</span>
                </h2>
                <div className="row g-3 mb-4">
                  {startedSessions.map(s => (
                    <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                      <DistributorCard session={s} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Dispatched today */}
            {completedSessions.length > 0 && (
              <>
                <h2 className="h5 mb-3 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                  <i className="bi bi-check-circle me-2 text-success" />
                  Dispatched Today
                  <span className="badge bg-success ms-2">{completedSessions.length}</span>
                </h2>
                <div className="row g-3">
                  {completedSessions.map(s => (
                    <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                      <DistributorCard session={s} done />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

if (typeof document !== 'undefined') {
  const id = 'fmb-pulse-style';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }';
    document.head.appendChild(s);
  }
}