'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/kitchen-eligible';

export default function KitchenScanPage() {
  const [distributors, setDistributors] = useState<{ id: number; full_name: string }[]>([]);
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [loading, setLoading]           = useState(true);
  const [tapping, setTapping]           = useState(false);
  const [result, setResult]             = useState<'success' | 'error' | null>(null);
  const [resultName, setResultName]     = useState('');
  const today = todayISO();

  useEffect(() => { fetchDistributors(); }, []);

  const fetchDistributors = async () => {
    // Get distributors that haven't arrived yet today
    const { data: arrived } = await supabase
      .from('distribution_sessions')
      .select('distributor_id')
      .eq('session_date', today);

    const arrivedIds = new Set((arrived || []).map((s: any) => s.distributor_id));

    const { data } = await supabase
      .from('distributors')
      .select('id, full_name')
      .eq('status', 'active')
      .order('full_name');

    const pending = (data || []).filter((d: any) => !arrivedIds.has(d.id));
    setDistributors(pending);
    if (pending.length > 0) setSelectedId(pending[0].id);
    setLoading(false);
  };

  const handleTap = async () => {
    if (!selectedId || tapping) return;
    setTapping(true);
    setResult(null);

    // Haptic feedback on mobile
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    try {
      const res = await fetch('/api/kitchen/arrival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributor_id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResultName(data.distributor_name || 'Distributor');
      setResult('success');
      // Remove from list
      setDistributors(prev => {
        const next = prev.filter(d => d.id !== selectedId);
        setSelectedId(next[0]?.id || null);
        return next;
      });
    } catch (err: any) {
      setResultName(err.message || 'Error');
      setResult('error');
    } finally {
      setTapping(false);
      setTimeout(() => setResult(null), 3000);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f172a', padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 13, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          FMB Kitchen
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
          Distributor Arrival
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading...</div>
      ) : distributors.length === 0 ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ color: '#22c55e', fontSize: 20, fontWeight: 700 }}>All distributors arrived!</div>
          <button onClick={fetchDistributors} style={{ marginTop: 24, padding: '10px 24px', borderRadius: 12, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', fontSize: 14, cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      ) : (
        <>
          {/* Distributor selector */}
          <div style={{ width: '100%', maxWidth: 340, marginBottom: 40 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Select Distributor
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {distributors.map(d => (
                <button key={d.id} onClick={() => setSelectedId(d.id)} style={{
                  padding: '14px 20px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                  border: selectedId === d.id ? '2px solid #ffbf69' : '2px solid #1e293b',
                  background: selectedId === d.id ? '#1e293b' : '#0f172a',
                  color: selectedId === d.id ? '#ffbf69' : '#94a3b8',
                  fontWeight: selectedId === d.id ? 700 : 400,
                  fontSize: 16, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: selectedId === d.id ? '#ffbf6920' : '#1e293b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, color: selectedId === d.id ? '#ffbf69' : '#475569',
                  }}>
                    {selectedId === d.id ? '✓' : '○'}
                  </div>
                  {d.full_name}
                </button>
              ))}
            </div>
          </div>

          {/* Big tap button */}
          <div style={{ position: 'relative' }}>
            {/* Ripple rings */}
            {tapping && (
              <>
                <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '2px solid #ffbf69', opacity: 0, animation: 'ripple 1s ease-out forwards' }} />
                <div style={{ position: 'absolute', inset: -40, borderRadius: '50%', border: '2px solid #ffbf69', opacity: 0, animation: 'ripple 1s ease-out 0.2s forwards' }} />
              </>
            )}
            <button
              onClick={handleTap}
              disabled={!selectedId || tapping}
              style={{
                width: 180, height: 180, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: tapping
                  ? 'radial-gradient(circle, #ffbf69, #f97316)'
                  : result === 'success'
                  ? 'radial-gradient(circle, #22c55e, #16a34a)'
                  : result === 'error'
                  ? 'radial-gradient(circle, #ef4444, #dc2626)'
                  : 'radial-gradient(circle, #364574, #1e3a5f)',
                boxShadow: tapping
                  ? '0 0 60px #ffbf6980'
                  : result === 'success'
                  ? '0 0 60px #22c55e80'
                  : '0 0 40px #36457440',
                transform: tapping ? 'scale(0.94)' : 'scale(1)',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <span style={{ fontSize: 52 }}>
                {tapping ? '📡' : result === 'success' ? '✅' : result === 'error' ? '❌' : '🪪'}
              </span>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>
                {tapping ? 'SCANNING...' : result === 'success' ? 'CHECKED IN' : result === 'error' ? 'FAILED' : 'TAP TO CHECK IN'}
              </span>
            </button>
          </div>

          {/* Result message */}
          {result === 'success' && (
            <div style={{ marginTop: 32, textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{resultName}</div>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Successfully checked in ✓</div>
            </div>
          )}
          {result === 'error' && (
            <div style={{ marginTop: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 15, color: '#ef4444' }}>{resultName}</div>
            </div>
          )}

          {!result && selectedId && (
            <div style={{ marginTop: 24, color: '#475569', fontSize: 13, textAlign: 'center' }}>
              {distributors.find(d => d.id === selectedId)?.full_name}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes ripple {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}