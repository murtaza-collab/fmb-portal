'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StopRequest {
  id: number
  mumin_id: number | null
  thaali_id: number
  from_date: string
  to_date: string
  status: string
  created_at: string
  mumin_name: string
  sf_no: string
  thaali_number: string
}

interface ThaaliOption {
  id: number
  thaali_number: string
  mumin_id: number | null
  mumin_name: string
  sf_no: string
}

type FilterStatus = 'all' | 'active' | 'approved' | 'pending' | 'resumed' | 'rejected'

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending:  { label: 'Pending',  bg: '#fff3cd', color: '#856404' },
  approved: { label: 'Approved', bg: '#d1e7dd', color: '#0a3622' },
  active:   { label: 'Active',   bg: '#cfe2ff', color: '#084298' },
  resumed:  { label: 'Resumed',  bg: '#e2e3e5', color: '#41464b' },
  rejected: { label: 'Rejected', bg: '#f8d7da', color: '#58151c' },
}

const todayStr = () => new Date().toISOString().split('T')[0]

const formatDate = (d: string) => {
  if (!d || d === '2099-12-31') return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const isIndefinite = (to: string) => !to || to === '2099-12-31'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StopRequestsPage() {
  const [requests, setRequests]   = useState<StopRequest[]>([])
  const [thaalis, setThaalis]     = useState<ThaaliOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<StopRequest | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  // Thaali search in modal
  const [thaaliSearch, setThaaliSearch]     = useState('')
  const [showThaaliDrop, setShowThaaliDrop] = useState(false)

  const emptyForm = {
    thaali_id: '' as number | '',
    from_date: todayStr(),
    to_date: '',
    status: 'pending',
  }
  const [form, setForm] = useState(emptyForm)
  const selectedThaali = thaalis.find(t => t.id === form.thaali_id)

  useEffect(() => { fetchAll() }, [])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true)

    // Stop requests with direct joins
    const { data: stops } = await supabase
      .from('stop_thaalis')
      .select(`
        id, mumin_id, thaali_id, from_date, to_date, status, created_at,
        mumineen(full_name, sf_no),
        thaalis(thaali_number)
      `)
      .order('created_at', { ascending: false })

    const mapped: StopRequest[] = (stops || []).map((s: any) => ({
      id: s.id,
      mumin_id: s.mumin_id,
      thaali_id: s.thaali_id,
      from_date: s.from_date,
      to_date: s.to_date,
      status: s.status,
      created_at: s.created_at,
      mumin_name: s.mumineen?.full_name || '—',
      sf_no: s.mumineen?.sf_no || '—',
      thaali_number: s.thaalis?.thaali_number || '—',
    }))
    setRequests(mapped)

    // Thaali numbers
    const { data: thaaliRows } = await supabase
      .from('thaalis')
      .select('id, thaali_number')
      .order('thaali_number')

    // Registrations — two-step to avoid FK hint issue
    const { data: regRows } = await supabase
      .from('thaali_registrations')
      .select('thaali_id, mumin_id')

    const muminIds = [...new Set((regRows || []).map((r: any) => r.mumin_id).filter(Boolean))] as number[]
    const muminMap: Record<number, { full_name: string; sf_no: string }> = {}
    if (muminIds.length > 0) {
      const { data: mumins } = await supabase
        .from('mumineen')
        .select('id, full_name, sf_no')
        .in('id', muminIds)
      for (const m of (mumins || [])) muminMap[m.id] = { full_name: m.full_name, sf_no: m.sf_no }
    }

    const regMap: Record<number, { mumin_id: number; mumin_name: string; sf_no: string }> = {}
    for (const r of (regRows || [])) {
      regMap[r.thaali_id] = {
        mumin_id: r.mumin_id,
        mumin_name: muminMap[r.mumin_id]?.full_name || '—',
        sf_no: muminMap[r.mumin_id]?.sf_no || '—',
      }
    }

    const opts: ThaaliOption[] = (thaaliRows || []).map((t: any) => ({
      id: t.id,
      thaali_number: String(t.thaali_number),
      mumin_id: regMap[t.id]?.mumin_id || null,
      mumin_name: regMap[t.id]?.mumin_name || '—',
      sf_no: regMap[t.id]?.sf_no || '—',
    }))
    setThaalis(opts)
    setLoading(false)
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setThaaliSearch('')
    setSaveError('')
    setShowModal(true)
  }

  const openEdit = (r: StopRequest) => {
    setEditing(r)
    setForm({
      thaali_id: r.thaali_id,
      from_date: r.from_date,
      to_date: isIndefinite(r.to_date) ? '' : r.to_date,
      status: r.status,
    })
    const t = thaalis.find(t => t.id === r.thaali_id)
    setThaaliSearch(t ? t.thaali_number : r.thaali_number)
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.thaali_id) { setSaveError('Please select a thaali number.'); return }
    if (!form.from_date) { setSaveError('From date is required.'); return }
    setSaving(true)
    setSaveError('')

    const t = thaalis.find(t => t.id === form.thaali_id)
    const payload: any = {
      thaali_id: form.thaali_id,
      mumin_id: t?.mumin_id || null,
      from_date: form.from_date,
      to_date: form.to_date || '2099-12-31',
      status: form.status,
    }

    const { error } = editing
      ? await supabase.from('stop_thaalis').update(payload).eq('id', editing.id)
      : await supabase.from('stop_thaalis').insert(payload)

    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaving(false)
    setShowModal(false)
    fetchAll()
  }

  const handleStatusChange = async (id: number, newStatus: string) => {
    await supabase.from('stop_thaalis').update({ status: newStatus }).eq('id', id)
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      r.mumin_name.toLowerCase().includes(q) ||
      r.sf_no.toLowerCase().includes(q) ||
      r.thaali_number.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    active:   requests.filter(r => r.status === 'active').length,
    approved: requests.filter(r => r.status === 'approved').length,
    resumed:  requests.filter(r => r.status === 'resumed').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  const filteredThaalis = thaalis
    .filter(t => {
      const q = thaaliSearch.replace(/^#/, '').toLowerCase()
      return !q || t.thaali_number.includes(q)
    })
    .slice(0, 20)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Stop Requests</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>
            Manage thaali stop requests from mumineen
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={openAdd}>
          <i className="bi bi-plus-lg me-1" />Add Stop Request
        </button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total',    value: counts.all,      color: '#364574' },
          { label: 'Pending',  value: counts.pending,  color: '#856404' },
          { label: 'Active',   value: counts.active,   color: '#084298' },
          { label: 'Approved', value: counts.approved, color: '#0ab39c' },
          { label: 'Resumed',  value: counts.resumed,  color: '#6c757d' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md">
            <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
              <div className="card-body p-3">
                <p className="mb-1" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {/* Search */}
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search name, SF#, thaali no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />

            {/* Status filter pills */}
            <div className="d-flex flex-wrap gap-1 ms-1">
              {(['all', 'pending', 'active', 'approved', 'resumed', 'rejected'] as FilterStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="btn btn-sm"
                  style={{
                    borderRadius: 20, fontSize: '12px', padding: '3px 12px',
                    border: `1.5px solid ${statusFilter === s ? '#364574' : 'var(--bs-border-color)'}`,
                    background: statusFilter === s ? '#364574' : 'transparent',
                    color: statusFilter === s ? '#fff' : 'var(--bs-secondary-color)',
                    fontWeight: statusFilter === s ? 600 : 400,
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  <span className="ms-1" style={{ opacity: 0.7 }}>({counts[s] ?? 0})</span>
                </button>
              ))}
            </div>
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
              <i className="bi bi-slash-circle fs-3 d-block mb-2" />
              No stop requests found
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '13px', minWidth: '750px' }}>
                  <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                    <tr>
                      {['Thaali #', 'Mumin', 'SF#', 'From', 'To', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const meta = STATUS_META[r.status] || { label: r.status, bg: '#e2e3e5', color: '#41464b' }
                      return (
                        <tr key={r.id}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#364574' }}>
                            #{r.thaali_number}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--bs-body-color)' }}>
                            {r.mumin_name}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--bs-secondary-color)', fontSize: '12px' }}>
                            {r.sf_no}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)', whiteSpace: 'nowrap' }}>
                            {formatDate(r.from_date)}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {isIndefinite(r.to_date)
                              ? <span className="badge" style={{ background: '#f8d7da', color: '#58151c', fontSize: '11px' }}>Indefinite</span>
                              : <span style={{ color: 'var(--bs-body-color)' }}>{formatDate(r.to_date)}</span>
                            }
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span className="badge" style={{ background: meta.bg, color: meta.color, fontSize: '11px', padding: '4px 8px' }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <div className="d-flex gap-1">
                              {r.status === 'pending' && (
                                <>
                                  <button
                                    className="btn btn-sm"
                                    title="Approve"
                                    style={{ padding: '2px 8px', background: '#0ab39c', color: '#fff', fontSize: '12px', borderRadius: 6 }}
                                    onClick={() => handleStatusChange(r.id, 'approved')}
                                  >
                                    <i className="bi bi-check-lg" />
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    title="Reject"
                                    style={{ padding: '2px 8px', background: '#dc3545', color: '#fff', fontSize: '12px', borderRadius: 6 }}
                                    onClick={() => handleStatusChange(r.id, 'rejected')}
                                  >
                                    <i className="bi bi-x-lg" />
                                  </button>
                                </>
                              )}
                              {(r.status === 'active' || r.status === 'approved') && (
                                <button
                                  className="btn btn-sm btn-outline-secondary"
                                  style={{ fontSize: '11px', padding: '2px 10px' }}
                                  onClick={() => handleStatusChange(r.id, 'resumed')}
                                >
                                  <i className="bi bi-play-circle me-1" />Resume
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                style={{ fontSize: '11px', padding: '2px 8px' }}
                                onClick={() => openEdit(r)}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <small style={{ color: 'var(--bs-secondary-color)' }}>
                  Showing {filtered.length} of {requests.length} requests
                </small>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Add / Edit Modal ────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title" style={{ color: 'var(--bs-body-color)' }}>
                  {editing ? 'Edit Stop Request' : 'Add Stop Request'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>

              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                {saveError && (
                  <div className="alert alert-danger py-2 mb-3" style={{ fontSize: '13px' }}>
                    <i className="bi bi-exclamation-circle me-2" />{saveError}
                  </div>
                )}

                {/* Thaali number picker */}
                <div className="mb-3" style={{ position: 'relative' }}>
                  <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>
                    Thaali Number <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)', color: 'var(--bs-secondary-color)' }}>
                      <i className="bi bi-search" />
                    </span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Type thaali number…"
                      value={thaaliSearch}
                      onChange={e => {
                        setThaaliSearch(e.target.value)
                        setForm(f => ({ ...f, thaali_id: '' }))
                        setShowThaaliDrop(true)
                      }}
                      onFocus={() => setShowThaaliDrop(true)}
                      onBlur={() => setTimeout(() => setShowThaaliDrop(false), 150)}
                      style={{
                        background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)',
                        border: '1px solid var(--bs-border-color)',
                        borderColor: form.thaali_id ? '#0ab39c' : undefined,
                      }}
                    />
                    {form.thaali_id && (
                      <span className="input-group-text" style={{ background: '#0ab39c18', borderColor: '#0ab39c', color: '#0ab39c' }}>
                        <i className="bi bi-check-circle-fill" />
                      </span>
                    )}
                  </div>

                  {/* Dropdown */}
                  {showThaaliDrop && !form.thaali_id && filteredThaalis.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1060,
                      background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)',
                      borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      maxHeight: '200px', overflowY: 'auto',
                    }}>
                      {filteredThaalis.map(t => (
                        <div
                          key={t.id}
                          style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--bs-border-color)', fontSize: '13px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bs-tertiary-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onMouseDown={() => {
                            setForm(f => ({ ...f, thaali_id: t.id }))
                            setThaaliSearch(t.thaali_number)
                            setShowThaaliDrop(false)
                          }}
                        >
                          <span style={{ fontWeight: 700, color: '#364574', minWidth: 50, display: 'inline-block' }}>#{t.thaali_number}</span>
                          <span style={{ color: 'var(--bs-body-color)', marginLeft: 8 }}>{t.mumin_name}</span>
                          <span style={{ color: 'var(--bs-secondary-color)', fontSize: '11px', marginLeft: 8 }}>{t.sf_no}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selected info strip */}
                  {form.thaali_id && selectedThaali && (
                    <div className="mt-2 px-3 py-2 rounded d-flex align-items-center gap-2"
                      style={{ background: '#0ab39c12', border: '1px solid #0ab39c30', fontSize: '13px' }}>
                      <i className="bi bi-person-fill" style={{ color: '#0ab39c' }} />
                      <span style={{ color: 'var(--bs-body-color)', fontWeight: 500 }}>{selectedThaali.mumin_name}</span>
                      <span style={{ color: 'var(--bs-secondary-color)' }}>· SF# {selectedThaali.sf_no}</span>
                      <button
                        className="btn btn-sm ms-auto p-0"
                        style={{ background: 'none', border: 'none', color: 'var(--bs-secondary-color)', lineHeight: 1 }}
                        onClick={() => { setForm(f => ({ ...f, thaali_id: '' })); setThaaliSearch('') }}
                      >
                        <i className="bi bi-x-circle" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>
                      From Date <span className="text-danger">*</span>
                    </label>
                    <input type="date" className="form-control form-control-sm"
                      value={form.from_date}
                      onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>
                      To Date
                      <span className="ms-1" style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(blank = indefinite)</span>
                    </label>
                    <input type="date" className="form-control form-control-sm"
                      value={form.to_date}
                      onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                  </div>
                </div>

                {/* Status */}
                <div className="mb-1">
                  <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Status</label>
                  <select className="form-select form-select-sm" value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="active">Active</option>
                    <option value="resumed">Resumed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}