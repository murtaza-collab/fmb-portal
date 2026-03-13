'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type CustomizationRow = {
  id: number;
  mumin_id: number;
  mumin_name: string;
  sf_no: string;
  thaali_number: string;
  distributor_name: string;
  mithas: string | null;
  tarkari: string | null;
  soup: string | null;
  chawal: string | null;
  roti: string | null;
  salad: string | null;
  stop_thaali: boolean;
  notes: string | null;
  extra_items: { name: string; quantity: string }[];
  request_date: string;
  status: string;
};

const FOOD_KEYS: { key: keyof CustomizationRow; label: string }[] = [
  { key: 'mithas',  label: 'Mithas'    },
  { key: 'tarkari', label: 'Tarkari'   },
  { key: 'soup',    label: 'Daal/Soup' },
  { key: 'chawal',  label: 'Chawal'    },
  { key: 'roti',    label: 'Roti'      },
  { key: 'salad',   label: 'Salad'     },
];

const QTY: Record<string, { bg: string; text: string; label: string }> = {
  full:       { bg: 'var(--bs-success-bg-subtle)', text: 'var(--bs-success)',          label: 'Full'   },
  half:       { bg: 'var(--bs-warning-bg-subtle)', text: 'var(--bs-warning)',          label: 'Medium' },
  quarter:    { bg: 'var(--bs-danger-bg-subtle)',  text: 'var(--bs-danger)',           label: 'Less'   },
  not_needed: { bg: 'var(--bs-secondary-bg)',      text: 'var(--bs-secondary-color)', label: 'None'   },
};

export default function CustomizationsPage() {
  const today = new Date().toISOString().split('T')[0];

  const [rows, setRows]             = useState<CustomizationRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [filterDate, setFilterDate] = useState(today);
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState<number | null>(null);

  useEffect(() => { loadData(); }, [filterDate]);

  const loadData = async () => {
    setLoading(true); setError(''); setExpanded(null);
    try {
      const { data: customs, error: cErr } = await supabase
        .from('thaali_customizations')
        .select('*')
        .eq('request_date', filterDate)
        .order('id', { ascending: true });

      if (cErr) throw cErr;
      if (!customs?.length) { setRows([]); return; }

      const muminIds = [...new Set(customs.map((c: any) => c.mumin_id))];

      const [{ data: muminRows }, { data: regRows }] = await Promise.all([
        supabase.from('mumineen').select('id, full_name, sf_no').in('id', muminIds),
        supabase.from('thaali_registrations').select('mumin_id, thaali_id, distributor_id').in('mumin_id', muminIds).eq('status', 'approved'),
      ]);

      const muminMap = new Map((muminRows || []).map((m: any) => [m.id, m]));
      const regMap   = new Map((regRows   || []).map((r: any) => [r.mumin_id, r]));

      const thaaliIds = [...new Set((regRows || []).map((r: any) => r.thaali_id))];
      const distIds   = [...new Set((regRows || []).map((r: any) => r.distributor_id))];

      const [{ data: thaaliRows }, { data: distRows }] = await Promise.all([
        thaaliIds.length ? supabase.from('thaalis').select('id, thaali_number').in('id', thaaliIds) : Promise.resolve({ data: [] }),
        distIds.length   ? supabase.from('distributors').select('id, full_name').in('id', distIds)  : Promise.resolve({ data: [] }),
      ]);

      const thaaliMap = new Map((thaaliRows || []).map((t: any) => [t.id, t.thaali_number]));
      const distMap   = new Map((distRows   || []).map((d: any) => [d.id, d.full_name]));

      setRows(customs.map((c: any) => {
        const reg = regMap.get(c.mumin_id);
        return {
          id: c.id, mumin_id: c.mumin_id,
          mumin_name:       muminMap.get(c.mumin_id)?.full_name || 'Unknown',
          sf_no:            muminMap.get(c.mumin_id)?.sf_no     || '—',
          thaali_number:    reg ? (thaaliMap.get(reg.thaali_id) || '—') : '—',
          distributor_name: reg ? (distMap.get(reg.distributor_id) || '—') : '—',
          mithas: c.mithas || null, tarkari: c.tarkari || null, soup: c.soup || null,
          chawal: c.chawal || null, roti: c.roti || null, salad: c.salad || null,
          stop_thaali: c.stop_thaali || false, notes: c.notes || null,
          extra_items: c.extra_items || [],
          request_date: c.request_date, status: c.status,
        };
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().replace(/^#/, '');
    return r.mumin_name.toLowerCase().includes(q) || r.sf_no.toLowerCase().includes(q) ||
           r.thaali_number.toString().includes(q)  || r.distributor_name.toLowerCase().includes(q);
  });

  const buildSummary = (r: CustomizationRow) => {
    if (r.stop_thaali) return 'Stop thaali for this day';
    const parts: string[] = [];
    FOOD_KEYS.forEach(({ key, label }) => {
      const val = r[key] as string | null;
      if (val && val !== 'full') parts.push(`${label}: ${QTY[val]?.label || val}`);
    });
    (r.extra_items || []).forEach(e => { if (e.quantity && e.quantity !== 'full') parts.push(`${e.name}: ${e.quantity}`); });
    if (r.notes) parts.push(`Note: ${r.notes}`);
    return parts.length ? parts.join(' · ') : 'All items full';
  };

  const isToday = filterDate === today;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

      {/* Header */}
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '20px 28px 16px' }}>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Thaali</div>
            <h1 className="h4 mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
              <i className="bi bi-sliders me-2" style={{ color: '#364574' }}></i>Customization Requests
            </h1>
          </div>
          <div className="ms-auto d-flex align-items-center gap-2">
            {isToday && <span className="badge bg-success px-3 py-2" style={{ fontSize: 12 }}><i className="bi bi-circle-fill me-1" style={{ fontSize: 8 }}></i>Today</span>}
            <button className="btn btn-sm btn-outline-secondary" onClick={loadData} disabled={loading}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="container-fluid p-4">

        {error && <div className="alert alert-danger mb-4"><i className="bi bi-exclamation-triangle me-2"></i>{error}</div>}

        {/* Summary cards */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Requests', value: filtered.length,                         color: 'primary', icon: 'bi-sliders'       },
            { label: 'Customized',     value: filtered.filter(r => !r.stop_thaali).length, color: 'info', icon: 'bi-pencil-square' },
            { label: 'Stop Thaali',    value: filtered.filter(r =>  r.stop_thaali).length, color: 'danger', icon: 'bi-slash-circle' },
          ].map(s => (
            <div className="col-4" key={s.label}>
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                <div className="card-body text-center py-3">
                  <i className={`bi ${s.icon} fs-4`} style={{ color: `var(--bs-${s.color})` }}></i>
                  <div className="fw-bold mt-1" style={{ fontSize: 34, color: `var(--bs-${s.color})`, lineHeight: 1 }}>{loading ? '—' : s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 500, marginTop: 4 }}>{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body p-3">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-auto">
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Date</label>
                <div className="input-group input-group-sm">
                  <span className="input-group-text"><i className="bi bi-calendar3"></i></span>
                  <input type="date" className="form-control" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ minWidth: 160 }} />
                  {!isToday && <button className="btn btn-outline-secondary" onClick={() => setFilterDate(today)}>Today</button>}
                </div>
              </div>
              <div className="col-12 col-md">
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Search</label>
                <div className="input-group input-group-sm">
                  <span className="input-group-text"><i className="bi bi-search"></i></span>
                  <input type="text" className="form-control" placeholder="Name, SF#, Thaali #, Distributor…" value={search} onChange={e => setSearch(e.target.value)} />
                  {search && <button className="btn btn-outline-secondary" onClick={() => setSearch('')}><i className="bi bi-x"></i></button>}
                </div>
              </div>
              <div className="col-auto">
                <span className="badge bg-secondary fs-6 px-3 py-2">{loading ? '…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          {loading ? (
            <div className="text-center py-5"><div className="spinner-border text-primary"></div><div className="mt-2 text-muted">Loading…</div></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox fs-2 d-block mb-2"></i>
              No customization requests for {isToday ? 'today' : filterDate}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                  <tr>
                    {['Thaali #', 'Mumin', 'Distributor', 'Type', 'Summary', 'Status', ''].map((h, i) => (
                      <th key={i} className={i === 0 ? 'ps-4' : ''} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--bs-secondary-color)', width: i === 0 ? 100 : i === 3 ? 100 : i === 5 ? 90 : i === 6 ? 48 : undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isExp = expanded === r.id;
                    return (
                      <>
                        <tr key={r.id} style={{
                          background: r.stop_thaali ? 'rgba(var(--bs-danger-rgb), 0.04)' : 'var(--bs-body-bg)',
                          borderLeft: r.stop_thaali ? '3px solid var(--bs-danger)' : '3px solid var(--bs-info)',
                        }}>
                          <td className="ps-4 fw-bold fs-6" style={{ color: '#364574' }}>#{r.thaali_number}</td>
                          <td>
                            <div className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>{r.mumin_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>SF# {r.sf_no}</div>
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>{r.distributor_name}</td>
                          <td>
                            {r.stop_thaali
                              ? <span className="badge" style={{ background: 'var(--bs-danger-bg-subtle)', color: 'var(--bs-danger-text-emphasis)', fontSize: 11 }}><i className="bi bi-slash-circle me-1"></i>Stop</span>
                              : <span className="badge" style={{ background: 'var(--bs-info-bg-subtle)',   color: 'var(--bs-info-text-emphasis)',   fontSize: 11 }}><i className="bi bi-sliders me-1"></i>Custom</span>
                            }
                          </td>
                          <td style={{ fontSize: 13, color: r.stop_thaali ? 'var(--bs-danger)' : 'var(--bs-body-color)', maxWidth: 360 }}>
                            <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>{buildSummary(r)}</span>
                          </td>
                          <td>
                            <span className={`badge ${r.status === 'active' ? 'bg-success' : r.status === 'pending' ? 'bg-warning text-dark' : 'bg-secondary'}`} style={{ fontSize: 11 }}>{r.status}</span>
                          </td>
                          <td className="text-end pe-3">
                            <button className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 8, padding: '2px 8px' }} onClick={() => setExpanded(isExp ? null : r.id)}>
                              <i className={`bi ${isExp ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
                            </button>
                          </td>
                        </tr>

                        {isExp && (
                          <tr key={`exp-${r.id}`} style={{ background: 'var(--bs-secondary-bg)' }}>
                            <td colSpan={7} className="px-4 py-3">
                              <div className="row g-3">
                                {r.stop_thaali ? (
                                  <div className="col-12">
                                    <div className="alert alert-danger py-2 mb-0">
                                      <i className="bi bi-slash-circle me-2"></i>
                                      <strong>Stop Thaali</strong> — Mumin requested thaali not be filled on {r.request_date}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="col-12 col-md-9">
                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--bs-secondary-color)', marginBottom: 8 }}>
                                      Food Adjustments — {r.request_date}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {FOOD_KEYS.map(({ key, label }) => {
                                        const val = r[key] as string | null;
                                        if (!val) return null;
                                        const q = QTY[val] || { bg: 'var(--bs-tertiary-bg)', text: 'var(--bs-body-color)', label: val };
                                        return (
                                          <div key={String(key)} style={{ background: q.bg, border: `1px solid ${q.text}44`, borderRadius: 8, padding: '6px 14px', textAlign: 'center', minWidth: 80 }}>
                                            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 500 }}>{label}</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: q.text }}>{q.label}</div>
                                          </div>
                                        );
                                      })}
                                      {(r.extra_items || []).map((e, i) => {
                                        const q = QTY[e.quantity] || { bg: 'var(--bs-tertiary-bg)', text: 'var(--bs-body-color)', label: e.quantity };
                                        return (
                                          <div key={i} style={{ background: q.bg, border: `1px solid ${q.text}44`, borderRadius: 8, padding: '6px 14px', textAlign: 'center', minWidth: 80 }}>
                                            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 500 }}>{e.name}</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: q.text }}>{q.label}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {r.notes && (
                                      <div className="mt-2 p-2" style={{ background: 'var(--bs-warning-bg-subtle)', borderRadius: 8, fontSize: 13, color: 'var(--bs-warning-text-emphasis)' }}>
                                        <i className="bi bi-chat-left-text me-2"></i><strong>Note:</strong> {r.notes}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="col-12 col-md-3">
                                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--bs-secondary-color)', marginBottom: 8 }}>Details</div>
                                  <table style={{ fontSize: 12, width: '100%' }}>
                                    <tbody>
                                      {([['Thaali', `#${r.thaali_number}`], ['SF#', r.sf_no], ['Distributor', r.distributor_name], ['Date', r.request_date], ['Status', r.status]] as [string,string][]).map(([l,v]) => (
                                        <tr key={l}><td style={{ color: 'var(--bs-secondary-color)', paddingRight: 12, paddingBottom: 4, whiteSpace: 'nowrap' }}>{l}</td><td style={{ color: 'var(--bs-body-color)', fontWeight: 500 }}>{v}</td></tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}