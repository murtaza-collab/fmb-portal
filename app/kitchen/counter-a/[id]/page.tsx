'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type ThaaliRecord = {
  registration_id: number;
  thaali_id: number;
  thaali_number: string;
  mumin_id: number;
  mumin_name: string;
  sf_no: string;
  status: 'active' | 'stopped' | 'customized';
  customization?: string;
};

type SessionData = {
  id: number;
  distributor_id: number;
  distributor_name: string;
  total_thaalis: number;
  stopped_thaalis: number;
  customized_thaalis: number;
  default_thaalis: number;
  status: string;
};

export default function CounterADetail() {
  const params = useParams();
  const router = useRouter();
  const distributorId = params.id as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [thaalis, setThaalis] = useState<ThaaliRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [activeTab, setActiveTab] = useState<'stopped' | 'customized' | 'default' | 'all'>('all');

  useEffect(() => {
    if (distributorId) loadSessionData();
  }, [distributorId]);

  const loadSessionData = async () => {
    setLoading(true);
    setError('');
    try {
      const distId = parseInt(distributorId, 10);
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch session
      const { data: sessionRow, error: sessionError } = await supabase
        .from('distribution_sessions')
        .select('*')
        .eq('distributor_id', distId)
        .eq('session_date', today)
        .single();

      if (sessionError || !sessionRow) {
        setError('No session found for today. Go back and check in this distributor first.');
        setLoading(false);
        return;
      }

      // 2. Fetch distributor name
      const { data: distributor } = await supabase
        .from('distributors')
        .select('full_name')
        .eq('id', distId)
        .single();

      // 3. Fetch approved registrations
      const { data: registrations, error: regError } = await supabase
        .from('thaali_registrations')
        .select('id, thaali_id, mumin_id')
        .eq('distributor_id', distId)
        .eq('status', 'approved');

      if (regError || !registrations || registrations.length === 0) {
        setSession({ ...sessionRow, distributor_name: distributor?.full_name || 'Unknown' });
        setThaalis([]);
        setLoading(false);
        return;
      }

      const thaaliIds = registrations.map(r => r.thaali_id);
      const muminIds = registrations.map(r => r.mumin_id);

      // 4. Fetch thaali numbers
      const { data: thaaliRows } = await supabase
        .from('thaalis')
        .select('id, thaali_number')
        .in('id', thaaliIds);

      // 5. Fetch mumin details
      const { data: muminRows } = await supabase
        .from('mumineen')
        .select('id, full_name, sf_no')
        .in('id', muminIds);

      // 6. Fetch stopped thaalis
      const { data: stoppedRows } = await supabase
        .from('stop_thaalis')
        .select('thaali_id')
        .in('thaali_id', thaaliIds)
        .lte('stop_date', today)
        .or(`resume_date.is.null,resume_date.gt.${today}`);

      const stoppedThaaliIds = new Set(stoppedRows?.map(s => s.thaali_id) || []);

      // 7. Fetch customizations
      const { data: customizations } = await supabase
        .from('thaali_customizations')
        .select('mumin_id, request_type, notes')
        .in('mumin_id', muminIds)
        .eq('request_date', today)
        .eq('status', 'active');

      const customizationMap = new Map(
        customizations?.map(c => [c.mumin_id, c]) || []
      );

      // 8. Build records
      const thaaliMap = new Map(thaaliRows?.map(t => [t.id, t]) || []);
      const muminMap = new Map(muminRows?.map(m => [m.id, m]) || []);

      const records: ThaaliRecord[] = registrations.map(reg => {
        const thaali = thaaliMap.get(reg.thaali_id);
        const mumin = muminMap.get(reg.mumin_id);
        const isStopped = stoppedThaaliIds.has(reg.thaali_id);
        const customization = customizationMap.get(reg.mumin_id);

        return {
          registration_id: reg.id,
          thaali_id: reg.thaali_id,
          thaali_number: thaali?.thaali_number || String(reg.thaali_id),
          mumin_id: reg.mumin_id,
          mumin_name: mumin?.full_name || 'Unknown',
          sf_no: mumin?.sf_no || '',
          status: isStopped ? 'stopped' : customization ? 'customized' : 'active',
          customization: customization
            ? `${customization.request_type}${customization.notes ? ' — ' + customization.notes : ''}`
            : undefined,
        };
      });

      // Sort: stopped first, then customized, then default
      records.sort((a, b) => {
        const order = { stopped: 0, customized: 1, active: 2 };
        return order[a.status] - order[b.status];
      });

      setSession({ ...sessionRow, distributor_name: distributor?.full_name || 'Unknown' });
      setThaalis(records);
      setConfirmed(['in_progress', 'completed', 'dispatched'].includes(sessionRow.status));

    } catch (err: any) {
      setError(err.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndSend = async () => {
    if (!session) return;
    setConfirming(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('distribution_sessions')
        .update({ status: 'in_progress' })
        .eq('id', session.id);

      if (updateError) throw updateError;

      setConfirmed(true);
      setSession(prev => prev ? { ...prev, status: 'in_progress' } : prev);

      // Go back to kitchen main after short delay
      setTimeout(() => router.push('/kitchen'), 1500);

    } catch (err: any) {
      setError(err.message || 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  };

  const stopped = thaalis.filter(t => t.status === 'stopped');
  const customized = thaalis.filter(t => t.status === 'customized');
  const defaultThaalis = thaalis.filter(t => t.status === 'active');

  const tabThaalis =
    activeTab === 'stopped' ? stopped :
    activeTab === 'customized' ? customized :
    activeTab === 'default' ? defaultThaalis :
    thaalis;

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }}></div>
          <div className="mt-3 fs-5 text-muted">Loading...</div>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-vh-100 p-4">
        <Link href="/kitchen" className="btn btn-outline-secondary mb-4">
          <i className="bi bi-arrow-left me-2"></i>Back
        </Link>
        <div className="alert alert-danger fs-5">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light">
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-3">
        <div className="d-flex justify-content-between align-items-center">
          <Link href="/kitchen" className="btn btn-outline-secondary">
            <i className="bi bi-arrow-left me-2"></i>Back
          </Link>
          <h1 className="h4 mb-0 text-primary fw-bold">
            Counter A — {session?.distributor_name}
          </h1>
          <span className={`badge fs-6 ${confirmed ? 'bg-success' : 'bg-warning text-dark'}`}>
            {confirmed ? '✓ Sent to Counters' : 'Awaiting Confirmation'}
          </span>
        </div>
      </div>

      <div className="container-fluid p-4">
        {error && <div className="alert alert-warning mb-3">{error}</div>}

        {/* Stat Cards */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Thaalis', value: thaalis.length, tab: 'all', color: 'primary' },
            { label: 'To Dispatch', value: thaalis.length - stopped.length, tab: 'all', color: 'success' },
            { label: 'Stopped', value: stopped.length, tab: 'stopped', color: 'danger' },
            { label: 'Customized → B', value: customized.length, tab: 'customized', color: 'info' },
            { label: 'Default → C', value: defaultThaalis.length, tab: 'default', color: 'secondary' },
          ].map(stat => (
            <div className="col-6 col-md-4 col-lg-2" key={stat.label}>
              <div
                className={`card text-center p-3 border-2 ${
                  activeTab === stat.tab && stat.tab !== 'all'
                    ? `border-${stat.color} bg-${stat.color} bg-opacity-10`
                    : 'border-light bg-white'
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveTab(stat.tab as any)}
              >
                <div className={`display-6 fw-bold text-${stat.color}`}>{stat.value}</div>
                <div className="small text-muted mt-1">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Stopped Alert — always visible if any stopped */}
        {stopped.length > 0 && (
          <div className="alert alert-danger mb-4">
            <h6 className="fw-bold mb-2">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {stopped.length} Thaali{stopped.length > 1 ? 's' : ''} STOPPED — Put back to store:
            </h6>
            <div className="d-flex flex-wrap gap-2">
              {stopped.map(t => (
                <span key={t.thaali_id} className="badge bg-danger fs-6 px-3 py-2">
                  #{t.thaali_number} — {t.mumin_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Confirm & Send */}
        {!confirmed ? (
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <div className="row align-items-center">
                <div className="col-md-8">
                  <h5 className="mb-1 fw-bold">Ready to start filling?</h5>
                  <p className="text-muted mb-0">
                    <span className="text-danger fw-bold">{stopped.length} stopped</span> → back to store &nbsp;|&nbsp;
                    <span className="text-info fw-bold">{customized.length} customized</span> → Counter B &nbsp;|&nbsp;
                    <span className="text-secondary fw-bold">{defaultThaalis.length} default</span> → Counter C
                  </p>
                </div>
                <div className="col-md-4 mt-3 mt-md-0">
                  <button
                    className="btn btn-success btn-lg w-100"
                    onClick={handleConfirmAndSend}
                    disabled={confirming || thaalis.length === 0}
                  >
                    {confirming ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>Confirming...</>
                    ) : (
                      <><i className="bi bi-check-circle me-2"></i>Confirm &amp; Send</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="alert alert-success mb-4">
            <i className="bi bi-check-circle me-2"></i>
            <strong>Done.</strong> Counter B has {customized.length} customized thaalis.
            Counter C has {defaultThaalis.length} default thaalis. Returning to arrival page...
          </div>
        )}

        {/* Tabs */}
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white pt-3 pb-0">
            <ul className="nav nav-tabs card-header-tabs">
              {[
                { key: 'all', label: `All (${thaalis.length})` },
                { key: 'stopped', label: `Stopped (${stopped.length})`, danger: true },
                { key: 'customized', label: `Customized (${customized.length})` },
                { key: 'default', label: `Default (${defaultThaalis.length})` },
              ].map(tab => (
                <li className="nav-item" key={tab.key}>
                  <button
                    className={`nav-link ${activeTab === tab.key ? 'active fw-bold' : ''} ${tab.danger && stopped.length > 0 ? 'text-danger' : ''}`}
                    onClick={() => setActiveTab(tab.key as any)}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-body p-0">
            {tabThaalis.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <i className="bi bi-inbox fs-3"></i>
                <div className="mt-2">No thaalis in this category</div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Thaali #</th>
                      <th>Mumin Name</th>
                      <th>SF#</th>
                      <th>Status</th>
                      <th>Customization / Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabThaalis.map(t => (
                      <tr key={t.registration_id} className={
                        t.status === 'stopped' ? 'table-danger' :
                        t.status === 'customized' ? 'table-info' : ''
                      }>
                        <td className="fw-bold fs-5">{t.thaali_number}</td>
                        <td>{t.mumin_name}</td>
                        <td className="text-muted">{t.sf_no}</td>
                        <td>
                          <span className={`badge ${
                            t.status === 'stopped' ? 'bg-danger' :
                            t.status === 'customized' ? 'bg-info text-dark' :
                            'bg-success'
                          }`}>
                            {t.status === 'stopped' ? '✕ Stopped — Back to Store' :
                             t.status === 'customized' ? '→ Counter B' :
                             '→ Counter C'}
                          </span>
                        </td>
                        <td className="text-muted">{t.customization || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}