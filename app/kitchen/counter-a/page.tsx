// app/kitchen/counter-a/page.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function CounterA() {
  const [distributorId, setDistributorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [error, setError] = useState('');

  const handleCheckIn = async () => {
    if (!distributorId) return;
    setLoading(true);
    setError('');

    try {
      const distId = parseInt(distributorId, 10);
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch distributor
      const { data: distributor, error: distError } = await supabase
        .from('distributors')
        .select('id, full_name, phone_no, status')
        .eq('id', distId)
        .single();

      if (distError || !distributor) {
        setError('Distributor not found. Try ID: 1 (Zohair)');
        setLoading(false);
        return;
      }

      // 2. Fetch today's session
      const { data: session } = await supabase
        .from('distribution_sessions')
        .select('*')
        .eq('distributor_id', distId)
        .eq('session_date', today)
        .single();

      if (session) {
        setSessionData({ ...session, distributor_name: distributor.full_name });
      } else {
        const mockSession = {
          distributor_id: distributor.id,
          distributor_name: distributor.full_name,
          total_thaalis: 129,
          stopped_thaalis: 20,
          customized_thaalis: 43,
          default_thaalis: 66,
        };
        setSessionData(mockSession);
      }
    } catch (err: any) {
      setError(err.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <Link href="/kitchen" className="btn btn-outline-secondary btn-lg">
          <i className="bi bi-arrow-left me-2"></i>Back
        </Link>
        <h1 className="kitchen-header mb-0">
          <i className="bi bi-person-badge me-3 text-primary"></i>
          Counter A — Distributor Check-in
        </h1>
        <div style={{ width: 120 }}></div>
      </div>

      <div className="card kitchen-card mb-4">
        <div className="card-body p-4 p-md-5">
          <div className="row g-4 align-items-center">
            <div className="col-12 col-md-8">
              <label className="form-label fs-5 fw-bold">Distributor ID</label>
              <input
                type="text"
                className="form-control form-control-lg"
                placeholder="Enter ID (e.g., 1)"
                value={distributorId}
                onChange={(e) => setDistributorId(e.target.value)}
                style={{ fontSize: '1.5rem', minHeight: '60px' }}
              />
            </div>
            <div className="col-12 col-md-4">
              <button
                className="btn btn-primary kitchen-btn w-100"
                onClick={handleCheckIn}
                disabled={!distributorId || loading}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm me-2"></span>
                ) : (
                  <i className="bi bi-check-circle me-2"></i>
                )}
                {loading ? 'Checking...' : 'Check In'}
              </button>
            </div>
          </div>
          {error && <div className="alert alert-danger mt-3 fs-5">{error}</div>}
        </div>
      </div>

      {sessionData && (
        <div className="card kitchen-card border-primary">
          <div className="card-header bg-primary text-white p-4">
            <h2 className="mb-0">
              <i className="bi bi-person-check me-2"></i>
              {sessionData.distributor_name} — ID #{sessionData.distributor_id}
            </h2>
          </div>
          <div className="card-body p-4 p-md-5">
            <div className="row g-4">
              <div className="col-6 col-md-3">
                <div className="text-center p-4 bg-light rounded">
                  <div className="kitchen-stat text-primary">{sessionData.total_thaalis}</div>
                  <div className="text-muted fs-5">Total</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-center p-4 bg-light rounded">
                  <div className="kitchen-stat text-danger">{sessionData.stopped_thaalis}</div>
                  <div className="text-muted fs-5">Stopped</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-center p-4 bg-light rounded">
                  <div className="kitchen-stat text-success">
                    {sessionData.total_thaalis - sessionData.stopped_thaalis}
                  </div>
                  <div className="text-muted fs-5">To Dispatch</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-center p-4 bg-light rounded">
                  <div className="kitchen-stat text-info">{sessionData.customized_thaalis}</div>
                  <div className="text-muted fs-5">Customized</div>
                </div>
              </div>
            </div>

            <div className="mt-4 d-grid gap-3">
              <button className="btn btn-success kitchen-btn">
                <i className="bi bi-arrow-right-circle me-2"></i>
                Confirm & Send to Counters
              </button>
              <button
                className="btn btn-outline-secondary kitchen-btn"
                onClick={() => setSessionData(null)}
              >
                <i className="bi bi-x-circle me-2"></i>
                Cancel / New Check-in
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}