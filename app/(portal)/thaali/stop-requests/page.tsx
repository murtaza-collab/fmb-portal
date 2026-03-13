'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface StopRequest {
  id: number
  mumin_id: number | null
  thaali_id: number
  from_date: string
  to_date: string
  status: string
  created_at: string
  // joined
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

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending:  { label: 'Pending',  badge: 'bg-warning text-dark' },
  approved: { label: 'Approved', badge: 'bg-success'           },
  active:   { label: 'Active',   badge: 'bg-primary'           },
  resumed:  { label: 'Resumed',  badge: 'bg-secondary'         },
  rejected: { label: 'Rejected', badge: 'bg-danger'            },
}

const today = () => new Date().toISOString().split('T')[0]

export default function StopRequestsPage() {
  const router = useRouter()
  const [requests, setRequests]     = useState<StopRequest[]>([])
  const [thaalis, setThaalis]       = useState<ThaaliOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<StopRequest | null>(null)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [thaaliSearch, setThaaliSearch] = useState('')
  const [showThaaliDropdown, setShowThaaliDropdown] = useState(false)

  const emptyForm = {
    thaali_id: '' as number | '',
    thaali_display: '',   // shown in the input
    from_date: today(),
    to_date: '',          // empty = indefinite
    status: 'pending',
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Auth check
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('status, user_groups(name)')
      .eq('auth_id', user.id)
      .single()
    if (!adminData) { router.push('/login'); return }
    setIsAdmin(true)

    // Fetch stop requests with joins
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

    // Step 1: fetch all thaali numbers
    const { data: thaaliRows, error: tErr } = await supabase
      .from('thaalis')
      .select('id, thaali_number, status')
      .order('thaali_number')

    if (tErr) console.error('thaalis fetch error:', tErr)

    // Step 2: fetch registrations with mumin info separately
    const { data: regRows, error: rErr } = await supabase
      .from('thaali_registrations')
      .select('thaali_id, mumin_id, mumineen(full_name, sf_no)')

    if (rErr) console.error('thaali_registrations fetch error:', rErr)

    // Build a lookup map: thaali_id → { mumin_name, sf_no, mumin_id }
    const regMap: Record<number, { mumin_id: number; mumin_name: string; sf_no: string }> = {}
    for (const r of (regRows || [])) {
      regMap[r.thaali_id] = {
        mumin_id: r.mumin_id,
        mumin_name: (r as any).mumineen?.full_name || '—',
        sf_no: (r as any).mumineen?.sf_no || '—',
      }
    }

    const thaaliOpts: ThaaliOption[] = (thaaliRows || []).map((t: any) => ({
      id: t.id,
      thaali_number: String(t.thaali_number),
      mumin_id: regMap[t.id]?.mumin_id || null,
      mumin_name: regMap[t.id]?.mumin_name || '—',
      sf_no: regMap[t.id]?.sf_no || '—',
    }))
    setThaalis(thaaliOpts)
    setLoading(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setThaaliSearch('')
    setSaveError('')
    setShowModal(true)
  }

  const openEdit = (req: StopRequest) => {
    setEditing(req)
    const tOpt = thaalis.find(t => t.id === req.thaali_id)
    setForm({
      thaali_id: req.thaali_id,
      thaali_display: tOpt ? `#${tOpt.thaali_number} — ${tOpt.mumin_name}` : `#${req.thaali_number}`,
      from_date: req.from_date,
      to_date: req.to_date === '2099-12-31' ? '' : (req.to_date || ''),
      status: req.status,
    })
    setThaaliSearch('')
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.thaali_id) { setSaveError('Please select a thaali.'); return }
    if (!form.from_date) { setSaveError('From date is required.'); return }

    setSaving(true)
    setSaveError('')
    const toDate = form.to_date || '2099-12-31'

    // Find mumin_id from selected thaali
    const tOpt = thaalis.find(t => t.id === form.thaali_id)
    const mumin_id = tOpt?.mumin_id

    const payload: any = {
      thaali_id: form.thaali_id,
      ...(mumin_id ? { mumin_id } : {}),
      from_date: form.from_date,
      to_date: toDate,
      status: form.status,
    }

    let error
    if (editing) {
      ({ error } = await supabase.from('stop_thaalis').update(payload).eq('id', editing.id))
    } else {
      ({ error } = await supabase.from('stop_thaalis').insert(payload))
    }

    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaving(false)
    setShowModal(false)
    fetchAll()
  }

  const handleStatusChange = async (id: number, newStatus: string) => {
    await supabase.from('stop_thaalis').update({ status: newStatus }).eq('id', id)
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
  }

  const isIndefinite = (to: string) => !to || to === '2099-12-31'

  const formatDate = (d: string) => {
    if (!d || d === '2099-12-31') return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Filter thaali dropdown — by thaali number (strip leading # if typed)
  const filteredThaalis = thaalis.filter(t => {
    const q = thaaliSearch.trim().replace(/^#/, '').toLowerCase()
    return !q || String(t.thaali_number).toLowerCase().includes(q)
  }).slice(0, 20)

  // Filter table
  const filtered = requests.filter(r => {
    const matchSearch = !search ||
      r.mumin_name.toLowerCase().includes(search.toLowerCase()) ||
      r.sf_no.toLowerCase().includes(search.toLowerCase()) ||
      r.thaali_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  // Counts for filter pills
  const counts = {
    all: requests.length,
    active: requests.filter(r => r.status === 'active').length,
    approved: requests.filter(r => r.status === 'approved').length,
    pending: requests.filter(r => r.status === 'pending').length,
    resumed: requests.filter(r => r.status === 'resumed').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  if (loading) return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="text-center">
        <div className="spinner-border" style={{ color: '#364574', width: '3rem', height: '3rem' }}></div>
        <div className="mt-3 text-muted">Loading stop requests...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>
      {/* Page Header */}
      <div style={{ background: 'var(--bs-body-bg)', borderBottom: '1px solid var(--bs-border-color)', padding: '20px 28px' }}>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h1 className="h4 fw-bold mb-1" style={{ color: '#364574' }}>
              <i className="bi bi-slash-circle me-2"></i>Stop Requests
            </h1>
            <div className="text-muted small">Manage thaali stop requests from mumineen</div>
          </div>
          <button className="btn text-white fw-semibold px-4" style={{ background: '#364574' }} onClick={openAdd}>
            <i className="bi bi-plus-lg me-2"></i>Add Stop Request
          </button>
        </div>
      </div>

      <div className="container-fluid p-4">

        {/* Summary Cards */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total',    value: counts.all,      color: '#364574', icon: 'bi-list-ul'       },
            { label: 'Active',   value: counts.active,   color: '#0ab39c', icon: 'bi-slash-circle'  },
            { label: 'Approved', value: counts.approved, color: '#405189', icon: 'bi-check-circle'  },
            { label: 'Pending',  value: counts.pending,  color: '#f7b84b', icon: 'bi-hourglass-split'},
            { label: 'Resumed',  value: counts.resumed,  color: '#6c757d', icon: 'bi-play-circle'   },
          ].map(c => (
            <div className="col-6 col-md col-lg" key={c.label}>
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: `${c.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <i className={`bi ${c.icon}`} style={{ fontSize: 20, color: c.color }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                    <div className="text-muted small mt-1">{c.label}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body p-3">
            <div className="d-flex flex-wrap gap-3 align-items-center">
              {/* Search */}
              <div className="input-group" style={{ maxWidth: 320 }}>
                <span className="input-group-text" style={{ background: 'var(--bs-body-bg)', borderColor: 'var(--bs-border-color)' }}>
                  <i className="bi bi-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search mumin, SF#, thaali#..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ borderColor: 'var(--bs-border-color)' }}
                />
                {search && (
                  <button className="btn btn-outline-secondary" onClick={() => setSearch('')}>
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="d-flex flex-wrap gap-2">
                {(['all', 'active', 'approved', 'pending', 'resumed', 'rejected'] as FilterStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className="btn btn-sm"
                    style={{
                      borderRadius: 20,
                      border: `1.5px solid ${statusFilter === s ? '#364574' : 'var(--bs-border-color)'}`,
                      background: statusFilter === s ? '#364574' : 'transparent',
                      color: statusFilter === s ? '#fff' : 'var(--bs-body-color)',
                      fontWeight: statusFilter === s ? 600 : 400,
                      fontSize: 12,
                      padding: '3px 14px',
                    }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                    <span className="ms-1 opacity-75">({counts[s] ?? 0})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-5">
                <i className="bi bi-slash-circle" style={{ fontSize: '2.5rem', color: 'var(--bs-secondary-color)', opacity: 0.4 }}></i>
                <div className="mt-3 text-muted">No stop requests found</div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr style={{ background: 'var(--bs-secondary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                      <th className="ps-4 py-3" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>Thaali #</th>
                      <th className="py-3" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>Mumin</th>
                      <th className="py-3" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>SF#</th>
                      <th className="py-3" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>From</th>
                      <th className="py-3" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>To</th>
                      <th className="py-3" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>Status</th>
                      <th className="py-3 pe-4 text-end" style={{ color: 'var(--bs-body-color)', fontWeight: 600, fontSize: 13 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(req => (
                      <tr key={req.id}>
                        <td className="ps-4">
                          <span className="fw-bold" style={{ color: '#364574', fontSize: 15 }}>#{req.thaali_number}</span>
                        </td>
                        <td style={{ color: 'var(--bs-body-color)', fontWeight: 500 }}>{req.mumin_name}</td>
                        <td className="text-muted small">{req.sf_no}</td>
                        <td style={{ color: 'var(--bs-body-color)' }}>{formatDate(req.from_date)}</td>
                        <td>
                          {isIndefinite(req.to_date)
                            ? <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: 11 }}>Indefinite</span>
                            : <span style={{ color: 'var(--bs-body-color)' }}>{formatDate(req.to_date)}</span>
                          }
                        </td>
                        <td>
                          <span className={`badge ${STATUS_META[req.status]?.badge || 'bg-secondary'}`} style={{ fontSize: 12, padding: '5px 10px' }}>
                            {STATUS_META[req.status]?.label || req.status}
                          </span>
                        </td>
                        <td className="pe-4 text-end">
                          <div className="d-flex justify-content-end gap-2">
                            {/* Quick approve/reject for pending */}
                            {req.status === 'pending' && (
                              <>
                                <button className="btn btn-sm btn-success" title="Approve"
                                  onClick={() => handleStatusChange(req.id, 'approved')}>
                                  <i className="bi bi-check-lg"></i>
                                </button>
                                <button className="btn btn-sm btn-danger" title="Reject"
                                  onClick={() => handleStatusChange(req.id, 'rejected')}>
                                  <i className="bi bi-x-lg"></i>
                                </button>
                              </>
                            )}
                            {/* Resume active/approved stop */}
                            {(req.status === 'active' || req.status === 'approved') && (
                              <button className="btn btn-sm btn-outline-secondary" title="Mark Resumed"
                                onClick={() => handleStatusChange(req.id, 'resumed')}>
                                <i className="bi bi-play-circle me-1"></i>Resume
                              </button>
                            )}
                            <button className="btn btn-sm btn-outline-secondary" title="Edit" onClick={() => openEdit(req)}>
                              <i className="bi bi-pencil"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {filtered.length > 0 && (
            <div className="card-footer py-2 px-4 d-flex justify-content-between align-items-center"
              style={{ background: 'var(--bs-body-bg)', borderTop: '1px solid var(--bs-border-color)', fontSize: 13 }}>
              <span className="text-muted">Showing {filtered.length} of {requests.length} requests</span>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header border-0 pb-0 px-4 pt-4">
                <h5 className="modal-title fw-bold" style={{ color: '#364574' }}>
                  <i className={`bi ${editing ? 'bi-pencil' : 'bi-slash-circle'} me-2`}></i>
                  {editing ? 'Edit Stop Request' : 'New Stop Request'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body px-4 py-3">
                {saveError && <div className="alert alert-danger py-2">{saveError}</div>}

                {/* Thaali number lookup */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small" style={{ color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
                    Thaali Number <span className="text-danger">*</span>
                  </label>
                  <div className="position-relative">
                    <div className="input-group">
                      <span className="input-group-text" style={{ background: 'var(--bs-secondary-bg)', borderColor: 'var(--bs-border-color)' }}>
                        <i className="bi bi-cup-hot" style={{ color: '#364574' }}></i>
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Type thaali number e.g. 1001"
                        value={thaaliSearch || (form.thaali_id ? (thaalis.find(t => t.id === form.thaali_id)?.thaali_number || '') : '')}
                        onChange={e => {
                          setThaaliSearch(e.target.value)
                          setForm(f => ({ ...f, thaali_id: '', thaali_display: '' }))
                          setShowThaaliDropdown(true)
                        }}
                        onFocus={() => setShowThaaliDropdown(true)}
                        onBlur={() => setTimeout(() => setShowThaaliDropdown(false), 150)}
                        style={{ borderColor: form.thaali_id ? '#0ab39c' : 'var(--bs-border-color)' }}
                      />
                      {form.thaali_id && (
                        <span className="input-group-text" style={{ background: '#0ab39c18', borderColor: '#0ab39c', color: '#0ab39c' }}>
                          <i className="bi bi-check-circle-fill"></i>
                        </span>
                      )}
                    </div>

                    {/* Dropdown */}
                    {showThaaliDropdown && !form.thaali_id && filteredThaalis.length > 0 && (
                      <div className="position-absolute w-100 shadow border rounded-2"
                        style={{ top: '100%', marginTop: 4, background: 'var(--bs-body-bg)', maxHeight: 200, overflowY: 'auto', zIndex: 1060 }}>
                        {filteredThaalis.map(t => (
                          <div
                            key={t.id}
                            className="d-flex align-items-center gap-3 px-3 py-2"
                            style={{ cursor: 'pointer', borderBottom: '1px solid var(--bs-border-color)', fontSize: 13 }}
                            onMouseDown={() => {
                              setForm(f => ({ ...f, thaali_id: t.id, thaali_display: t.thaali_number }))
                              setThaaliSearch(t.thaali_number)
                              setShowThaaliDropdown(false)
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bs-secondary-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="fw-bold" style={{ color: '#364574', minWidth: 52, fontSize: 14 }}>#{t.thaali_number}</span>
                            <span style={{ color: 'var(--bs-body-color)' }}>{t.mumin_name}</span>
                            <span className="ms-auto text-muted small">{t.sf_no}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {showThaaliDropdown && !form.thaali_id && thaaliSearch && filteredThaalis.length === 0 && (
                      <div className="position-absolute w-100 shadow border rounded-2 px-3 py-2 text-muted"
                        style={{ top: '100%', marginTop: 4, background: 'var(--bs-body-bg)', fontSize: 13, zIndex: 1060 }}>
                        <i className="bi bi-search me-2"></i>No thaali found for &quot;{thaaliSearch}&quot;
                      </div>
                    )}
                  </div>

                  {/* Selected thaali info strip */}
                  {form.thaali_id && (() => {
                    const t = thaalis.find(t => t.id === form.thaali_id)
                    return t ? (
                      <div className="d-flex align-items-center gap-2 mt-2 px-3 py-2 rounded-2"
                        style={{ background: '#0ab39c12', border: '1px solid #0ab39c30', fontSize: 13 }}>
                        <i className="bi bi-person-fill" style={{ color: '#0ab39c' }}></i>
                        <span style={{ color: 'var(--bs-body-color)', fontWeight: 500 }}>{t.mumin_name}</span>
                        <span className="text-muted">·</span>
                        <span className="text-muted">SF# {t.sf_no}</span>
                        <button className="btn btn-sm ms-auto p-0" style={{ color: 'var(--bs-secondary-color)', background: 'none', border: 'none', lineHeight: 1 }}
                          onClick={() => { setForm(f => ({ ...f, thaali_id: '', thaali_display: '' })); setThaaliSearch('') }}
                          title="Clear selection">
                          <i className="bi bi-x-circle"></i>
                        </button>
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Date Range */}
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-semibold small" style={{ color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
                      From Date <span className="text-danger">*</span>
                    </label>
                    <input type="date" className="form-control" value={form.from_date}
                      onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-semibold small" style={{ color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
                      To Date <span className="text-muted fw-normal" style={{ textTransform: 'none' }}>(blank = indefinite)</span>
                    </label>
                    <input type="date" className="form-control" value={form.to_date}
                      onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} />
                  </div>
                </div>

                {/* Status */}
                <div className="mb-2">
                  <label className="form-label fw-semibold small" style={{ color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>Status</label>
                  <select className="form-select" value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="active">Active</option>
                    <option value="resumed">Resumed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer border-0 px-4 pb-4 pt-0">
                <button className="btn btn-light" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn text-white fw-semibold px-4" style={{ background: '#364574' }}
                  onClick={handleSave} disabled={saving}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}