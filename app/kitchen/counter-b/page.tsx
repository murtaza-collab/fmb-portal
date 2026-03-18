'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { todayISO } from '@/lib/kitchen-eligible';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'sessions' | 'scanning' | 'tally';

type ScannedThaali = {
  thaali_number: string;
  thaali_id:     number;
  mumin_id:      number;
  mumin_name:    string;
  sf_no:         string;
  session_id:    number;
  customization: any;
  todayMenu:     any;
};

type TallyItem = {
  thaali_number: string;
  thaali_id:     number;
  mumin_name:    string;
  sf_no:         string;
  customization: any;
  filled:        boolean;
  reconciled:    boolean;
  missing:       boolean;
};

type Session = {
  id:                 number;
  distributor_id:     number;
  distributor_name:   string;
  customized_thaalis: number;
  status:             string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CounterB() {
  const today = todayISO();

  const [view, setView]                       = useState<View>('sessions');
  const [sessions, setSessions]               = useState<Session[]>([]);
  const [completedSessions, setCompleted]     = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSession, setActiveSession]     = useState<Session | null>(null);

  const [current, setCurrent]             = useState<ScannedThaali | null>(null);
  const [previous, setPrevious]           = useState<ScannedThaali | null>(null);
  const [manualInput, setManualInput]     = useState('');
  const [scanning, setScanning]           = useState(false);
  const [error, setError]                 = useState('');
  const [filledThaalis, setFilledThaalis] = useState<ScannedThaali[]>([]);

  const [tallyItems, setTallyItems]        = useState<TallyItem[]>([]);
  const [completingSession, setCompleting] = useState(false);
  const [pendingThaalis, setPendingThaalis] = useState<{ thaali_number: string }[]>([]);

  // FIX B2: refs always hold latest values — QR scanner callback never goes stale
  const currentRef       = useRef<ScannedThaali | null>(null);
  const activeSessionRef = useRef<Session | null>(null);
  const handleScanRef    = useRef<(n: string) => Promise<void>>(async () => {});

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const manualRef  = useRef<HTMLInputElement>(null);

  // Keep refs in sync after every render
  useEffect(() => { currentRef.current = current; },             [current]);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  useEffect(() => {
    loadSessions();
    const timer = setInterval(loadSessions, 10000);
    return () => clearInterval(timer);
  }, []);

  // Mount / unmount QR scanner when entering scanning view
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
          // FIX B2: always calls latest handleScan via ref — reads currentRef, not stale closure
          (decoded) => handleScanRef.current(decoded.replace('THAALI-', '').trim()),
          () => {}
        );
        scannerRef.current = scanner;
      } catch (e) { console.error('QR scanner init error:', e); }
    }, 300);
    return () => {
      clearTimeout(timer);
      scannerRef.current?.clear().catch(console.error);
      scannerRef.current = null;
    };
  }, [view]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const { data } = await supabase
        .from('distribution_sessions')
        .select('id, distributor_id, customized_thaalis, status, distributors(full_name)')
        .eq('session_date', today)
        .in('status', ['arrived', 'in_progress', 'counter_b_done', 'counter_c_done']);

      const all = (data || []).map((s: any) => ({
        id:                 s.id,
        distributor_id:     s.distributor_id,
        distributor_name:   s.distributors?.full_name || 'Unknown',
        customized_thaalis: s.customized_thaalis || 0,
        status:             s.status,
      }));

      // Only show sessions Counter A confirmed AND that actually have customized thaalis
      setSessions(all.filter(s => s.status !== 'counter_b_done' && s.customized_thaalis > 0));
      setCompleted(all.filter(s => s.status === 'counter_b_done'));
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

    // Load pending thaali numbers for quick-tap buttons (no camera needed)
    const { data } = await supabase
      .from('thaali_daily_status')
      .select('thaali_number')
      .eq('session_id', session.id)
      .eq('status', 'counter_b_pending');
    setPendingThaalis((data || []).map((r: any) => ({ thaali_number: String(r.thaali_number) })));
  };

  // ── Core scan logic ───────────────────────────────────────────────────────

  // FIX B1: UPDATE only — row was seeded by Counter A, no INSERT needed → no thaali_number NOT NULL issue
  const markFilled = async (thaali: ScannedThaali) => {
    try {
      await supabase
        .from('thaali_daily_status')
        .update({
          status:    'counter_b_filled',
          packed_at: new Date().toISOString(),
        })
        .eq('session_id', thaali.session_id)
        .eq('thaali_id',  thaali.thaali_id);
    } catch (err) {
      console.error('markFilled error:', err);
    }
  };

  const handleScan = async (thaaliNumber: string) => {
    // FIX B2: read session from ref, not closure — always current value
    const sess = activeSessionRef.current;
    if (!thaaliNumber || !sess) return;
    if (scanning) return; // debounce double-scans

    setScanning(true);
    setError('');
    setManualInput('');

    try {
      // Auto-mark the thaali currently on the counter as filled, using ref
      const prevCurrent = currentRef.current;
      if (prevCurrent) {
        await markFilled(prevCurrent);
        setPrevious(prevCurrent);
        setFilledThaalis(prev =>
          prev.find(t => t.thaali_number === prevCurrent.thaali_number)
            ? prev
            : [...prev, prevCurrent]
        );
        // Remove from quick-tap list once filled
        setPendingThaalis(prev => prev.filter(t => t.thaali_number !== prevCurrent.thaali_number));
        setCurrent(null);
        currentRef.current = null;
      }

      // FIX B5: Gate — only accept thaalis Counter A assigned to this session as counter_b_pending.
      // Counter A already ran full eligibility; thaali_daily_status is the source of truth here.
      const { data: statusRow } = await supabase
        .from('thaali_daily_status')
        .select('thaali_id, mumin_id, thaali_number, status')
        .eq('session_id',    sess.id)
        .eq('thaali_number', thaaliNumber)
        .maybeSingle();

      if (!statusRow) {
        setError(`Thaali #${thaaliNumber} — not in ${sess.distributor_name}'s session`);
        return;
      }
      if (statusRow.status === 'counter_b_filled') {
        setError(`Thaali #${thaaliNumber} — already filled ✓`);
        return;
      }
      if (statusRow.status !== 'counter_b_pending') {
        setError(`Thaali #${thaaliNumber} — not assigned to Counter B (status: ${statusRow.status})`);
        return;
      }

      // Mumin display info
      const { data: mumin } = await supabase
        .from('mumineen')
        .select('full_name, sf_no')
        .eq('id', statusRow.mumin_id)
        .maybeSingle();

      // Customization for today
      const { data: customization } = await supabase
        .from('thaali_customizations')
        .select('*')
        .eq('mumin_id',     statusRow.mumin_id)
        .eq('request_date', today)
        .eq('status',       'active')
        .maybeSingle();

      // Today's menu (context for staff)
      const { data: todayMenu } = await supabase
        .from('daily_menu')
        .select('*')
        .eq('menu_date', today)
        .maybeSingle();

      const newCurrent: ScannedThaali = {
        thaali_number: thaaliNumber,
        thaali_id:     statusRow.thaali_id,
        mumin_id:      statusRow.mumin_id,
        mumin_name:    mumin?.full_name || 'Unknown',
        sf_no:         mumin?.sf_no || '',
        session_id:    sess.id,
        customization,
        todayMenu,
      };

      setCurrent(newCurrent);
      currentRef.current = newCurrent;

    } catch (err: any) {
      setError(err.message || 'Lookup failed');
    } finally {
      setScanning(false);
    }
  };

  // Keep handleScan ref current after every render — used by QR scanner callback
  useEffect(() => { handleScanRef.current = handleScan; });

  const handleDoneWithCurrent = async () => {
    if (!current) return;
    await markFilled(current);
    setPrevious(current);
    setFilledThaalis(prev =>
      prev.find(t => t.thaali_number === current.thaali_number)
        ? prev
        : [...prev, current]
    );
    setCurrent(null);
    currentRef.current = null;
    setTimeout(() => manualRef.current?.focus(), 100);
  };

  // ── Tally ─────────────────────────────────────────────────────────────────

  const goToTally = async () => {
    if (!activeSession) return;

    // Mark in-hand thaali as filled before moving to tally
    if (current) {
      await markFilled(current);
      setFilledThaalis(prev =>
        prev.find(t => t.thaali_number === current.thaali_number)
          ? prev
          : [...prev, current]
      );
      setCurrent(null);
      currentRef.current = null;
    }

    // Source of truth: rows Counter A seeded for this session
    const { data: statusRows } = await supabase
      .from('thaali_daily_status')
      .select('thaali_id, thaali_number, mumin_id, status')
      .eq('session_id', activeSession.id)
      .in('status', ['counter_b_pending', 'counter_b_filled']);

    if (!statusRows || statusRows.length === 0) {
      setTallyItems([]);
      setView('tally');
      return;
    }

    const muminIds = statusRows.map((r: any) => r.mumin_id);

    const [customRes, muminRes] = await Promise.all([
      supabase
        .from('thaali_customizations')
        .select('*')
        .in('mumin_id',     muminIds)
        .eq('request_date', today)
        .eq('status',       'active'),
      supabase
        .from('mumineen')
        .select('id, full_name, sf_no')
        .in('id', muminIds),
    ]);

    const customMap = new Map(customRes.data?.map((c: any) => [c.mumin_id, c]) || []);
    const muminMap  = new Map(muminRes.data?.map((m: any) => [m.id, m]) || []);

    const items: TallyItem[] = statusRows.map((r: any) => {
      const mumin = muminMap.get(r.mumin_id);
      return {
        thaali_number: String(r.thaali_number),
        thaali_id:     r.thaali_id,
        mumin_name:    mumin?.full_name || 'Unknown',
        sf_no:         mumin?.sf_no || '',
        customization: customMap.get(r.mumin_id) || null,
        filled:        r.status === 'counter_b_filled',
        reconciled:    false,
        missing:       false,
      };
    });

    setTallyItems(items);
    setView('tally');
  };

  const toggleReconciled = (thaaliId: number) =>
    setTallyItems(prev => prev.map(t =>
      t.thaali_id === thaaliId ? { ...t, reconciled: !t.reconciled, missing: false } : t
    ));

  const toggleMissing = (thaaliId: number) =>
    setTallyItems(prev => prev.map(t =>
      t.thaali_id === thaaliId ? { ...t, missing: !t.missing, reconciled: false } : t
    ));

  const undoTallyItem = (thaaliId: number) =>
    setTallyItems(prev => prev.map(t =>
      t.thaali_id === thaaliId ? { ...t, reconciled: false, missing: false } : t
    ));

  const handleMarkSessionDone = async () => {
    if (!activeSession) return;
    setCompleting(true);
    try {
      await supabase
        .from('distribution_sessions')
        .update({ status: 'counter_b_done' })
        .eq('id', activeSession.id);

      await loadSessions();
      setView('sessions');
      setActiveSession(null);
      activeSessionRef.current = null;
      setFilledThaalis([]);
      setTallyItems([]);
      setCurrent(null);
      currentRef.current = null;
      setPrevious(null);
    } catch (err: any) {
      setError(err.message || 'Failed to complete session');
    } finally {
      setCompleting(false);
    }
  };

  // ── Customization grid ────────────────────────────────────────────────────

  const renderCustomizationGrid = (thaali: ScannedThaali) => {
    const c    = thaali.customization;
    const menu = thaali.todayMenu;

    if (!c) {
      return (
        <div className="text-center py-4">
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h4 className="fw-bold mt-3" style={{ color: 'var(--bs-warning-text-emphasis)' }}>
            No Customization Found
          </h4>
          <p style={{ color: 'var(--bs-secondary-color)' }}>
            This thaali was sent to Counter B but has no active customization for today.
            Fill it as standard or flag for Counter A to investigate.
          </p>
        </div>
      );
    }

    const allColumns = [
      ...MENU_ITEMS.map(item => ({
        key:      item.key,
        label:    item.label,
        menuName: menu?.[item.key] || '',
        qty:      c[item.key] || 'full',
      })),
      ...(c.extra_items || []).map((e: any) => ({
        key:      `extra_${e.name}`,
        label:    e.name,
        menuName: '',
        qty:      e.quantity || 'full',
      })),
    ];

    return (
      <div>
        <div className="text-center mb-4">
          <span className="badge fs-6 px-4 py-2" style={{ background: '#06b6d4', color: '#fff' }}>
            ✏️ Change Requested — Fill as shown below
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
            <thead>
              <tr>
                {allColumns.map(col => (
                  <th key={col.key} style={{
                    textAlign:    'center',
                    padding:      '8px 4px 12px',
                    fontSize:     '1rem',
                    fontWeight:   700,
                    borderBottom: '2px solid var(--bs-border-color)',
                    minWidth:     '100px',
                    color:        'var(--bs-body-color)',
                  }}>
                    {col.label}
                    {col.menuName && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--bs-secondary-color)', marginTop: 3 }}>
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
                            padding:    '12px 6px',
                            borderRadius: '8px',
                            border:     isSelected ? `2px solid ${qtyInfo.bg}` : '2px solid var(--bs-border-color)',
                            background: isSelected ? qtyInfo.bg : 'var(--bs-body-bg)',
                            color:      isSelected ? qtyInfo.text : 'var(--bs-secondary-color)',
                            fontWeight: isSelected ? 700 : 400,
                            fontSize:   '0.9rem',
                            boxShadow:  isSelected ? `0 3px 10px ${qtyInfo.bg}44` : 'none',
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

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: SESSIONS
  // ══════════════════════════════════════════════════════════════════════════

  if (view === 'sessions') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

        <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
          <div className="d-flex justify-content-between align-items-center">
            <div style={{ width: 80 }} />
            <div className="text-center">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bs-secondary-color)' }}>
                COUNTER B
              </div>
              <h1 className="h4 mb-0 fw-bold" style={{ color: '#06b6d4' }}>
                Customization Filling
              </h1>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadSessions}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>

        <div className="container-fluid px-4 mt-4">

          <div className="alert alert-info mb-4" style={{ fontSize: '0.9rem' }}>
            <i className="bi bi-info-circle me-2"></i>
            Customized thaalis only. Counter A must confirm a distributor session before it appears here.
          </div>

          <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
            <i className="bi bi-sliders me-2 text-warning"></i>
            Awaiting Counter B
            <span className="badge bg-primary ms-2">{sessions.length}</span>
          </h5>

          {loadingSessions ? (
            <div className="text-center py-4">
              <div className="spinner-border text-info"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="alert alert-warning mb-4">
              <i className="bi bi-exclamation-triangle me-2"></i>
              No sessions awaiting Counter B. Counter A must confirm a distributor with customized thaalis first.
            </div>
          ) : (
            <div className="row g-3 mb-4">
              {sessions.map(s => (
                <div className="col-12 col-md-6 col-lg-4" key={s.id}>
                  <div className="card border-0 shadow-sm h-100" style={{ background: 'var(--bs-body-bg)' }}>
                    <div className="card-body p-4">
                      <h5 className="fw-bold mb-1" style={{ color: '#06b6d4' }}>{s.distributor_name}</h5>
                      <div className="mb-3">
                        <span style={{ color: 'var(--bs-secondary-color)', fontSize: '0.9rem' }}>
                          <i className="bi bi-sliders me-1"></i>
                          {s.customized_thaalis} customized thaali{s.customized_thaalis !== 1 ? 's' : ''} to fill
                        </span>
                      </div>
                      <button
                        className="btn w-100 fw-bold text-white"
                        style={{ background: '#06b6d4' }}
                        onClick={() => startSession(s)}
                      >
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
              <h5 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)' }}>
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
                          <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>{s.customized_thaalis} customized</div>
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

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: SCANNING
  // ══════════════════════════════════════════════════════════════════════════

  if (view === 'scanning') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

        <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
          <div className="d-flex justify-content-between align-items-center">
            <button
              className="btn btn-outline-secondary"
              onClick={() => { setView('sessions'); setCurrent(null); currentRef.current = null; }}
            >
              <i className="bi bi-arrow-left me-2"></i>Back
            </button>
            <div className="text-center">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bs-secondary-color)' }}>
                COUNTER B
              </div>
              <h1 className="h5 mb-0 fw-bold" style={{ color: '#06b6d4' }}>
                {activeSession?.distributor_name}
              </h1>
              <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                {filledThaalis.length} of {activeSession?.customized_thaalis} filled
              </div>
            </div>
            <button className="btn btn-success fw-bold" onClick={goToTally}>
              <i className="bi bi-list-check me-2"></i>Tally &amp; Done
            </button>
          </div>
        </div>

        <div className="container-fluid px-3 mt-3">

          {error && (
            <div className="alert alert-warning alert-dismissible py-2 mb-3">
              <i className="bi bi-exclamation-triangle me-2"></i>{error}
              <button className="btn-close" onClick={() => setError('')}></button>
            </div>
          )}

          <div className="row g-3">

            {/* ── LEFT: scanner + manual + stats ── */}
            <div className="col-12 col-lg-4">

              {/* QR scanner */}
              <div className="card border-0 shadow-sm mb-3" style={{ background: 'var(--bs-body-bg)' }}>
                {/* FIX B6: was hardcoded #1e293b */}
                <div className="card-header py-2 px-3" style={{ background: 'var(--bs-secondary-bg)', borderBottom: '1px solid var(--bs-border-color)' }}>
                  <h6 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>
                    <i className="bi bi-qr-code-scan me-2"></i>Scan Thaali QR
                  </h6>
                </div>
                <div className="card-body p-3 text-center">
                  <div id="qr-reader-b" style={{ maxWidth: '260px', margin: '0 auto' }}></div>
                </div>
              </div>

              {/* Manual input */}
              <div className="card border-0 shadow-sm mb-3" style={{ background: 'var(--bs-body-bg)' }}>
                <div className="card-body p-3">
                  <label className="form-label fw-bold mb-1 small" style={{ color: 'var(--bs-body-color)' }}>
                    <i className="bi bi-keyboard me-1"></i>Manual — if scan fails
                  </label>
                  <div className="input-group">
                    <input
                      ref={manualRef}
                      type="text"
                      className="form-control form-control-lg"
                      placeholder="Thaali # e.g. 1247"
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && manualInput.trim() && handleScan(manualInput.trim())}
                      style={{ fontSize: '1.2rem' }}
                    />
                    <button
                      className="btn text-white px-3"
                      style={{ background: '#06b6d4' }}
                      disabled={scanning}
                      onClick={() => manualInput.trim() && handleScan(manualInput.trim())}
                    >
                      {scanning
                        ? <span className="spinner-border spinner-border-sm"></span>
                        : <i className="bi bi-arrow-right fs-5"></i>
                      }
                    </button>
                  </div>
                  <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.78rem', marginTop: 4 }}>
                    Scanning next thaali auto-marks current as filled
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="card border-0 shadow-sm mb-3" style={{ background: 'var(--bs-body-bg)' }}>

              {/* Quick-tap — tap a thaali number instead of scanning */}
              {pendingThaalis.length > 0 && (
                <div className="card border-0 shadow-sm mb-3" style={{ background: 'var(--bs-body-bg)' }}>
                  <div className="card-body p-3">
                    <div className="mb-2" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--bs-secondary-color)' }}>
                      <i className="bi bi-hand-index-thumb me-1" />Tap to scan
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {pendingThaalis.map(t => (
                        <button
                          key={t.thaali_number}
                          className="btn fw-bold"
                          style={{ background: '#06b6d4', color: '#fff', borderRadius: 8, fontSize: '1rem', padding: '8px 20px', letterSpacing: '0.5px' }}
                          disabled={scanning}
                          onClick={() => handleScan(t.thaali_number)}
                        >
                          #{t.thaali_number}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

                <div className="card-body p-3">
                  <div className="row g-2 text-center">
                    <div className="col-6">
                      <div className="fw-bold fs-4" style={{ color: '#06b6d4' }}>
                        {activeSession?.customized_thaalis || 0}
                      </div>
                      <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.75rem' }}>Expected</div>
                    </div>
                    <div className="col-6">
                      <div className="fw-bold fs-4 text-success">
                        {filledThaalis.length + (current ? 1 : 0)}
                      </div>
                      <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.75rem' }}>Scanned</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Just filled */}
              {previous && (
                <div className="card border-0 shadow-sm"
                  style={{ borderLeft: '3px solid var(--bs-success)', borderRadius: 0, background: 'var(--bs-body-bg)' }}>
                  <div className="card-body py-2 px-3 d-flex align-items-center gap-2">
                    <i className="bi bi-check-circle-fill text-success fs-5"></i>
                    <div>
                      <div className="fw-bold small" style={{ color: 'var(--bs-body-color)' }}>
                        #{previous.thaali_number} — {previous.mumin_name}
                      </div>
                      <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.75rem' }}>Just filled ✓</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT: thaali card ── */}
            <div className="col-12 col-lg-8">
              {!current ? (
                <div className="card border-0 shadow-sm" style={{ minHeight: '400px', background: 'var(--bs-body-bg)' }}>
                  <div className="card-body d-flex flex-column align-items-center justify-content-center">
                    <i className="bi bi-qr-code-scan mb-3" style={{ fontSize: '4rem', color: '#06b6d4', opacity: 0.4 }}></i>
                    <h5 style={{ color: 'var(--bs-secondary-color)' }}>Waiting for scan...</h5>
                    <p style={{ color: 'var(--bs-secondary-color)', fontSize: '0.9rem' }}>
                      Scan a customized thaali QR or enter the number manually
                    </p>
                    {filledThaalis.length > 0 && (
                      <button className="btn btn-success btn-lg px-4 mt-2" onClick={goToTally}>
                        <i className="bi bi-list-check me-2"></i>
                        Done Scanning — Go to Tally ({filledThaalis.length} filled)
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card border-0 shadow-sm" style={{ background: 'var(--bs-body-bg)' }}>
                  {/* FIX B7: was hardcoded #e0f2fe / #fee2e2 / #f0fdf4 */}
                  <div className="card-header py-3 px-4" style={{
                    background:   'var(--bs-secondary-bg)',
                    borderBottom: '3px solid #06b6d4',
                  }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="d-flex align-items-center gap-3 flex-wrap">
                          <h3 className="mb-0 fw-bold" style={{ fontSize: '1.8rem', color: 'var(--bs-body-color)' }}>
                            Thaali No: {current.thaali_number}
                          </h3>
                          <span className="badge fs-6 px-3 py-2" style={{ background: '#06b6d4', color: '#fff' }}>
                            ✏️ CUSTOMIZED
                          </span>
                        </div>
                        <div className="mt-2 d-flex gap-3 flex-wrap" style={{ fontSize: '0.9rem' }}>
                          <span className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>
                            {current.mumin_name}
                          </span>
                          <span style={{ color: 'var(--bs-secondary-color)' }}>SF# {current.sf_no}</span>
                        </div>
                      </div>
                      <div className="text-end" style={{ color: 'var(--bs-secondary-color)', fontSize: '0.8rem' }}>
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br />
                        {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div className="card-body p-4">
                    {renderCustomizationGrid(current)}
                  </div>

                  <div className="card-footer py-3 px-4" style={{ background: 'var(--bs-body-bg)', borderTop: '1px solid var(--bs-border-color)' }}>
                    <div className="d-flex gap-3 align-items-center flex-wrap">
                      <button className="btn btn-success btn-lg px-4 fw-bold" onClick={handleDoneWithCurrent}>
                        <i className="bi bi-check-lg me-2"></i>Mark Filled — Scan Next
                      </button>
                      <span style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
                        Or scan next thaali to auto-confirm
                      </span>
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

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: TALLY
  // ══════════════════════════════════════════════════════════════════════════

  const tallyFilled    = tallyItems.filter(t => t.filled && !t.missing);
  const tallyMissing   = tallyItems.filter(t => t.missing);
  const tallyUnfilled  = tallyItems.filter(t => !t.filled && !t.reconciled && !t.missing);
  const allAccountedFor = tallyUnfilled.length === 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '12px 24px' }}>
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => setView('scanning')}>
            <i className="bi bi-arrow-left me-2"></i>Back to Scan
          </button>
          <div className="text-center">
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bs-secondary-color)' }}>
              COUNTER B — TALLY
            </div>
            <h1 className="h4 mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
              {activeSession?.distributor_name}
            </h1>
            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>
              Count physical thaalis against this list
            </div>
          </div>
          <button
            className="btn btn-success btn-lg fw-bold px-4"
            onClick={handleMarkSessionDone}
            disabled={completingSession || !allAccountedFor}
          >
            {completingSession
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Completing...</>
              : <><i className="bi bi-check-circle me-2"></i>Mark Session Done</>
            }
          </button>
        </div>
      </div>

      <div className="container-fluid px-4 mt-4">

        {/* Stat cards */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Customized', value: tallyItems.length,    color: 'info'    },
            { label: 'Filled ✓',         value: tallyFilled.length,   color: 'success' },
            { label: 'Not Filled',        value: tallyUnfilled.length, color: 'warning' },
            { label: 'Missing',           value: tallyMissing.length,  color: 'danger'  },
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
            <strong>All customized thaalis accounted for.</strong> You can now mark this session as done.
          </div>
        ) : (
          <div className="alert alert-warning mb-4">
            <i className="bi bi-exclamation-triangle me-2"></i>
            <strong>{tallyUnfilled.length} thaali{tallyUnfilled.length > 1 ? 's' : ''} not yet accounted for.</strong>
            {' '}Mark as Found or Missing before completing.
          </div>
        )}

        <div className="card border-0 shadow-sm" style={{ background: 'var(--bs-body-bg)' }}>
          <div className="card-header py-3" style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)' }}>
            <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
              Customized Thaalis — Physical Count
            </h6>
          </div>
          <div className="card-body p-0">
            {tallyItems.length === 0 ? (
              <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
                <i className="bi bi-inbox fs-2 mb-2 d-block"></i>
                No customized thaalis for this session
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead style={{ background: 'var(--bs-secondary-bg)' }}>
                    <tr>
                      <th className="ps-3" style={{ color: 'var(--bs-body-color)' }}>Thaali #</th>
                      <th style={{ color: 'var(--bs-body-color)' }}>Mumin</th>
                      <th style={{ color: 'var(--bs-body-color)' }}>SF#</th>
                      <th style={{ color: 'var(--bs-body-color)' }}>Customization</th>
                      <th style={{ color: 'var(--bs-body-color)' }}>Status</th>
                      <th style={{ color: 'var(--bs-body-color)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tallyItems.map(t => (
                      <tr key={t.thaali_id} className={
                        t.missing    ? 'table-danger'  :
                        t.reconciled ? 'table-warning' :
                        t.filled     ? 'table-success' : ''
                      }>
                        <td className="ps-3 fw-bold fs-6" style={{ color: 'var(--bs-body-color)' }}>
                          #{t.thaali_number}
                        </td>
                        <td style={{ color: 'var(--bs-body-color)' }}>{t.mumin_name}</td>
                        <td style={{ color: 'var(--bs-secondary-color)' }}>{t.sf_no}</td>
                        <td>
                          {t.customization ? (
                            <div className="d-flex flex-wrap gap-1">
                              {MENU_ITEMS.map(item => {
                                const qty = t.customization?.[item.key];
                                if (!qty || qty === 'full') return null;
                                const qtyInfo = QTY_MAP[qty];
                                return (
                                  <span key={item.key} className="badge"
                                    style={{ background: qtyInfo.bg, color: qtyInfo.text, fontSize: '0.7rem' }}>
                                    {item.label}: {qtyInfo.label}
                                  </span>
                                );
                              })}
                              {t.customization?.notes && (
                                <span className="badge bg-warning text-dark" style={{ fontSize: '0.7rem' }}>
                                  <i className="bi bi-chat-left-text me-1"></i>Note
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          {t.missing    ? <span className="badge bg-danger">Missing</span>                                            :
                           t.reconciled ? <span className="badge bg-warning text-dark">Reconciled</span>                              :
                           t.filled     ? <span className="badge bg-success"><i className="bi bi-check me-1"></i>Filled</span>        :
                                          <span className="badge bg-secondary">Not Filled</span>}
                        </td>
                        <td>
                          {!t.filled && !t.reconciled && !t.missing && (
                            <div className="d-flex gap-2">
                              <button className="btn btn-sm btn-outline-success" onClick={() => toggleReconciled(t.thaali_id)}>
                                <i className="bi bi-check2"></i> Found
                              </button>
                              <button className="btn btn-sm btn-outline-danger" onClick={() => toggleMissing(t.thaali_id)}>
                                <i className="bi bi-x"></i> Missing
                              </button>
                            </div>
                          )}
                          {(t.reconciled || t.missing) && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => undoTallyItem(t.thaali_id)}>
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
            <div style={{ color: 'var(--bs-secondary-color)', fontSize: '0.85rem', marginTop: 8 }}>
              Resolve {tallyUnfilled.length} unfilled thaali{tallyUnfilled.length > 1 ? 's' : ''} above first
            </div>
          )}
        </div>

      </div>
    </div>
  );
}