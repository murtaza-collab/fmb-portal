'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Html5QrcodeScanner } from 'html5-qrcode';

const QTY_MAP: Record<string, { label: string; bg: string; text: string }> = {
  full:       { label: 'Full',         bg: '#1a7a4a', text: '#fff' },
  half:       { label: 'Medium',       bg: '#f97316', text: '#fff' },
  quarter:    { label: 'Less',         bg: '#dc2626', text: '#fff' },
  not_needed: { label: 'Not Required', bg: '#6b7280', text: '#fff' },
};

const MENU_ITEMS = [
  { key: 'mithas',  label: 'Mithas'      },
  { key: 'tarkari', label: 'Tarkari'     },
  { key: 'soup',    label: 'Daal / Soup' },
  { key: 'chawal',  label: 'Chawal'      },
  { key: 'roti',    label: 'Roti'        },
];

const QUANTITIES = ['full', 'half', 'quarter', 'not_needed'];

type View = 'sessions' | 'scanning' | 'tally';

type ScannedThaali = {
  thaali_number: string;
  thaali_id: number;
  mumin_id: number;
  mumin_name: string;
  sf_no: string;
  distributor_name: string;
  session_id: number;
  type: 'customized' | 'default' | 'stopped';
  customization: any;
  todayMenu: any;
};

type TallyItem = {
  thaali_number: string;
  thaali_id: number;
  mumin_name: string;
  sf_no: string;
  customization: any;
  filled: boolean;
  reconciled: boolean;
  missing: boolean;
};

type Session = {
  id: number;
  distributor_id: number;
  distributor_name: string;
  customized_thaalis: number;
  status: string;
};

export default function CounterB() {
  const [view, setView] = useState<View>('sessions');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  // Scanning state
  const [current, setCurrent] = useState<ScannedThaali | null>(null);
  const [previous, setPrevious] = useState<ScannedThaali | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState('');
  const [filledThaalis, setFilledThaalis] = useState<ScannedThaali[]>([]);

  // Tally state
  const [tallyItems, setTallyItems] = useState<TallyItem[]>([]);
  const [completingSession, setCompletingSession] = useState(false);

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const [today] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    if (view !== 'scanning') return;
    const timer = setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          'qr-reader-b',
          { fps: 10, qrbox: { width: 220, height: 220 } },
          false
        );
        scanner.render(
          (decoded) => handleScan(decoded.replace('THAALI-', '').trim()),
          () => {}
        );
        scannerRef.current = scanner;
      } catch (e) { console.error('Scanner error:', e); }
    }, 300);
    return () => {
      clearTimeout(timer);
      scannerRef.current?.clear().catch(console.error);
    };
  }, [view]);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const { data } = await supabase
        .from('distribution_sessions')
        .select('id, distributor_id, customized_thaalis, status, distributors(full_name)')
        .eq('session_date', today)
        .in('status', ['in_progress', 'arrived', 'counter_b_done']);

      const all = (data || []).map((s: any) => ({
        id: s.id,
        distributor_id: s.distributor_id,
        distributor_name: s.distributors?.full_name || 'Unknown',
        customized_thaalis: s.customized_thaalis || 0,
        status: s.status,
      }));

      setSessions(all.filter(s => s.status !== 'counter_b_done'));
      setCompletedSessions(all.filter(s => s.status === 'counter_b_done'));
    } finally {
      setLoadingSessions(false);
    }
  };

  const startSession = async (session: Session) => {
    setActiveSession(session);
    setFilledThaalis([]);
    setCurrent(null);
    setPrevious(null);
    setError('');
    setView('scanning');
    setTimeout(() => manualRef.current?.focus(), 500);
  };

  const handleScan = async (thaaliNumber: string) => {
    if (!thaaliNumber || !activeSession) return;
    setError('');
    setManualInput('');

    try {
      // Auto-mark previous as filled
      if (current) {
        await markFilled(current);
        setPrevious(current);
        setFilledThaalis(prev => {
          if (prev.find(t => t.thaali_number === current.thaali_number)) return prev;
          return [...prev, current];
        });
      }

      // 1. Lookup thaali
      const { data: thaaliRow } = await supabase
        .from('thaalis')
        .select('id, thaali_number')
        .eq('thaali_number', thaaliNumber)
        .maybeSingle();

      if (!thaaliRow) {
        setError(`Thaali #${thaaliNumber} not found in system`);
        setCurrent(null);
        return;
      }

      // 2. Registration
      const { data: reg } = await supabase
        .from('thaali_registrations')
        .select('id, mumin_id, distributor_id')
        .eq('thaali_id', thaaliRow.id)
        .eq('status', 'approved')
        .maybeSingle();

      if (!reg) {
        setError(`Thaali #${thaaliNumber} has no active registration`);
        setCurrent(null);
        return;
      }

      // 3. Mumin
      const { data: mumin } = await supabase
        .from('mumineen')
        .select('full_name, sf_no')
        .eq('id', reg.mumin_id)
        .maybeSingle();

      // 4. Stopped check
      const { data: stopRow } = await supabase
        .from('stop_thaalis')
        .select('id')
        .eq('thaali_id', thaaliRow.id)
        .lte('stop_date', today)
        .or(`resume_date.is.null,resume_date.gt.${today}`)
        .maybeSingle();

      // 5. Customization
      const { data: customization } = await supabase
        .from('thaali_customizations')
        .select('*')
        .eq('mumin_id', reg.mumin_id)
        .eq('request_date', today)
        .eq('status', 'active')
        .maybeSingle();

      // 6. Today's menu
      const { data: todayMenu } = await supabase
        .from('daily_menu')
        .select('*')
        .eq('menu_date', today)
        .maybeSingle();

      const type: 'customized' | 'default' | 'stopped' =
        stopRow ? 'stopped' : customization ? 'customized' : 'default';

      setCurrent({
        thaali_number: thaaliNumber,
        thaali_id: thaaliRow.id,
        mumin_id: reg.mumin_id,
        mumin_name: mumin?.full_name || 'Unknown',
        sf_no: mumin?.sf_no || '',
        distributor_name: activeSession.distributor_name,
        session_id: activeSession.id,
        type,
        customization,
        todayMenu,
      });

    } catch (err: any) {
      setError(err.message || 'Lookup failed');
      setCurrent(null);
    }
  };

  const markFilled = async (thaali: ScannedThaali) => {
    if (!thaali.session_id) return;
    try {
      await supabase.from('thaali_daily_status').upsert({
        session_id: thaali.session_id,
        thaali_id: thaali.thaali_id,
        mumin_id: thaali.mumin_id,
        date: today,
        status: 'counter_b_filled',
        packed_at: new Date().toISOString(),
      }, { onConflict: 'session_id,thaali_id' });
    } catch (err) { console.error('Mark filled error:', err); }
  };

  const handleDoneWithCurrent = async () => {
    if (!current) return;
    await markFilled(current);
    setPrevious(current);
    setFilledThaalis(prev => {
      if (prev.find(t => t.thaali_number === current.thaali_number)) return prev;
      return [...prev, current];
    });
    setCurrent(null);
    setTimeout(() => manualRef.current?.focus(), 100);
  };

  const goToTally = async () => {
    if (!activeSession) return;

    // Mark current if still on screen
    if (current) {
      await markFilled(current);
      setFilledThaalis(prev => {
        if (prev.find(t => t.thaali_number === current.thaali_number)) return prev;
        return [...prev, current];
      });
      setCurrent(null);
    }

    // Build tally — fetch all customized thaalis for this distributor session
    const { data: registrations } = await supabase
      .from('thaali_registrations')
      .select('id, thaali_id, mumin_id')
      .eq('distributor_id', activeSession.distributor_id)
      .eq('status', 'approved');

    if (!registrations?.length) { setView('tally'); setTallyItems([]); return; }

    const muminIds = registrations.map(r => r.mumin_id);
    const thaaliIds = registrations.map(r => r.thaali_id);

    const [thaaliRes, muminRes, customRes, stopRes, filledRes] = await Promise.all([
      supabase.from('thaalis').select('id, thaali_number').in('id', thaaliIds),
      supabase.from('mumineen').select('id, full_name, sf_no').in('id', muminIds),
      supabase.from('thaali_customizations').select('*').in('mumin_id', muminIds).eq('request_date', today).eq('status', 'active'),
      supabase.from('stop_thaalis').select('thaali_id').in('thaali_id', thaaliIds).lte('stop_date', today).or(`resume_date.is.null,resume_date.gt.${today}`),
      supabase.from('thaali_daily_status').select('thaali_id').eq('session_id', activeSession.id).eq('status', 'counter_b_filled'),
    ]);

    const thaaliMap = new Map(thaaliRes.data?.map(t => [t.id, t]) || []);
    const muminMap = new Map(muminRes.data?.map(m => [m.id, m]) || []);
    const customMap = new Map(customRes.data?.map(c => [c.mumin_id, c]) || []);
    const stoppedIds = new Set(stopRes.data?.map(s => s.thaali_id) || []);
    const filledIds = new Set(filledRes.data?.map(f => f.thaali_id) || []);

    // Only customized, non-stopped
    const items: TallyItem[] = registrations
      .filter(r => {
        const hasCust = customMap.has(r.mumin_id);
        const isStopped = stoppedIds.has(r.thaali_id);
        return hasCust && !isStopped;
      })
      .map(r => {
        const thaali = thaaliMap.get(r.thaali_id);
        const mumin = muminMap.get(r.mumin_id);
        const customization = customMap.get(r.mumin_id);
        const isFilled = filledIds.has(r.thaali_id);
        return {
          thaali_number: thaali?.thaali_number || String(r.thaali_id),
          thaali_id: r.thaali_id,
          mumin_name: mumin?.full_name || 'Unknown',
          sf_no: mumin?.sf_no || '',
          customization,
          filled: isFilled,
          reconciled: false,
          missing: false,
        };
      });

    setTallyItems(items);
    setView('tally');
  };

  const toggleMissing = (thaaliId: number) => {
    setTallyItems(prev => prev.map(t =>
      t.thaali_id === thaaliId
        ? { ...t, missing: !t.missing, reconciled: false }
        : t
    ));
  };

  const toggleReconciled = (thaaliId: number) => {
    setTallyItems(prev => prev.map(t =>
      t.thaali_id === thaaliId
        ? { ...t, reconciled: !t.reconciled, missing: false }
        : t
    ));
  };

  const handleMarkSessionDone = async () => {
    if (!activeSession) return;
    setCompletingSession(true);
    try {
      await supabase
        .from('distribution_sessions')
        .update({ status: 'counter_b_done' })
        .eq('id', activeSession.id);

      await loadSessions();
      setView('sessions');
      setActiveSession(null);
      setFilledThaalis([]);
      setTallyItems([]);
      setCurrent(null);
      setPrevious(null);
    } catch (err: any) {
      setError(err.message || 'Failed to complete session');
    } finally {
      setCompletingSession(false);
    }
  };

  const renderGrid = (thaali: ScannedThaali) => {
    const c = thaali.customization;
    const menu = thaali.todayMenu;

    if (thaali.type === 'stopped') {
      return (
        <div className="text-center py-5">
          <div style={{ fontSize: '4rem' }}>🛑</div>
          <h3 className="text-danger fw-bold mt-3">STOPPED THAALI</h3>
          <p className="text-muted fs-5">Do not fill — return to store.</p>
        </div>
      );
    }

    if (thaali.type === 'default' || !c) {
      return (
        <div className="text-center py-4">
          <div style={{ fontSize: '3rem' }}>✅</div>
          <h4 className="text-success fw-bold mt-3">DEFAULT — Fill Standard</h4>
          <p className="text-muted">No customization. Fill all items at full quantity.</p>
          {menu && (
            <div className="d-flex flex-wrap justify-content-center gap-2 mt-3">
              {MENU_ITEMS.map(item => menu[item.key] ? (
                <span key={item.key} className="badge bg-success fs-6 px-3 py-2">
                  {item.label}: {menu[item.key]}
                </span>
              ) : null)}
            </div>
          )}
        </div>
      );
    }

    const allColumns = [
      ...MENU_ITEMS.map(item => ({
        key: item.key, label: item.label,
        menuName: menu?.[item.key] || '',
        qty: c[item.key] || 'full',
      })),
      ...((c.extra_items || []).map((e: any) => ({
        key: `extra_${e.name}`, label: e.name,
        menuName: '',
        qty: e.quantity || 'full',
      }))),
    ];

    return (
      <div>
        <div className="text-center mb-4">
          <span className="badge fs-6 px-4 py-2" style={{ background: '#06b6d4', color: '#fff' }}>
            Change Requested — Fill as shown below
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
            <thead>
              <tr>
                {allColumns.map(col => (
                  <th key={col.key} style={{
                    textAlign: 'center', padding: '8px 4px 12px',
                    fontSize: '1rem', fontWeight: 700,
                    borderBottom: '2px solid #dee2e6',
                    minWidth: '100px', color: '#1e293b',
                  }}>
                    {col.label}
                    {col.menuName && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 400, color: '#9ca3af', marginTop: 3 }}>
                        {col.menuName}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUANTITIES.map(qty => {
                const qtyInfo = QTY_MAP[qty];
                return (
                  <tr key={qty}>
                    {allColumns.map(col => {
                      const isSelected = col.qty === qty;
                      return (
                        <td key={col.key} style={{ textAlign: 'center', padding: '4px' }}>
                          <div style={{
                            padding: '12px 6px', borderRadius: '8px',
                            border: isSelected ? `2px solid ${qtyInfo.bg}` : '2px solid #e5e7eb',
                            background: isSelected ? qtyInfo.bg : '#fff',
                            color: isSelected ? qtyInfo.text : '#d1d5db',
                            fontWeight: isSelected ? 700 : 400,
                            fontSize: '0.9rem',
                            boxShadow: isSelected ? `0 3px 10px ${qtyInfo.bg}44` : 'none',
                            transition: 'all 0.15s',
                          }}>
                            {qtyInfo.label}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {c.notes && (
          <div className="alert alert-warning py-2 mt-4 mb-0" style={{ fontSize: '0.9rem' }}>
            <i className="bi bi-chat-left-text me-2"></i>
            <strong>Note:</strong> {c.notes}
          </div>
        )}
      </div>
    );
  };

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
            <h1 className="h4 mb-0 fw-bold" style={{ color: '#06b6d4' }}>
              <i className="bi bi-clipboard-check me-2"></i>
              Counter B — Customization Filling
            </h1>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadSessions}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>

        <div className="container-fluid px-4">
          <div className="alert alert-info mb-4" style={{ fontSize: '0.9rem' }}>
            <i className="bi bi-info-circle me-2"></i>
            Select a distributor session confirmed by Counter A. Scan customized thaalis, fill as shown, then do a tally before marking done.
          </div>

          {/* Active sessions */}
          <h5 className="fw-bold mb-3">
            <i className="bi bi-person-walking me-2 text-warning"></i>
            Awaiting Counter B
            <span className="badge bg-primary ms-2">{sessions.length}</span>
          </h5>

          {loadingSessions ? (
            <div className="text-center py-4"><div className="spinner-border text-info"></div></div>
          ) : sessions.length === 0 ? (
            <div className="alert alert-warning mb-4">
              <i className="bi bi-exclamation-triangle me-2"></i>
              No active sessions. Counter A must confirm a distributor first.
            </div>
          ) : (
            <div className="row g-3 mb-4">
              {sessions.map(s => (
                <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                  <div className="card border-0 shadow-sm h-100">
                    <div className="card-body p-4">
                      <h5 className="fw-bold mb-1" style={{ color: '#06b6d4' }}>{s.distributor_name}</h5>
                      <div className="mb-3">
                        <span className="text-muted small">
                          <i className="bi bi-sliders me-1"></i>
                          {s.customized_thaalis} customized thaalis to fill
                        </span>
                      </div>
                      <button
                        className="btn w-100 text-white fw-bold"
                        style={{ background: '#06b6d4' }}
                        onClick={() => startSession(s)}
                      >
                        <i className="bi bi-play-circle me-2"></i>
                        Start Filling
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Completed sessions */}
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
                    <div className="card border-0 shadow-sm bg-white opacity-75">
                      <div className="card-body p-3 d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-semibold">{s.distributor_name}</div>
                          <div className="text-muted small">{s.customized_thaalis} customized</div>
                        </div>
                        <span className="badge bg-success">
                          <i className="bi bi-check2 me-1"></i>Done
                        </span>
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

  // ─────────────────────────────────────────────
  // VIEW: SCANNING
  // ─────────────────────────────────────────────
  if (view === 'scanning') {
    return (
      <div className="min-vh-100 bg-light">
        <div className="bg-white border-bottom px-4 py-3 mb-3">
          <div className="d-flex justify-content-between align-items-center">
            <button className="btn btn-outline-secondary" onClick={() => { setView('sessions'); setCurrent(null); }}>
              <i className="bi bi-arrow-left me-2"></i>Back
            </button>
            <div className="text-center">
              <h1 className="h5 mb-0 fw-bold" style={{ color: '#06b6d4' }}>
                Counter B — {activeSession?.distributor_name}
              </h1>
              <div className="text-muted small">{filledThaalis.length} filled so far</div>
            </div>
            <button
              className="btn btn-success fw-bold"
              onClick={goToTally}
            >
              <i className="bi bi-list-check me-2"></i>Tally &amp; Done
            </button>
          </div>
        </div>

        <div className="container-fluid px-3">
          {error && (
            <div className="alert alert-warning alert-dismissible py-2 mb-3">
              <i className="bi bi-exclamation-triangle me-2"></i>{error}
              <button className="btn-close" onClick={() => setError('')}></button>
            </div>
          )}

          <div className="row g-3">
            {/* LEFT — Scanner + input + previous */}
            <div className="col-12 col-lg-4">
              <div className="card border-0 shadow-sm mb-3">
                <div className="card-header py-2 px-3" style={{ background: '#1e293b', color: '#fff' }}>
                  <h6 className="mb-0"><i className="bi bi-qr-code-scan me-2"></i>Scan Thaali QR</h6>
                </div>
                <div className="card-body p-3 text-center">
                  <div id="qr-reader-b" style={{ maxWidth: '260px', margin: '0 auto' }}></div>
                </div>
              </div>

              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body p-3">
                  <label className="form-label fw-bold mb-1 small">
                    <i className="bi bi-keyboard me-1"></i>Manual — if scan fails
                  </label>
                  <div className="input-group">
                    <input
                      ref={manualRef}
                      type="text"
                      className="form-control form-control-lg"
                      placeholder="Thaali # e.g. 1001"
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && manualInput.trim() && handleScan(manualInput.trim())}
                      style={{ fontSize: '1.2rem' }}
                    />
                    <button
                      className="btn text-white px-3"
                      style={{ background: '#06b6d4' }}
                      onClick={() => manualInput.trim() && handleScan(manualInput.trim())}
                    >
                      <i className="bi bi-arrow-right fs-5"></i>
                    </button>
                  </div>
                  <div className="text-muted mt-1" style={{ fontSize: '0.78rem' }}>
                    Scanning next thaali auto-marks current as filled
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body p-3">
                  <div className="row g-2 text-center">
                    <div className="col-6">
                      <div className="fw-bold fs-4" style={{ color: '#06b6d4' }}>{activeSession?.customized_thaalis || 0}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>Expected</div>
                    </div>
                    <div className="col-6">
                      <div className="fw-bold fs-4 text-success">{filledThaalis.length + (current ? 1 : 0)}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>Scanned</div>
                    </div>
                  </div>
                </div>
              </div>

              {previous && (
                <div className="card border-0 shadow-sm border-start border-success border-3">
                  <div className="card-body py-2 px-3 d-flex align-items-center gap-2">
                    <i className="bi bi-check-circle-fill text-success fs-5"></i>
                    <div>
                      <div className="fw-bold small">#{previous.thaali_number} — {previous.mumin_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>Just filled ✓</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — Current thaali */}
            <div className="col-12 col-lg-8">
              {!current ? (
                <div className="card border-0 shadow-sm" style={{ minHeight: '400px' }}>
                  <div className="card-body d-flex flex-column align-items-center justify-content-center">
                    <i className="bi bi-qr-code-scan mb-3" style={{ fontSize: '4rem', color: '#06b6d4', opacity: 0.4 }}></i>
                    <h5 className="text-muted">Waiting for scan...</h5>
                    <p className="text-muted small mb-4">Scan a thaali QR or enter number manually</p>
                    {filledThaalis.length > 0 && (
                      <button className="btn btn-success btn-lg px-4" onClick={goToTally}>
                        <i className="bi bi-list-check me-2"></i>
                        Done Scanning — Go to Tally ({filledThaalis.length} filled)
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card border-0 shadow-sm">
                  <div className="card-header py-3 px-4" style={{
                    background: current.type === 'stopped' ? '#fee2e2' :
                                 current.type === 'customized' ? '#e0f2fe' : '#f0fdf4',
                    borderBottom: `3px solid ${
                      current.type === 'stopped' ? '#dc2626' :
                      current.type === 'customized' ? '#06b6d4' : '#16a34a'
                    }`,
                  }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="d-flex align-items-center gap-3 flex-wrap">
                          <h3 className="mb-0 fw-bold" style={{ fontSize: '1.8rem' }}>
                            Thaali No: {current.thaali_number}
                          </h3>
                          <span className={`badge fs-6 px-3 py-2 ${
                            current.type === 'stopped' ? 'bg-danger' :
                            current.type === 'customized' ? 'bg-info text-dark' : 'bg-success'
                          }`}>
                            {current.type === 'stopped' ? '🛑 STOPPED' :
                             current.type === 'customized' ? '✏️ CUSTOMIZED' : '✅ DEFAULT'}
                          </span>
                        </div>
                        <div className="mt-2 d-flex gap-3 flex-wrap" style={{ fontSize: '0.9rem' }}>
                          <span className="fw-semibold">{current.mumin_name}</span>
                          <span className="text-muted">SF# {current.sf_no}</span>
                        </div>
                      </div>
                      <div className="text-end text-muted" style={{ fontSize: '0.8rem' }}>
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br />
                        {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div className="card-body p-4">
                    {renderGrid(current)}
                  </div>

                  <div className="card-footer bg-white py-3 px-4">
                    <div className="d-flex gap-3 align-items-center flex-wrap">
                      <button className="btn btn-success btn-lg px-4 fw-bold" onClick={handleDoneWithCurrent}>
                        <i className="bi bi-check-lg me-2"></i>Mark Filled — Scan Next
                      </button>
                      <span className="text-muted small">Or scan next thaali to auto-confirm</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // VIEW: TALLY
  // ─────────────────────────────────────────────
  const tallyFilled = tallyItems.filter(t => t.filled && !t.missing);
  const tallyMissing = tallyItems.filter(t => t.missing);
  const tallyUnfilled = tallyItems.filter(t => !t.filled && !t.reconciled);
  const allAccountedFor = tallyUnfilled.length === 0;

  return (
    <div className="min-vh-100 bg-light">
      <div className="bg-white border-bottom px-4 py-3 mb-4">
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => setView('scanning')}>
            <i className="bi bi-arrow-left me-2"></i>Back to Scan
          </button>
          <div className="text-center">
            <h1 className="h4 mb-0 fw-bold text-success">
              <i className="bi bi-list-check me-2"></i>
              Tally — {activeSession?.distributor_name}
            </h1>
            <div className="text-muted small">Count physical thaalis against this list</div>
          </div>
          <button
            className="btn btn-success btn-lg fw-bold px-4"
            onClick={handleMarkSessionDone}
            disabled={completingSession || !allAccountedFor}
            title={!allAccountedFor ? 'Mark all unfilled thaalis as reconciled or missing first' : ''}
          >
            {completingSession
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Completing...</>
              : <><i className="bi bi-check-circle me-2"></i>Mark Session Done</>
            }
          </button>
        </div>
      </div>

      <div className="container-fluid px-4">

        {/* Summary cards */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Customized', value: tallyItems.length, color: 'info' },
            { label: 'Filled ✓', value: tallyFilled.length, color: 'success' },
            { label: 'Not Filled', value: tallyUnfilled.length, color: 'warning' },
            { label: 'Missing', value: tallyMissing.length, color: 'danger' },
          ].map(stat => (
            <div className="col-6 col-md-3" key={stat.label}>
              <div className="card border-0 shadow-sm text-center p-3">
                <div className={`display-6 fw-bold text-${stat.color}`}>{stat.value}</div>
                <div className="small text-muted">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Status */}
        {allAccountedFor ? (
          <div className="alert alert-success mb-4">
            <i className="bi bi-check-circle-fill me-2"></i>
            <strong>All thaalis accounted for.</strong> You can now mark this session as done.
          </div>
        ) : (
          <div className="alert alert-warning mb-4">
            <i className="bi bi-exclamation-triangle me-2"></i>
            <strong>{tallyUnfilled.length} thaali{tallyUnfilled.length > 1 ? 's' : ''} not yet filled.</strong>
            {' '}Mark them as reconciled (found &amp; filled now) or missing before completing.
          </div>
        )}

        {/* Tally table */}
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white py-3">
            <h6 className="mb-0 fw-bold">Customized Thaalis — Physical Count</h6>
          </div>
          <div className="card-body p-0">
            {tallyItems.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-inbox fs-2 mb-2 d-block"></i>
                No customized thaalis for this session
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Thaali #</th>
                      <th>Mumin</th>
                      <th>SF#</th>
                      <th>Customization</th>
                      <th>Filled</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tallyItems.map(t => (
                      <tr key={t.thaali_id} className={
                        t.missing ? 'table-danger' :
                        t.reconciled ? 'table-warning' :
                        t.filled ? 'table-success' : ''
                      }>
                        <td className="ps-3 fw-bold fs-6">#{t.thaali_number}</td>
                        <td>{t.mumin_name}</td>
                        <td className="text-muted">{t.sf_no}</td>
                        <td>
                          {t.customization?.stop_thaali ? (
                            <span className="badge bg-danger">Stop</span>
                          ) : (
                            <div className="d-flex flex-wrap gap-1">
                              {MENU_ITEMS.map(item => {
                                const qty = t.customization?.[item.key];
                                if (!qty || qty === 'full') return null;
                                const qtyInfo = QTY_MAP[qty];
                                return (
                                  <span
                                    key={item.key}
                                    className="badge"
                                    style={{ background: qtyInfo.bg, color: qtyInfo.text, fontSize: '0.7rem' }}
                                  >
                                    {item.label}: {qtyInfo.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td>
                          {t.missing ? (
                            <span className="badge bg-danger">Missing</span>
                          ) : t.reconciled ? (
                            <span className="badge bg-warning text-dark">Reconciled</span>
                          ) : t.filled ? (
                            <span className="badge bg-success">
                              <i className="bi bi-check me-1"></i>Filled
                            </span>
                          ) : (
                            <span className="badge bg-secondary">Not Filled</span>
                          )}
                        </td>
                        <td>
                          {!t.filled && !t.reconciled && !t.missing && (
                            <div className="d-flex gap-2">
                              <button
                                className="btn btn-sm btn-outline-success"
                                onClick={() => toggleReconciled(t.thaali_id)}
                                title="Found it — filling now"
                              >
                                <i className="bi bi-check2"></i> Found
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => toggleMissing(t.thaali_id)}
                                title="Cannot find this thaali"
                              >
                                <i className="bi bi-x"></i> Missing
                              </button>
                            </div>
                          )}
                          {(t.reconciled || t.missing) && (
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => {
                                setTallyItems(prev => prev.map(ti =>
                                  ti.thaali_id === t.thaali_id
                                    ? { ...ti, reconciled: false, missing: false }
                                    : ti
                                ));
                              }}
                            >
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

        <div className="text-center mt-4 pb-4">
          <button
            className="btn btn-success btn-lg px-5 fw-bold"
            onClick={handleMarkSessionDone}
            disabled={completingSession || !allAccountedFor}
          >
            {completingSession
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Completing...</>
              : <><i className="bi bi-check-circle me-2"></i>Mark Session Done — Next Distributor</>
            }
          </button>
          {!allAccountedFor && (
            <div className="text-muted small mt-2">
              Resolve {tallyUnfilled.length} unfilled thaali{tallyUnfilled.length > 1 ? 's' : ''} above first
            </div>
          )}
        </div>
      </div>
    </div>
  );
}