'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddressRequest {
  id: number
  mumin_id: number
  old_address: string | null
  new_address: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  requested_at: string
  reviewed_at: string | null
  created_at: string
  mumin?: { id: number; full_name: string; sf_no: string; its_no: string }
}

interface Sector      { id: number; name: string }
interface HouseBlock  { id: number; name: string }
interface HouseType   { id: number; name: string }
interface Distributor { id: number; full_name: string }
interface DistributorSector { sector_id: number; distributor_id: number; distributors: Distributor }

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const STATUS_META = {
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

function buildAddress(typeName: string, number: string, cat: string, floor: string, blockName: string, sectorName: string) {
  const parts: string[] = []
  const unit = `${typeName ? typeName + ' ' : ''}${number}${cat}`.trim()
  if (unit) parts.push(unit)
  if (floor) {
    const lbl = FLOOR_OPTIONS.find(f => f.value === floor)?.label || `${floor} Floor`
    parts.push(lbl)
  }
  if (blockName) parts.push(`Block ${blockName}`)
  if (sectorName) parts.push(sectorName)
  return parts.join(', ')
}

interface ApprovalForm {
  address_type_id: string
  address_block_id: string
  address_sector_id: string
  address_number: string
  address_category: string
  address_floor: string
  distributor_id: string
}

const formatDate = (s: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddressRequestsPage() {
  const [requests, setRequests]     = useState<AddressRequest[]>([])
  const [sectors, setSectors]       = useState<Sector[]>([])
  const [blocks, setBlocks]         = useState<HouseBlock[]>([])
  const [houseTypes, setHouseTypes] = useState<HouseType[]>([])
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [distributorSectors, setDistributorSectors] = useState<DistributorSector[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)

  // View modal
  const [viewing, setViewing]       = useState<AddressRequest | null>(null)

  // Approve modal
  const [approving, setApproving]   = useState<AddressRequest | null>(null)
  const [approvalForm, setApprovalForm] = useState<ApprovalForm>({
    address_type_id: '', address_block_id: '', address_sector_id: '',
    address_number: '', address_category: '', address_floor: '', distributor_id: '',
  })
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')

  // Reject modal
  const [rejecting, setRejecting]   = useState<AddressRequest | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [search, statusFilter])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true)
    const [
      { data: reqs },
      { data: secs },
      { data: blks },
      { data: hts },
      { data: dists },
      { data: distSectors },
    ] = await Promise.all([
      supabase.from('address_change_requests')
        .select('*, mumin:mumineen(id, full_name, sf_no, its_no)')
        .order('requested_at', { ascending: false }),
      supabase.from('house_sectors').select('id, name').order('name'),
      supabase.from('house_blocks').select('id, name').order('name'),
      supabase.from('house_types').select('id, name').order('name'),
      supabase.from('distributors').select('id, full_name').order('full_name'),
      supabase.from('distributor_sectors')
        .select('sector_id, distributor_id, distributors(id, full_name)')
        .order('sector_id'),
    ])
    setRequests((reqs || []) as AddressRequest[])
    setSectors(secs || [])
    setBlocks(blks || [])
    setHouseTypes(hts || [])
    setDistributors(dists || [])
    setDistributorSectors(distSectors || [])
    setLoading(false)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getSector = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getBlock  = (id: number | null) => blocks.find(b => b.id === id)?.name || ''
  const getType   = (id: number | null) => houseTypes.find(t => t.id === id)?.name || ''

  const getDistributorsForSector = (sectorId: number | null): Distributor[] => {
    if (!sectorId) return []
    return distributorSectors.filter(ds => ds.sector_id === sectorId).map(ds => ds.distributors)
  }

  const sectorName = (() => {
    const n = getSector(Number(approvalForm.address_sector_id) || null)
    return n === '—' ? '' : n
  })()

  const approvalPreview = buildAddress(
    getType(Number(approvalForm.address_type_id) || null),
    approvalForm.address_number,
    approvalForm.address_category,
    approvalForm.address_floor,
    getBlock(Number(approvalForm.address_block_id) || null),
    sectorName,
  )

  const effectiveDistributorId = (() => {
    if (approvalForm.distributor_id) return Number(approvalForm.distributor_id)
    const sds = getDistributorsForSector(Number(approvalForm.address_sector_id) || null)
    return sds.length === 1 ? sds[0].id : null
  })()

  const af = (field: keyof ApprovalForm, value: string) =>
    setApprovalForm(prev => ({ ...prev, [field]: value }))

  // ── Filter & Paginate ──────────────────────────────────────────────────────

  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    return r.status === statusFilter && (
      !search ||
      r.mumin?.full_name?.toLowerCase().includes(q) ||
      r.mumin?.sf_no?.toLowerCase().includes(q) ||
      r.mumin?.its_no?.toLowerCase().includes(q) ||
      r.new_address?.toLowerCase().includes(q) ||
      r.old_address?.toLowerCase().includes(q)
    )
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  const openApprove = (r: AddressRequest) => {
    setApproving(r)
    setApprovalForm({ address_type_id: '', address_block_id: '', address_sector_id: '', address_number: '', address_category: '', address_floor: '', distributor_id: '' })
    setAdminNotes('')
    setSaveError('')
  }

  const handleApprove = async () => {
    if (!approving) return
    if (!approvalPreview.trim()) { setSaveError('Fill in at least address number and sector.'); return }
    const sds = getDistributorsForSector(Number(approvalForm.address_sector_id) || null)
    if (sds.length > 1 && !approvalForm.distributor_id) { setSaveError('This sector has multiple distributors — select one.'); return }

    setSaving(true); setSaveError('')
    try {
      // Step 1 — update mumineen address
      const addressPayload: Record<string, any> = {
        full_address:     approvalPreview,
        address_number:   approvalForm.address_number   || null,
        address_category: approvalForm.address_category || null,
        address_floor:    approvalForm.address_floor    || null,
        change_address:   false,
      }
      if (approvalForm.address_type_id)   addressPayload.address_type_id   = Number(approvalForm.address_type_id)
      if (approvalForm.address_block_id)  addressPayload.address_block_id  = Number(approvalForm.address_block_id)
      if (approvalForm.address_sector_id) addressPayload.address_sector_id = Number(approvalForm.address_sector_id)

      const { data: muminRows, error: muminErr } = await supabase
        .from('mumineen')
        .update(addressPayload)
        .eq('id', approving.mumin_id)
        .select('id')

      if (muminErr) throw new Error(`Could not update address: ${muminErr.message}`)
      if (!muminRows || muminRows.length === 0) throw new Error(`Address update blocked — check RLS on mumineen (admin UPDATE).`)

      // Step 2 — update distributor in thaali_registrations
      if (effectiveDistributorId) {
        const { error: distErr } = await supabase
          .from('thaali_registrations')
          .update({ distributor_id: effectiveDistributorId })
          .eq('mumin_id', approving.mumin_id)
        if (distErr) console.warn('distributor update failed:', distErr.message)
      }

      // Step 3 — mark request approved
      const { error: reqErr } = await supabase
        .from('address_change_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), admin_notes: adminNotes || null })
        .eq('id', approving.id)
      if (reqErr) throw new Error(`Address saved but request status failed: ${reqErr.message}`)

      setApproving(null)
      fetchAll()
    } catch (e: any) {
      setSaveError(e.message || 'Unexpected error.')
      console.error('[handleApprove]', e)
    } finally {
      setSaving(false)
    }
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  const handleReject = async () => {
    if (!rejecting) return
    setSaving(true); setSaveError('')
    const { error } = await supabase
      .from('address_change_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), admin_notes: rejectNotes || null })
      .eq('id', rejecting.id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setRejecting(null)
    fetchAll()
    setSaving(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Address Change Requests</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>
            Review and approve address change requests from mumineen
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Pending',  value: counts.pending,  color: '#856404' },
          { label: 'Approved', value: counts.approved, color: '#0ab39c' },
          { label: 'Rejected', value: counts.rejected, color: '#dc3545' },
          { label: 'Total',    value: requests.length, color: '#364574' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
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
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search name, SF#, ITS#, address…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            {/* Status filter pills */}
            <div className="d-flex gap-1 ms-1">
              {(['pending', 'approved', 'rejected'] as const).map(s => (
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
                  {STATUS_META[s].label}
                  <span className="ms-1" style={{ opacity: 0.7 }}>({counts[s]})</span>
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
          ) : paginated.length === 0 ? (
            <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
              <i className="bi bi-inbox fs-3 d-block mb-2" />
              No {statusFilter} requests
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '13px', minWidth: '700px' }}>
                  <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                    <tr>
                      {['Mumin', 'SF# / ITS#', 'Current Address', 'Requested Address', 'Requested On',
                        ...(statusFilter !== 'pending' ? ['Reviewed On'] : []),
                        ''
                      ].map(h => (
                        <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, padding: '10px 12px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
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
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: 160 }}>
                          <span style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }} title={r.old_address || ''}>
                            {r.old_address ? (r.old_address.length > 40 ? r.old_address.slice(0, 40) + '…' : r.old_address) : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: 180 }}>
                          <span style={{ color: 'var(--bs-body-color)', fontSize: 12, fontWeight: 500 }} title={r.new_address || ''}>
                            {r.new_address ? (r.new_address.length > 45 ? r.new_address.slice(0, 45) + '…' : r.new_address) : '—'}
                          </span>
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
                              title="View"
                              style={{ padding: '2px 8px', color: '#299cdb', fontSize: 13 }}
                              onClick={() => setViewing(r)}
                            >
                              <i className="bi bi-eye" />
                            </button>
                            {r.status === 'pending' && (
                              <>
                                <button
                                  className="btn btn-sm"
                                  style={{ padding: '2px 8px', background: '#0ab39c', color: '#fff', fontSize: 12, borderRadius: 6 }}
                                  onClick={() => openApprove(r)}
                                >
                                  <i className="bi bi-check-lg me-1" />Approve
                                </button>
                                <button
                                  className="btn btn-sm"
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
              <div className="d-flex justify-content-between align-items-center px-3 py-2" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <small style={{ color: 'var(--bs-secondary-color)' }}>
                  Showing {paginated.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </small>
                {totalPages > 1 && (
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                      .reduce<(number | string)[]>((acc, p, i, arr) => {
                        if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…')
                        acc.push(p); return acc
                      }, [])
                      .map((p, i) => p === '…'
                        ? <span key={`e${i}`} className="btn btn-sm btn-outline-secondary disabled">…</span>
                        : <button key={p} className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPage(p as number)}>{p}</button>
                      )}
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── View Modal ────────────────────────────────────────────────────────── */}
      {viewing && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }} onClick={() => setViewing(null)}>
          <div className="modal-dialog modal-lg modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>Address Change Request</h5>
                  <small style={{ color: 'var(--bs-secondary-color)' }}>{viewing.mumin?.full_name} · SF# {viewing.mumin?.sf_no}</small>
                </div>
                <button className="btn-close" onClick={() => setViewing(null)} />
              </div>
              <div className="modal-body">
                {/* Status badge */}
                <div className="mb-3">
                  {(() => {
                    const m = STATUS_META[viewing.status]
                    return (
                      <span className="badge" style={{ background: m.bg, color: m.color, fontSize: 13, padding: '6px 14px', borderRadius: 20 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: m.dot, marginRight: 6 }} />
                        {m.label}
                      </span>
                    )
                  })()}
                </div>
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="p-3 rounded" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                      <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current Address</div>
                      <div style={{ fontSize: 14, color: 'var(--bs-body-color)' }}>{viewing.old_address || <span style={{ color: 'var(--bs-secondary-color)' }}>Not recorded</span>}</div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="p-3 rounded" style={{ background: '#e8f4fd', border: '1px solid #b8d9f4' }}>
                      <div style={{ fontSize: 11, color: '#1a6898', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Requested New Address</div>
                      <div style={{ fontSize: 14, color: 'var(--bs-body-color)', fontWeight: 500 }}>{viewing.new_address || '—'}</div>
                    </div>
                  </div>
                  {viewing.admin_notes && (
                    <div className="col-12">
                      <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Admin Notes</div>
                      <div style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>{viewing.admin_notes}</div>
                    </div>
                  )}
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
                  <button className="btn btn-sm" style={{ background: '#0ab39c', color: '#fff' }}
                    onClick={() => { openApprove(viewing); setViewing(null) }}>
                    <i className="bi bi-check-circle me-1" />Review & Approve
                  </button>
                ) : (
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setViewing(null)}>Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Modal ─────────────────────────────────────────────────────── */}
      {approving && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }} onClick={() => !saving && setApproving(null)}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>Approve Address Change</h5>
                  <small style={{ color: 'var(--bs-secondary-color)' }}>{approving.mumin?.full_name} · SF# {approving.mumin?.sf_no}</small>
                </div>
                <button className="btn-close" onClick={() => setApproving(null)} disabled={saving} />
              </div>

              <div className="modal-body">
                {/* Error at top */}
                {saveError && (
                  <div className="alert alert-danger d-flex align-items-start gap-2 mb-3 py-2" style={{ fontSize: 13, borderRadius: 8 }}>
                    <i className="bi bi-exclamation-triangle-fill mt-1" style={{ flexShrink: 0 }} />
                    <span>{saveError}</span>
                  </div>
                )}

                {/* Current address */}
                <div className="mb-3 p-3 rounded" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Current Address on Record</div>
                  <div style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>{approving.old_address || <span style={{ color: 'var(--bs-secondary-color)' }}>Not recorded</span>}</div>
                </div>

                {/* Requested address */}
                <div className="mb-4 p-3 rounded" style={{ background: '#e8f4fd', border: '1px solid #b8d9f4' }}>
                  <div style={{ fontSize: 11, color: '#1a6898', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Requested Address (From App)</div>
                  <div style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>{approving.new_address || '—'}</div>
                </div>

                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  New Address — Review & Confirm
                </p>

                <div className="row g-3">
                  <div className="col-4">
                    <label style={labelStyle}>House Type</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_type_id}
                      onChange={e => af('address_type_id', e.target.value)}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Select —</option>
                      {houseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Number</label>
                    <input className="form-control form-control-sm" placeholder="e.g. 4" value={approvalForm.address_number}
                      onChange={e => af('address_number', e.target.value)}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Category (A–Z)</label>
                    <input className="form-control form-control-sm" placeholder="e.g. A or 2" value={approvalForm.address_category}
                      onChange={e => af('address_category', e.target.value)} maxLength={5}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Floor</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_floor}
                      onChange={e => af('address_floor', e.target.value)}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Select —</option>
                      {FLOOR_OPTIONS.map(fl => <option key={fl.value} value={fl.value}>{fl.label}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Block</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_block_id}
                      onChange={e => af('address_block_id', e.target.value)}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Select —</option>
                      {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Sector</label>
                    <select className="form-select form-select-sm" value={approvalForm.address_sector_id}
                      onChange={e => { af('address_sector_id', e.target.value); af('distributor_id', '') }}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
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

                  {/* Distributor */}
                  {approvalForm.address_sector_id && (() => {
                    const sds = getDistributorsForSector(Number(approvalForm.address_sector_id))
                    return (
                      <div className="col-12">
                        <div className="p-3 rounded" style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                          <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                            <i className="bi bi-truck me-2" style={{ color: '#364574' }} />
                            Distributor — {getSector(Number(approvalForm.address_sector_id))}
                          </div>
                          {sds.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
                              <i className="bi bi-exclamation-circle me-2" />No distributors for this sector
                            </div>
                          ) : sds.length === 1 ? (
                            <div style={{ fontSize: 14, color: 'var(--bs-body-color)', fontWeight: 600 }}>
                              <i className="bi bi-check-circle me-2" style={{ color: '#0ab39c' }} />
                              {sds[0].full_name}
                              <span style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 400, marginLeft: 8 }}>(auto-assigned)</span>
                            </div>
                          ) : (
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 6 }}>Select Distributor <span className="text-danger">*</span></label>
                              <select className="form-select form-select-sm" value={approvalForm.distributor_id}
                                onChange={e => af('distributor_id', e.target.value)}
                                style={{ maxWidth: 300, background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                                <option value="">— Select Distributor —</option>
                                {sds.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                              </select>
                              <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)', marginTop: 4 }}>
                                {sds.length} distributors available
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Admin notes */}
                  <div className="col-12">
                    <label style={labelStyle}>Admin Notes <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                    <textarea className="form-control form-control-sm" rows={2}
                      placeholder="Notes for this approval…"
                      value={adminNotes}
                      onChange={e => setAdminNotes(e.target.value)}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)', gap: 8 }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setApproving(null)} disabled={saving}>Cancel</button>
                <button className="btn btn-sm" style={{ background: '#0ab39c', color: '#fff', minWidth: 130 }}
                  onClick={handleApprove} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-check-circle me-1" />Save & Approve</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ──────────────────────────────────────────────────────── */}
      {rejecting && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }} onClick={() => !saving && setRejecting(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>Reject Request</h5>
                <button className="btn-close" onClick={() => setRejecting(null)} disabled={saving} />
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 14, color: 'var(--bs-body-color)', marginBottom: 12 }}>
                  Reject address change request for <strong>{rejecting.mumin?.full_name}</strong>?
                </p>
                <label style={labelStyle}>Reason <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <textarea className="form-control form-control-sm" rows={3}
                  placeholder="Reason for rejection…"
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                {saveError && <div className="alert alert-danger py-2 mt-2 mb-0" style={{ fontSize: 13 }}>{saveError}</div>}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)', gap: 8 }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setRejecting(null)} disabled={saving}>Cancel</button>
                <button className="btn btn-sm" style={{ background: '#dc3545', color: '#fff', minWidth: 100 }}
                  onClick={handleReject} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-x-circle me-1" />Reject</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}