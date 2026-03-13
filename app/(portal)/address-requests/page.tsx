'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

interface AddressRequest {
  id: number
  mumin_id: number
  old_address: string | null
  new_address_type_id: number | null
  new_address_block_id: number | null
  new_address_sector_id: number | null
  new_address_number: string | null
  new_address_category: string | null
  new_address_floor: string | null
  new_full_address: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  reviewed_at: string | null
  reviewed_by: number | null
  admin_notes: string | null
  created_at: string
  // joined
  mumin?: { id: number; full_name: string; sf_no: string; its_no: string }
}

interface Sector      { id: number; name: string }
interface HouseBlock  { id: number; name: string }
interface HouseType   { id: number; name: string }
interface Distributor { id: number; full_name: string; sector_id: number | null }

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: '#fff3cd', color: '#856404', dot: '#ffc107' },
  approved: { label: 'Approved', bg: '#d1e7dd', color: '#0a3622', dot: '#0ab39c' },
  rejected: { label: 'Rejected', bg: '#f8d7da', color: '#58151c', dot: '#dc3545' },
}

const FLOOR_OPTIONS = [
  { value: '0', label: 'Ground Floor' },
  ...Array.from({ length: 20 }, (_, i) => {
    const n = i + 1
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    const suffix = s[(v - 20) % 10] || s[v] || s[0]
    return { value: String(n), label: `${n}${suffix} Floor` }
  }),
]

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--bs-secondary-color)',
  marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5,
}

// ── Address builder (same logic as HOF form) ─────────────────────────────────

function buildAddress(typeName: string, number: string, cat: string, floor: string, blockName: string, sectorName: string) {
  const parts: string[] = []
  const unit = `${typeName ? typeName + ' ' : ''}${number}${cat}`.trim()
  if (unit) parts.push(unit)
  if (floor) {
    const floorLabel = FLOOR_OPTIONS.find(f => f.value === floor)?.label || `${floor} Floor`
    parts.push(floorLabel)
  }
  if (blockName) parts.push(`Block ${blockName}`)
  if (sectorName) parts.push(sectorName)
  return parts.join(', ')
}

// ── Approval form state type ──────────────────────────────────────────────────

interface ApprovalForm {
  address_type_id: string | number
  address_block_id: string | number
  address_sector_id: string | number
  address_number: string
  address_category: string
  address_floor: string
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AddressChangeRequestsPage() {

  const [requests, setRequests]       = useState<AddressRequest[]>([])
  const [sectors, setSectors]         = useState<Sector[]>([])
  const [blocks, setBlocks]           = useState<HouseBlock[]>([])
  const [houseTypes, setHouseTypes]   = useState<HouseType[]>([])
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)

  // Modals
  const [viewing, setViewing]         = useState<AddressRequest | null>(null)
  const [approving, setApproving]     = useState<AddressRequest | null>(null)
  const [approvalForm, setApprovalForm] = useState<ApprovalForm>({
    address_type_id: '', address_block_id: '', address_sector_id: '',
    address_number: '', address_category: '', address_floor: '',
  })
  const [adminNotes, setAdminNotes]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')

  // Reject modal
  const [rejecting, setRejecting]     = useState<AddressRequest | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [search, statusFilter])

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true)
    const [
      { data: reqs },
      { data: secs },
      { data: blks },
      { data: hts },
      { data: dists },
    ] = await Promise.all([
      supabase
        .from('address_change_requests')
        .select(`*, mumin:mumineen(id, full_name, sf_no, its_no)`)
        .order('requested_at', { ascending: false }),
      supabase.from('house_sectors').select('id, name').order('name'),
      supabase.from('house_blocks').select('id, name').order('name'),
      supabase.from('house_types').select('id, name').order('name'),
      supabase.from('distributors').select('id, full_name, sector_id').order('full_name'),
    ])
    setRequests((reqs || []) as AddressRequest[])
    setSectors(secs || [])
    setBlocks(blks || [])
    setHouseTypes(hts || [])
    setDistributors(dists || [])
    setLoading(false)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getSector      = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getBlock       = (id: number | null) => blocks.find(b => b.id === id)?.name || ''
  const getType        = (id: number | null) => houseTypes.find(t => t.id === id)?.name || ''
  const getDistributor = (sectorId: number | null) => {
    if (!sectorId) return null
    return distributors.find(d => d.sector_id === sectorId) || null
  }

  const getFloor = (v: string | null) => {
    if (!v) return '—'
    return FLOOR_OPTIONS.find(f => f.value === v)?.label || `${v} Floor`
  }

  const formatDate = (s: string | null) => {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  // Live address preview in approval form
  const approvalPreview = buildAddress(
    getType(Number(approvalForm.address_type_id) || null),
    approvalForm.address_number,
    approvalForm.address_category,
    approvalForm.address_floor,
    getBlock(Number(approvalForm.address_block_id) || null),
    getSector(Number(approvalForm.address_sector_id) || null) === '—' ? '' : getSector(Number(approvalForm.address_sector_id) || null),
  )

  const af = (field: keyof ApprovalForm, value: string) =>
    setApprovalForm(prev => ({ ...prev, [field]: value }))

  // ── Filter & Paginate ─────────────────────────────────────────────────────

  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    const matchStatus = r.status === statusFilter
    const matchSearch = !search
      || r.mumin?.full_name?.toLowerCase().includes(q)
      || r.mumin?.sf_no?.toLowerCase().includes(q)
      || r.mumin?.its_no?.toLowerCase().includes(q)
      || r.new_full_address?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  // ── Open approve modal ────────────────────────────────────────────────────

  const openApprove = (r: AddressRequest) => {
    setApproving(r)
    setApprovalForm({
      address_type_id:   r.new_address_type_id   || '',
      address_block_id:  r.new_address_block_id  || '',
      address_sector_id: r.new_address_sector_id || '',
      address_number:    r.new_address_number    || '',
      address_category:  r.new_address_category  || '',
      address_floor:     r.new_address_floor     || '',
    })
    setAdminNotes('')
    setSaveError('')
  }

  // ── Approve & Apply ───────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!approving) return
    setSaving(true); setSaveError('')
    try {
      const fullAddress = approvalPreview

      // 1. Update request to approved
      const { error: reqErr } = await supabase
        .from('address_change_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null,
        })
        .eq('id', approving.id)
      if (reqErr) throw reqErr

      // 2. Apply updated address fields to mumineen row
      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
        full_address: fullAddress || null,
      }
      if (approvalForm.address_type_id)   updatePayload.address_type_id   = Number(approvalForm.address_type_id)
      if (approvalForm.address_block_id)  updatePayload.address_block_id  = Number(approvalForm.address_block_id)
      if (approvalForm.address_sector_id) updatePayload.address_sector_id = Number(approvalForm.address_sector_id)
      updatePayload.address_number   = approvalForm.address_number   || null
      updatePayload.address_category = approvalForm.address_category || null
      updatePayload.address_floor    = approvalForm.address_floor    || null

      const { error: muminErr } = await supabase
        .from('mumineen')
        .update(updatePayload)
        .eq('id', approving.mumin_id)
      if (muminErr) throw muminErr

      setApproving(null)
      fetchAll()
    } catch (e: any) {
      setSaveError(e.message)
    }
    setSaving(false)
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  const handleReject = async () => {
    if (!rejecting) return
    setSaving(true); setSaveError('')
    const { error } = await supabase
      .from('address_change_requests')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        admin_notes: rejectNotes || null,
      })
      .eq('id', rejecting.id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setRejecting(null)
    fetchAll()
    setSaving(false)
  }

  // ── Sub-tabs ──────────────────────────────────────────────────────────────

  const subTabs: Array<['pending' | 'approved' | 'rejected', string, number]> = [
    ['pending',  'Pending',  counts.pending],
    ['approved', 'Approved', counts.approved],
    ['rejected', 'Rejected', counts.rejected],
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>Address Change Requests</h4>
          <small style={{ color: 'var(--bs-secondary-color)' }}>
            {counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected
          </small>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
        <div className="d-flex">
          {subTabs.map(([key, label, count]) => (
            <button key={key}
              onClick={() => { setStatusFilter(key); setPage(1) }}
              style={{
                border: 'none', background: 'none', padding: '10px 20px', fontSize: 14,
                cursor: 'pointer',
                color: statusFilter === key ? '#364574' : 'var(--bs-secondary-color)',
                fontWeight: statusFilter === key ? 700 : 400,
                borderBottom: statusFilter === key ? '2px solid #364574' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {label}
              {count > 0 && (
                <span className="ms-2 badge" style={{
                  background: statusFilter === key ? '#364574' : 'var(--bs-tertiary-bg)',
                  color: statusFilter === key ? '#fff' : 'var(--bs-secondary-color)',
                  fontSize: 11, fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '0 0 10px 10px' }}>
        <div className="card-body">

          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search by name, SF#, ITS#, or address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" />
            </div>
          ) : paginated.length === 0 ? (
            <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
              <i className="bi bi-inbox fs-2 d-block mb-2" />
              No {statusFilter} requests
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-secondary-color)', fontSize: 12 }}>Mumin</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-secondary-color)', fontSize: 12 }}>SF# / ITS#</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-secondary-color)', fontSize: 12 }}>Current Address</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-secondary-color)', fontSize: 12 }}>Requested Address</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-secondary-color)', fontSize: 12 }}>Requested On</th>
                      {statusFilter !== 'pending' && (
                        <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-secondary-color)', fontSize: 12 }}>Reviewed On</th>
                      )}
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(r => (
                      <tr key={r.id}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--bs-body-color)', verticalAlign: 'middle' }}>
                          {r.mumin?.full_name || `Mumin #${r.mumin_id}`}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <div style={{ color: '#364574', fontWeight: 600, fontSize: 12 }}>{r.mumin?.sf_no || '—'}</div>
                          <div style={{ color: 'var(--bs-secondary-color)', fontSize: 11 }}>{r.mumin?.its_no || '—'}</div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: 180 }}>
                          <span style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }} title={r.old_address || ''}>
                            {r.old_address
                              ? r.old_address.length > 45 ? r.old_address.slice(0, 45) + '…' : r.old_address
                              : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: 200 }}>
                          <span style={{ color: 'var(--bs-body-color)', fontSize: 12, fontWeight: 500 }} title={r.new_full_address || ''}>
                            {r.new_full_address
                              ? r.new_full_address.length > 50 ? r.new_full_address.slice(0, 50) + '…' : r.new_full_address
                              : '—'}
                          </span>
                          {r.new_address_sector_id && (
                            <div style={{ color: '#364574', fontSize: 11, marginTop: 2 }}>
                              <i className="bi bi-geo-alt me-1" />
                              {getSector(r.new_address_sector_id)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: 'var(--bs-secondary-color)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {formatDate(r.requested_at)}
                        </td>
                        {statusFilter !== 'pending' && (
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: 'var(--bs-secondary-color)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {formatDate(r.reviewed_at)}
                          </td>
                        )}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <div className="d-flex gap-1 justify-content-end">
                            <button
                              className="btn btn-sm"
                              title="View details"
                              style={{ padding: '2px 8px', color: '#299cdb', fontSize: 13 }}
                              onClick={() => setViewing(r)}
                            >
                              <i className="bi bi-eye" />
                            </button>
                            {r.status === 'pending' && (
                              <>
                                <button
                                  className="btn btn-sm"
                                  title="Approve"
                                  style={{ padding: '2px 8px', background: '#0ab39c', color: '#fff', fontSize: 12, borderRadius: 6 }}
                                  onClick={() => openApprove(r)}
                                >
                                  <i className="bi bi-check-lg me-1" />Approve
                                </button>
                                <button
                                  className="btn btn-sm"
                                  title="Reject"
                                  style={{ padding: '2px 8px', background: '#dc3545', color: '#fff', fontSize: 12, borderRadius: 6 }}
                                  onClick={() => { setRejecting(r); setRejectNotes(''); setSaveError('') }}
                                >
                                  <i className="bi bi-x-lg" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center mt-3">
                <small style={{ color: 'var(--bs-secondary-color)' }}>
                  Showing {paginated.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} records
                </small>
                {totalPages > 1 && (
                  <nav>
                    <ul className="pagination pagination-sm mb-0">
                      <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setPage(1)}>«</button>
                      </li>
                      <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setPage(p => p - 1)}>‹</button>
                      </li>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .reduce<(number | string)[]>((acc, p, i, arr) => {
                          if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                          acc.push(p); return acc
                        }, [])
                        .map((p, i) => p === '...'
                          ? <li key={`e${i}`} className="page-item disabled"><span className="page-link">…</span></li>
                          : <li key={p} className={`page-item ${page === p ? 'active' : ''}`}>
                              <button className="page-link" onClick={() => setPage(p as number)}>{p}</button>
                            </li>
                        )}
                      <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setPage(p => p + 1)}>›</button>
                      </li>
                      <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setPage(totalPages)}>»</button>
                      </li>
                    </ul>
                  </nav>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── View Detail Modal ──────────────────────────────────────────────── */}
      {viewing && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content" style={{ borderRadius: 12, border: 'none' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>
                    Address Change Request
                  </h5>
                  <small style={{ color: 'var(--bs-secondary-color)' }}>
                    {viewing.mumin?.full_name} · SF# {viewing.mumin?.sf_no}
                  </small>
                </div>
                <button className="btn-close" onClick={() => setViewing(null)} />
              </div>
              <div className="modal-body">

                {/* Status */}
                <div className="mb-3">
                  {(() => {
                    const cfg = STATUS_CONFIG[viewing.status]
                    return (
                      <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: 13, padding: '6px 14px', borderRadius: 20 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: cfg.dot, marginRight: 6 }} />
                        {cfg.label}
                      </span>
                    )
                  })()}
                </div>

                <div className="row g-3">
                  {/* Current vs Requested */}
                  <div className="col-md-6">
                    <div className="p-3 rounded" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                      <div className="fw-semibold mb-2" style={{ color: 'var(--bs-secondary-color)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Current Address</div>
                      <div style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>{viewing.old_address || <span style={{ color: 'var(--bs-secondary-color)' }}>Not recorded</span>}</div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="p-3 rounded" style={{ background: '#e8f4fd', border: '1px solid #b8d9f4' }}>
                      <div className="fw-semibold mb-2" style={{ color: '#1a6898', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Requested New Address</div>
                      <div style={{ color: 'var(--bs-body-color)', fontSize: 14, fontWeight: 500 }}>{viewing.new_full_address || '—'}</div>
                      {viewing.new_address_sector_id && (
                        <div className="mt-1" style={{ fontSize: 12, color: '#364574' }}>
                          <i className="bi bi-geo-alt me-1" />{getSector(viewing.new_address_sector_id)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="col-12">
                    <div className="p-3 rounded" style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}>
                      <div className="fw-semibold mb-3" style={{ color: 'var(--bs-secondary-color)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Requested Address Details</div>
                      <div className="row g-2" style={{ fontSize: 13 }}>
                        {[
                          ['House Type',   getType(viewing.new_address_type_id)   || '—'],
                          ['Block',        getBlock(viewing.new_address_block_id) || '—'],
                          ['Sector',       getSector(viewing.new_address_sector_id)],
                          ['Flat/House #', viewing.new_address_number   || '—'],
                          ['Category',     viewing.new_address_category || '—'],
                          ['Floor',        getFloor(viewing.new_address_floor)],
                        ].map(([label, value]) => (
                          <div key={label} className="col-6 col-md-4">
                            <div style={{ color: 'var(--bs-secondary-color)', fontSize: 11 }}>{label}</div>
                            <div style={{ color: 'var(--bs-body-color)', fontWeight: 500 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Distributor info */}
                  {viewing.new_address_sector_id && (() => {
                    const dist = getDistributor(viewing.new_address_sector_id)
                    return (
                      <div className="col-12">
                        <div className="p-3 rounded d-flex align-items-center gap-3" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                          <i className="bi bi-truck" style={{ fontSize: 18, color: '#364574' }} />
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Distributor for {getSector(viewing.new_address_sector_id)}</div>
                            <div style={{ fontSize: 14, color: 'var(--bs-body-color)', fontWeight: 600 }}>{dist ? dist.full_name : <span style={{ color: 'var(--bs-secondary-color)' }}>None assigned</span>}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Admin notes */}
                  {viewing.admin_notes && (
                    <div className="col-12">
                      <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Admin Notes</div>
                      <div style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>{viewing.admin_notes}</div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="col-12">
                    <div className="d-flex gap-4" style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                      <div>Requested: <strong>{formatDate(viewing.requested_at)}</strong></div>
                      {viewing.reviewed_at && <div>Reviewed: <strong>{formatDate(viewing.reviewed_at)}</strong></div>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                {viewing.status === 'pending' ? (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#0ab39c', color: '#fff' }}
                    onClick={() => { openApprove(viewing); setViewing(null) }}
                  >
                    <i className="bi bi-check-circle me-1" />Review & Approve
                  </button>
                ) : (
                  <button className="btn btn-sm btn-secondary" onClick={() => setViewing(null)}>Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Modal ──────────────────────────────────────────────────── */}
      {approving && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content" style={{ borderRadius: 12, border: 'none' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>
                    Approve Address Change
                  </h5>
                  <small style={{ color: 'var(--bs-secondary-color)' }}>
                    {approving.mumin?.full_name} · SF# {approving.mumin?.sf_no}
                  </small>
                </div>
                <button className="btn-close" onClick={() => setApproving(null)} disabled={saving} />
              </div>

              <div className="modal-body">
                {/* Current address strip */}
                <div className="mb-4 p-3 rounded" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Current Address on Record</div>
                  <div style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>{approving.old_address || <span style={{ color: 'var(--bs-secondary-color)' }}>Not recorded</span>}</div>
                </div>

                {/* Editable address form — same layout as HOF form */}
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  New Address — Review & Confirm
                </p>

                <div className="row g-3">
                  <div className="col-4">
                    <label style={labelStyle}>House Type</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_type_id} onChange={e => af('address_type_id', e.target.value)}>
                      <option value="">— Select —</option>
                      {houseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Number</label>
                    <input className="form-control form-control-sm" placeholder="e.g. 4" value={approvalForm.address_number} onChange={e => af('address_number', e.target.value)} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Category (A–Z)</label>
                    <input className="form-control form-control-sm" placeholder="e.g. A or 2" value={approvalForm.address_category} onChange={e => af('address_category', e.target.value)} maxLength={5} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Floor</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_floor} onChange={e => af('address_floor', e.target.value)}>
                      <option value="">— Select —</option>
                      {FLOOR_OPTIONS.map(fl => <option key={fl.value} value={fl.value}>{fl.label}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Block</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_block_id} onChange={e => af('address_block_id', e.target.value)}>
                      <option value="">— Select —</option>
                      {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Sector</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_sector_id} onChange={e => af('address_sector_id', e.target.value)}>
                      <option value="">— Select Sector —</option>
                      {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  {/* Address preview */}
                  <div className="col-12">
                    <label style={labelStyle}>Full Address Preview</label>
                    <div style={{
                      background: 'var(--bs-secondary-bg)', borderRadius: 6, padding: '8px 12px',
                      fontSize: 13, minHeight: 36,
                      color: approvalPreview ? '#364574' : 'var(--bs-secondary-color)',
                      borderLeft: `3px solid ${approvalPreview ? '#ffbf69' : 'var(--bs-border-color)'}`,
                    }}>
                      {approvalPreview || 'Fill in fields above to preview…'}
                    </div>
                  </div>

                  {/* Sector + Distributor info */}
                  {approvalForm.address_sector_id && (() => {
                    const sectorId = Number(approvalForm.address_sector_id)
                    const dist = getDistributor(sectorId)
                    return (
                      <div className="col-12">
                        <div className="p-3 rounded d-flex align-items-center gap-3" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                          <i className="bi bi-truck" style={{ fontSize: 20, color: '#364574', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                              Distributor for {getSector(sectorId)}
                            </div>
                            <div style={{ fontSize: 14, color: 'var(--bs-body-color)', fontWeight: 600 }}>
                              {dist ? dist.full_name : <span style={{ color: 'var(--bs-secondary-color)' }}>None assigned to this sector</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Sector change warning if different from current */}
                  {approvalForm.address_sector_id && approving.mumin_id && (() => {
                    const newSectorId = Number(approvalForm.address_sector_id)
                    const origSectorId = approving.new_address_sector_id
                    return newSectorId !== origSectorId ? (
                      <div className="col-12">
                        <div className="alert alert-warning py-2 mb-0" style={{ fontSize: 13 }}>
                          <i className="bi bi-exclamation-triangle me-2" />
                          You changed the sector from <strong>{getSector(origSectorId)}</strong> to <strong>{getSector(newSectorId)}</strong>. Please reassign the distributor if needed after saving.
                        </div>
                      </div>
                    ) : null
                  })()}

                  {/* Admin notes */}
                  <div className="col-12">
                    <label style={labelStyle}>Admin Notes <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      placeholder="Notes for this approval..."
                      value={adminNotes}
                      onChange={e => setAdminNotes(e.target.value)}
                    />
                  </div>

                  {saveError && (
                    <div className="col-12">
                      <div className="alert alert-danger py-2 mb-0" style={{ fontSize: 13 }}>{saveError}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)', gap: 8 }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setApproving(null)} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#0ab39c', color: '#fff', minWidth: 130 }}
                  onClick={handleApprove}
                  disabled={saving || !approvalPreview}
                >
                  {saving
                    ? <span className="spinner-border spinner-border-sm" />
                    : <><i className="bi bi-check-circle me-1" />Save & Approve</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ───────────────────────────────────────────────────── */}
      {rejecting && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: 12, border: 'none' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>Reject Request</h5>
                <button className="btn-close" onClick={() => setRejecting(null)} disabled={saving} />
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 14, color: 'var(--bs-body-color)', marginBottom: 12 }}>
                  Reject address change request for <strong>{rejecting.mumin?.full_name}</strong>?
                </p>
                <label style={labelStyle}>Reason <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  placeholder="Reason for rejection..."
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                />
                {saveError && (
                  <div className="alert alert-danger py-2 mt-2 mb-0" style={{ fontSize: 13 }}>{saveError}</div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)', gap: 8 }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setRejecting(null)} disabled={saving}>Cancel</button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#dc3545', color: '#fff', minWidth: 100 }}
                  onClick={handleReject}
                  disabled={saving}
                >
                  {saving ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-x-circle me-1" />Reject</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}