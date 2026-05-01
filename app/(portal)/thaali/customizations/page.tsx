'use client'
import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { todayPKT } from '@/lib/time'

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomizationRow = {
  id: number
  mumin_id: number
  mumin_name: string
  sf_no: string
  thaali_number: string
  distributor_name: string
  mithas: string | null
  tarkari: string | null
  soup: string | null
  chawal: string | null
  roti: string | null
  salad: string | null
  stop_thaali: boolean
  notes: string | null
  extra_items: { name: string; quantity: string }[]
  request_date: string
  status: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FOOD_KEYS: { key: keyof CustomizationRow; label: string }[] = [
  { key: 'mithas',  label: 'Mithas'    },
  { key: 'tarkari', label: 'Tarkari'   },
  { key: 'soup',    label: 'Daal/Soup' },
  { key: 'chawal',  label: 'Chawal'    },
  { key: 'roti',    label: 'Roti'      },
  { key: 'salad',   label: 'Salad'     },
]

const QTY: Record<string, { bg: string; color: string; label: string }> = {
  full:       { bg: '#d1e7dd', color: '#0a3622', label: 'Full'   },
  half:       { bg: '#fff3cd', color: '#856404', label: 'Half'   },
  quarter:    { bg: '#f8d7da', color: '#58151c', label: 'Less'   },
  not_needed: { bg: 'var(--bs-secondary-bg)', color: 'var(--bs-secondary-color)', label: 'None' },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomizationsPage() {
  const today = todayPKT()

  const [rows, setRows]             = useState<CustomizationRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [filterDate, setFilterDate] = useState(today)
  const [search, setSearch]         = useState('')
  const [expanded, setExpanded]     = useState<number | null>(null)

  useEffect(() => { loadData() }, [filterDate])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true); setError(''); setExpanded(null)
    try {
      const { data: customs, error: cErr } = await supabase
        .from('thaali_customizations')
        .select('*')
        .eq('request_date', filterDate)
        .order('id', { ascending: true })

      if (cErr) throw cErr
      if (!customs?.length) { setRows([]); setLoading(false); return }

      const muminIds = [...new Set(customs.map((c: any) => c.mumin_id))]

      const [{ data: muminRows }, { data: regRows }] = await Promise.all([
        supabase.from('mumineen').select('id, full_name, sf_no').in('id', muminIds),
        supabase.from('thaali_registrations').select('mumin_id, thaali_id, distributor_id').in('mumin_id', muminIds),
      ])

      const muminMap = new Map((muminRows || []).map((m: any) => [m.id, m]))
      const regMap   = new Map((regRows   || []).map((r: any) => [r.mumin_id, r]))

      const thaaliIds = [...new Set((regRows || []).map((r: any) => r.thaali_id).filter(Boolean))]
      const distIds   = [...new Set((regRows || []).map((r: any) => r.distributor_id).filter(Boolean))]

      const [{ data: thaaliRows }, { data: distRows }] = await Promise.all([
        thaaliIds.length ? supabase.from('thaalis').select('id, thaali_number').in('id', thaaliIds) : Promise.resolve({ data: [] }),
        distIds.length   ? supabase.from('distributors').select('id, full_name').in('id', distIds)  : Promise.resolve({ data: [] }),
      ])

      const thaaliMap = new Map((thaaliRows || []).map((t: any) => [t.id, t.thaali_number]))
      const distMap   = new Map((distRows   || []).map((d: any) => [d.id, d.full_name]))

      setRows(customs.map((c: any) => {
        const reg = regMap.get(c.mumin_id)
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
        }
      }))
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase().replace(/^#/, '')
    return r.mumin_name.toLowerCase().includes(q) ||
           r.sf_no.toLowerCase().includes(q) ||
           r.thaali_number.toString().includes(q) ||
           r.distributor_name.toLowerCase().includes(q)
  })

  const buildSummary = (r: CustomizationRow) => {
    if (r.stop_thaali) return 'Stop thaali for this day'
    const parts: string[] = []
    FOOD_KEYS.forEach(({ key, label }) => {
      const val = r[key] as string | null
      if (val && val !== 'full') parts.push(`${label}: ${QTY[val]?.label || val}`)
    })
    ;(r.extra_items || []).forEach(e => {
      if (e.quantity && e.quantity !== 'full') parts.push(`${e.name}: ${e.quantity}`)
    })
    if (r.notes) parts.push(`Note: ${r.notes}`)
    return parts.length ? parts.join(' · ') : 'All items full'
  }

  const isToday = filterDate === today
  const customCount = filtered.filter(r => !r.stop_thaali).length
  const stopCount   = filtered.filter(r =>  r.stop_thaali).length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Customization Requests</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>
            Daily thaali customization requests from mumineen
          </p>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={loadData} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1" />Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-4" style={{ fontSize: 13 }}>
          <i className="bi bi-exclamation-triangle me-2" />{error}
        </div>
      )}

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Requests', value: filtered.length, color: '#364574' },
          { label: 'Customized',     value: customCount,     color: '#299cdb' },
          { label: 'Stop Thaali',    value: stopCount,       color: '#dc3545' },
        ].map((s, i) => (
          <div key={i} className="col-4">
            <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
              <div className="card-body p-3">
                <p className="mb-1" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{loading ? '—' : s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {/* Date picker */}
            <div className="input-group input-group-sm" style={{ maxWidth: 220 }}>
              <span className="input-group-text" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)', color: 'var(--bs-secondary-color)' }}>
                <i className="bi bi-calendar3" />
              </span>
              <input
                type="date"
                className="form-control"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}
              />
              {!isToday && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setFilterDate(today)}>Today</button>
              )}
            </div>

            {isToday && (
              <span className="badge" style={{ background: '#d1e7dd', color: '#0a3622', fontSize: 12, padding: '5px 10px' }}>
                <i className="bi bi-circle-fill me-1" style={{ fontSize: 7 }} />Today
              </span>
            )}

            {/* Search */}
            <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
              <span className="input-group-text" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)', color: 'var(--bs-secondary-color)' }}>
                <i className="bi bi-search" />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Name, SF#, Thaali#, Distributor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}
              />
              {search && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setSearch('')}>
                  <i className="bi bi-x" />
                </button>
              )}
            </div>

            <span style={{ fontSize: '12px', color: 'var(--bs-secondary-color)', marginLeft: 4 }}>
              {loading ? '…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
              <i className="bi bi-inbox fs-3 d-block mb-2" />
              No customization requests for {isToday ? 'today' : filterDate}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '13px', minWidth: '750px' }}>
                <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                  <tr>
                    {['Thaali #', 'Mumin', 'Distributor', 'Type', 'Summary', 'Status', ''].map(h => (
                      <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isExp = expanded === r.id
                    return (
                      <Fragment key={r.id}>
                        <tr
                          style={{
                            borderLeft: `3px solid ${r.stop_thaali ? '#dc3545' : '#299cdb'}`,
                            background: r.stop_thaali ? 'rgba(220,53,69,0.03)' : 'var(--bs-body-bg)',
                          }}
                        >
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#364574' }}>
                            #{r.thaali_number}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--bs-body-color)' }}>{r.mumin_name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--bs-secondary-color)' }}>SF# {r.sf_no}</div>
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--bs-secondary-color)' }}>
                            {r.distributor_name}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {r.stop_thaali
                              ? <span className="badge" style={{ background: '#f8d7da', color: '#58151c', fontSize: '11px' }}>
                                  <i className="bi bi-slash-circle me-1" />Stop
                                </span>
                              : <span className="badge" style={{ background: '#cfe2ff', color: '#084298', fontSize: '11px' }}>
                                  <i className="bi bi-sliders me-1" />Custom
                                </span>
                            }
                          </td>
                          <td style={{ padding: '10px 12px', maxWidth: 320 }}>
                            <span style={{
                              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap', maxWidth: 300, fontSize: '12px',
                              color: r.stop_thaali ? '#dc3545' : 'var(--bs-body-color)',
                            }}>
                              {buildSummary(r)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span className="badge" style={{
                              fontSize: '11px', padding: '4px 8px',
                              background: r.status === 'active' ? '#d1e7dd' : r.status === 'pending' ? '#fff3cd' : 'var(--bs-secondary-bg)',
                              color:      r.status === 'active' ? '#0a3622' : r.status === 'pending' ? '#856404' : 'var(--bs-secondary-color)',
                            }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              style={{ padding: '2px 8px', fontSize: '12px' }}
                              onClick={() => setExpanded(isExp ? null : r.id)}
                            >
                              <i className={`bi ${isExp ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExp && (
                          <tr style={{ background: 'var(--bs-secondary-bg)' }}>
                            <td colSpan={7} style={{ padding: '16px 20px' }}>
                              <div className="row g-3">
                                {r.stop_thaali ? (
                                  <div className="col-12">
                                    <div className="p-3 rounded d-flex align-items-center gap-2"
                                      style={{ background: '#f8d7da', border: '1px solid #f5c2c7', fontSize: 13, color: '#58151c' }}>
                                      <i className="bi bi-slash-circle-fill" />
                                      <span><strong>Stop Thaali</strong> — Mumin requested thaali not be filled on {r.request_date}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="col-12 col-md-9">
                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--bs-secondary-color)', marginBottom: 8 }}>
                                      Food Adjustments — {r.request_date}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2 mb-2">
                                      {FOOD_KEYS.map(({ key, label }) => {
                                        const val = r[key] as string | null
                                        if (!val) return null
                                        const q = QTY[val] || { bg: 'var(--bs-tertiary-bg)', color: 'var(--bs-body-color)', label: val }
                                        return (
                                          <div key={String(key)} style={{
                                            background: q.bg, borderRadius: 8, padding: '6px 14px',
                                            textAlign: 'center', minWidth: 76,
                                            border: `1px solid ${q.color}44`,
                                          }}>
                                            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 500 }}>{label}</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: q.color }}>{q.label}</div>
                                          </div>
                                        )
                                      })}
                                      {(r.extra_items || []).map((e, i) => {
                                        const q = QTY[e.quantity] || { bg: 'var(--bs-tertiary-bg)', color: 'var(--bs-body-color)', label: e.quantity }
                                        return (
                                          <div key={i} style={{
                                            background: q.bg, borderRadius: 8, padding: '6px 14px',
                                            textAlign: 'center', minWidth: 76,
                                            border: `1px solid ${q.color}44`,
                                          }}>
                                            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 500 }}>{e.name}</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: q.color }}>{q.label}</div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                    {r.notes && (
                                      <div className="mt-2 p-2 rounded" style={{ background: '#fff3cd', border: '1px solid #ffda6a', fontSize: 13, color: '#856404' }}>
                                        <i className="bi bi-chat-left-text me-2" />
                                        <strong>Note:</strong> {r.notes}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Details sidebar */}
                                <div className="col-12 col-md-3">
                                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--bs-secondary-color)', marginBottom: 8 }}>
                                    Details
                                  </div>
                                  <table style={{ fontSize: 12, width: '100%' }}>
                                    <tbody>
                                      {([
                                        ['Thaali',      `#${r.thaali_number}`],
                                        ['SF#',         r.sf_no],
                                        ['Distributor', r.distributor_name],
                                        ['Date',        r.request_date],
                                        ['Status',      r.status],
                                      ] as [string, string][]).map(([l, v]) => (
                                        <tr key={l}>
                                          <td style={{ color: 'var(--bs-secondary-color)', paddingRight: 12, paddingBottom: 4, whiteSpace: 'nowrap' }}>{l}</td>
                                          <td style={{ color: 'var(--bs-body-color)', fontWeight: 500 }}>{v}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="px-3 py-2" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
              <small style={{ color: 'var(--bs-secondary-color)' }}>
                {filtered.length} request{filtered.length !== 1 ? 's' : ''} · {customCount} customized · {stopCount} stopped
              </small>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}