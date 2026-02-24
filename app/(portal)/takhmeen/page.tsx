'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Mumin {
  id: number; sf_no: string; full_name: string; its_no: string
  whatsapp_no: string; phone_no: string; full_address: string
  address_number: string; address_floor: string
  niyyat_status_id: number
  house_sectors?: { name: string }
  house_blocks?: { name: string }
  niyyat_statuses?: { name: string }
}

interface Takhmeen {
  id: number; mumin_id: number; fiscal_year_id: number
  thaali_type_id: number; thaali_category_id: number
  niyyat_amount: number; remarks: string; status: string
  fiscal_years?: { gregorian_year: number; hijri_year: string }
  thaali_types?: { name: string }
  thaali_categories?: { name: string }
}

interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }
interface LookupItem { id: number; name: string }

const PAGE_SIZE = 50

const STATUS_COLORS: Record<string, string> = {
  'Approved': 'bg-success',
  'Niyyat Pending': 'bg-warning text-dark',
  'No-Show': 'bg-secondary',
  'Verified': 'bg-info',
  'Pending Approval': 'bg-primary',
  'Stopped': 'bg-danger',
}

export default function TakhmeenPage() {
  const [activeTab, setActiveTab] = useState<'verification' | 'niyyat' | 'approval'>('verification')

  // Lookups
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [thaaliTypes, setThaaliTypes] = useState<LookupItem[]>([])
  const [thaaliCategories, setThaaliCategories] = useState<LookupItem[]>([])
  const [sectors, setSectors] = useState<LookupItem[]>([])
  const [activeFY, setActiveFY] = useState<FiscalYear | null>(null)
  const [niyyatStatuses, setNiyyatStatuses] = useState<LookupItem[]>([])

  // Shared
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterSector, setFilterSector] = useState('')

  // Verification tab
  const [verifyMumineen, setVerifyMumineen] = useState<Mumin[]>([])
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyingMumin, setVerifyingMumin] = useState<Mumin | null>(null)
  const [verifyForm, setVerifyForm] = useState({
    full_name: '', whatsapp_no: '', phone_no: '',
    address_number: '', address_floor: '', full_address: ''
  })

  // Niyyat tab
  const [niyyatMumineen, setNiyyatMumineen] = useState<Mumin[]>([])
  const [showNiyyatModal, setShowNiyyatModal] = useState(false)
  const [niyyatMumin, setNiyyatMumin] = useState<Mumin | null>(null)
  const [history, setHistory] = useState<Takhmeen[]>([])
  const [niyyatForm, setNiyyatForm] = useState({
    thaali_type_id: '', thaali_category_id: '',
    niyyat_amount: '', remarks: ''
  })

  // Approval tab
  const [approvalList, setApprovalList] = useState<(Takhmeen & { mumineen?: Mumin })[]>([])
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvingItem, setApprovingItem] = useState<(Takhmeen & { mumineen?: Mumin }) | null>(null)
  const [approvalForm, setApprovalForm] = useState({
    thaali_type_id: '', thaali_category_id: '',
    niyyat_amount: '', remarks: ''
  })

  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState({ noShow: 0, verified: 0, pendingApproval: 0, approved: 0 })

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchStats() }, [activeFY])
  useEffect(() => {
    setPage(0)
    if (activeTab === 'verification') fetchVerification()
    if (activeTab === 'niyyat') fetchNiyyat()
    if (activeTab === 'approval') fetchApproval()
  }, [activeTab])
  useEffect(() => {
    if (activeTab === 'verification') fetchVerification()
    if (activeTab === 'niyyat') fetchNiyyat()
    if (activeTab === 'approval') fetchApproval()
  }, [page, search, filterSector, activeFY])

  const fetchLookups = async () => {
    const [fy, tt, tc, s, ns] = await Promise.all([
      supabase.from('fiscal_years').select('*').order('id', { ascending: false }),
      supabase.from('thaali_types').select('id, name'),
      supabase.from('thaali_categories').select('id, name'),
      supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name'),
      supabase.from('niyyat_statuses').select('id, name'),
    ])
    setFiscalYears(fy.data || [])
    setThaaliTypes(tt.data || [])
    setThaaliCategories(tc.data || [])
    setSectors(s.data || [])
    setNiyyatStatuses(ns.data || [])
    const active = (fy.data || []).find((f: FiscalYear) => f.is_active)
    if (active) setActiveFY(active)
  }

  const fetchStats = async () => {
    if (!activeFY) return
    const getCount = async (statusName: string) => {
      const { data: statusData } = await supabase.from('niyyat_statuses').select('id').eq('name', statusName).single()
      if (!statusData) return 0
      const { count } = await supabase.from('mumineen').select('*', { count: 'exact', head: true })
        .eq('is_hof', true).eq('niyyat_status_id', statusData.id)
      return count || 0
    }
    const [noShow, verified, pendingApproval, approved] = await Promise.all([
      getCount('No-Show'), getCount('Verified'), getCount('Pending Approval'), getCount('Approved')
    ])
    setStats({ noShow, verified, pendingApproval, approved })
  }

  const fetchVerification = async () => {
    setLoading(true)
    const { data: statusData } = await supabase.from('niyyat_statuses').select('id').eq('name', 'No-Show').single()
    if (!statusData) { setLoading(false); return }

    let query = supabase.from('mumineen')
      .select('*, house_sectors(name), house_blocks(name), niyyat_statuses(name)', { count: 'exact' })
      .eq('is_hof', true).eq('niyyat_status_id', statusData.id)
      .order('full_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search) query = query.or(`full_name.ilike.%${search}%,sf_no.ilike.%${search}%,its_no.ilike.%${search}%`)
    if (filterSector) query = query.eq('address_sector_id', parseInt(filterSector))

    const { data, count } = await query
    setVerifyMumineen(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const fetchNiyyat = async () => {
    setLoading(true)
    const { data: statusData } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Verified').single()
    if (!statusData) { setLoading(false); return }

    let query = supabase.from('mumineen')
      .select('*, house_sectors(name), house_blocks(name), niyyat_statuses(name)', { count: 'exact' })
      .eq('is_hof', true).eq('niyyat_status_id', statusData.id)
      .order('full_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search) query = query.or(`full_name.ilike.%${search}%,sf_no.ilike.%${search}%,its_no.ilike.%${search}%`)
    if (filterSector) query = query.eq('address_sector_id', parseInt(filterSector))

    const { data, count } = await query
    setNiyyatMumineen(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const fetchApproval = async () => {
    if (!activeFY) return
    setLoading(true)

    let query = supabase.from('takhmeen')
      .select(`
        *,
        mumineen(sf_no, full_name, its_no, whatsapp_no, house_sectors(name), niyyat_statuses(name)),
        thaali_types(name),
        thaali_categories(name),
        fiscal_years(gregorian_year, hijri_year)
      `, { count: 'exact' })
      .eq('status', 'pending_approval')
      .eq('fiscal_year_id', activeFY.id)
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search) {
      // client-side filter after fetch for nested fields
    }

    const { data, count } = await query
    setApprovalList(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const openVerifyModal = (m: Mumin) => {
    setVerifyingMumin(m)
    setVerifyForm({
      full_name: m.full_name || '',
      whatsapp_no: m.whatsapp_no || '',
      phone_no: m.phone_no || '',
      address_number: m.address_number || '',
      address_floor: m.address_floor || '',
      full_address: m.full_address || '',
    })
    setShowVerifyModal(true)
  }

  const handleVerify = async () => {
    if (!verifyingMumin) return
    setSaving(true)
    const { data: verifiedStatus } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Verified').single()
    await supabase.from('mumineen').update({
      full_name: verifyForm.full_name,
      whatsapp_no: verifyForm.whatsapp_no,
      phone_no: verifyForm.phone_no,
      address_number: verifyForm.address_number,
      address_floor: verifyForm.address_floor,
      full_address: verifyForm.full_address,
      niyyat_status_id: verifiedStatus?.id,
    }).eq('id', verifyingMumin.id)
    await fetchVerification()
    await fetchStats()
    setShowVerifyModal(false)
    setSaving(false)
  }

  const openNiyyatModal = async (m: Mumin) => {
    setNiyyatMumin(m)
    setNiyyatForm({ thaali_type_id: '', thaali_category_id: '', niyyat_amount: '', remarks: '' })
    // Fetch last 5 years history
    const { data } = await supabase.from('takhmeen')
      .select('*, fiscal_years(gregorian_year, hijri_year), thaali_types(name), thaali_categories(name)')
      .eq('mumin_id', m.id)
      .order('fiscal_year_id', { ascending: false })
      .limit(5)
    setHistory(data || [])
    setShowNiyyatModal(true)
  }

  const handleSaveNiyyat = async () => {
    if (!niyyatMumin || !activeFY) return
    setSaving(true)
    const { data: pendingStatus } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Pending Approval').single()

    await supabase.from('takhmeen').insert({
      mumin_id: niyyatMumin.id,
      fiscal_year_id: activeFY.id,
      thaali_type_id: niyyatForm.thaali_type_id ? parseInt(niyyatForm.thaali_type_id) : null,
      thaali_category_id: niyyatForm.thaali_category_id ? parseInt(niyyatForm.thaali_category_id) : null,
      niyyat_amount: niyyatForm.niyyat_amount ? parseFloat(niyyatForm.niyyat_amount) : null,
      remarks: niyyatForm.remarks || null,
      status: 'pending_approval',
    })

    await supabase.from('mumineen').update({ niyyat_status_id: pendingStatus?.id }).eq('id', niyyatMumin.id)
    await fetchNiyyat()
    await fetchStats()
    setShowNiyyatModal(false)
    setSaving(false)
  }

  const openApprovalModal = (item: any) => {
    setApprovingItem(item)
    setApprovalForm({
      thaali_type_id: item.thaali_type_id?.toString() || '',
      thaali_category_id: item.thaali_category_id?.toString() || '',
      niyyat_amount: item.niyyat_amount?.toString() || '',
      remarks: item.remarks || '',
    })
    setShowApprovalModal(true)
  }

  const handleApprove = async () => {
    if (!approvingItem) return
    setSaving(true)
    const { data: approvedStatus } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Approved').single()

    await supabase.from('takhmeen').update({
      thaali_type_id: approvalForm.thaali_type_id ? parseInt(approvalForm.thaali_type_id) : null,
      thaali_category_id: approvalForm.thaali_category_id ? parseInt(approvalForm.thaali_category_id) : null,
      niyyat_amount: approvalForm.niyyat_amount ? parseFloat(approvalForm.niyyat_amount) : null,
      remarks: approvalForm.remarks || null,
      status: 'approved',
    }).eq('id', approvingItem.id)

    await supabase.from('mumineen').update({ niyyat_status_id: approvedStatus?.id }).eq('id', approvingItem.mumin_id)
    await fetchApproval()
    await fetchStats()
    setShowApprovalModal(false)
    setSaving(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const FilterBar = () => (
    <div className="d-flex gap-2 mb-3 flex-wrap">
      <div className="input-group input-group-sm" style={{ maxWidth: '280px' }}>
        <input type="text" className="form-control" placeholder="Search name, SF#, ITS#..."
          value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
        <button className="btn btn-outline-primary" onClick={() => { setSearch(searchInput); setPage(0) }}>Go</button>
        {search && <button className="btn btn-outline-secondary" onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}>✕</button>}
      </div>
      <select className="form-select form-select-sm" style={{ maxWidth: '180px' }} value={filterSector}
        onChange={(e) => { setFilterSector(e.target.value); setPage(0) }}>
        <option value="">All Sectors</option>
        {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )

  const Pagination = () => (
    <div className="d-flex justify-content-between align-items-center mt-3">
      <small className="text-muted">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</small>
      <div className="d-flex gap-1">
        <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)}>«</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
          return <button key={pageNum} className={`btn btn-sm ${pageNum === page ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPage(pageNum)}>{pageNum + 1}</button>
        })}
        <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0">Takhmeen</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Annual niyyat verification and approval</p>
        </div>
        <select className="form-select form-select-sm" style={{ maxWidth: '200px' }}
          value={activeFY?.id || ''} onChange={(e) => {
            const fy = fiscalYears.find(f => f.id === parseInt(e.target.value))
            if (fy) setActiveFY(fy)
          }}>
          {fiscalYears.map(fy => (
            <option key={fy.id} value={fy.id}>{fy.gregorian_year} / {fy.hijri_year}{fy.is_active ? ' ★' : ''}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'No-Show', value: stats.noShow, color: '#6c757d' },
          { label: 'Verified', value: stats.verified, color: '#0dcaf0' },
          { label: 'Pending Approval', value: stats.pendingApproval, color: '#0d6efd' },
          { label: 'Approved', value: stats.approved, color: '#0ab39c' },
        ].map((s, i) => (
          <div key={i} className="col-md-3">
            <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <div className="card-body p-3">
                <p className="text-muted mb-1" style={{ fontSize: '13px' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {[
          { key: 'verification', label: '1. Verification' },
          { key: 'niyyat', label: '2. Niyyat' },
          { key: 'approval', label: '3. Approval' },
        ].map(t => (
          <li key={t.key} className="nav-item">
            <button className={`nav-link ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key as any)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {/* VERIFICATION TAB */}
      {activeTab === 'verification' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <FilterBar />
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>{['#', 'SF#', 'ITS#', 'Name', 'Sector', 'Address', 'WhatsApp', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {verifyMumineen.map((m, i) => (
                      <tr key={m.id}>
                        <td style={{ color: '#6c757d' }}>{page * PAGE_SIZE + i + 1}</td>
                        <td>{m.sf_no}</td>
                        <td style={{ color: '#6c757d' }}>{m.its_no || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{m.full_name}</td>
                        <td>{m.house_sectors?.name || '—'}</td>
                        <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_address || '—'}</td>
                        <td>{m.whatsapp_no || '—'}</td>
                        <td><span className={`badge ${STATUS_COLORS[m.niyyat_statuses?.name || ''] || 'bg-secondary'}`} style={{ fontSize: '10px' }}>{m.niyyat_statuses?.name || '—'}</span></td>
                        <td><button className="btn btn-sm btn-primary" style={{ fontSize: '11px' }} onClick={() => openVerifyModal(m)}>Verify</button></td>
                      </tr>
                    ))}
                    {verifyMumineen.length === 0 && <tr><td colSpan={9} className="text-center text-muted py-4">No mumineen pending verification</td></tr>}
                  </tbody>
                </table>
                <Pagination />
              </>
            )}
          </div>
        </div>
      )}

      {/* NIYYAT TAB */}
      {activeTab === 'niyyat' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <FilterBar />
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>{['#', 'SF#', 'ITS#', 'Name', 'Sector', 'Address', 'WhatsApp', 'Action'].map(h => (
                      <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {niyyatMumineen.map((m, i) => (
                      <tr key={m.id}>
                        <td style={{ color: '#6c757d' }}>{page * PAGE_SIZE + i + 1}</td>
                        <td>{m.sf_no}</td>
                        <td style={{ color: '#6c757d' }}>{m.its_no || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{m.full_name}</td>
                        <td>{m.house_sectors?.name || '—'}</td>
                        <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_address || '—'}</td>
                        <td>{m.whatsapp_no || '—'}</td>
                        <td><button className="btn btn-sm btn-success" style={{ fontSize: '11px' }} onClick={() => openNiyyatModal(m)}>Enter Niyyat</button></td>
                      </tr>
                    ))}
                    {niyyatMumineen.length === 0 && <tr><td colSpan={8} className="text-center text-muted py-4">No verified mumineen pending niyyat</td></tr>}
                  </tbody>
                </table>
                <Pagination />
              </>
            )}
          </div>
        </div>
      )}

      {/* APPROVAL TAB */}
      {activeTab === 'approval' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>{['#', 'SF#', 'Name', 'Size', 'Type', 'Amount (Rs)', 'Remarks', 'Action'].map(h => (
                      <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {approvalList.map((item, i) => (
                      <tr key={item.id}>
                        <td style={{ color: '#6c757d' }}>{page * PAGE_SIZE + i + 1}</td>
                        <td>{(item as any).mumineen?.sf_no || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{(item as any).mumineen?.full_name || '—'}</td>
                        <td>{(item as any).thaali_types?.name || '—'}</td>
                        <td>{(item as any).thaali_categories?.name || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#364574' }}>
                          {item.niyyat_amount ? `Rs. ${Number(item.niyyat_amount).toLocaleString()}` : '—'}
                        </td>
                        <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.remarks || '—'}</td>
                        <td>
                          <button className="btn btn-sm btn-success" style={{ fontSize: '11px' }} onClick={() => openApprovalModal(item)}>
                            Review & Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                    {approvalList.length === 0 && <tr><td colSpan={8} className="text-center text-muted py-4">No pending approvals</td></tr>}
                  </tbody>
                </table>
                <Pagination />
              </>
            )}
          </div>
        </div>
      )}

      {/* VERIFY MODAL */}
      {showVerifyModal && verifyingMumin && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Verify — {verifyingMumin.sf_no}</h5>
                <button className="btn-close" onClick={() => setShowVerifyModal(false)} />
              </div>
              <div className="modal-body">
                <p className="text-muted mb-3" style={{ fontSize: '13px' }}>Review and update details before verifying.</p>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Full Name</label>
                    <input type="text" className="form-control form-control-sm" value={verifyForm.full_name}
                      onChange={(e) => setVerifyForm(p => ({ ...p, full_name: e.target.value }))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>WhatsApp</label>
                    <input type="text" className="form-control form-control-sm" value={verifyForm.whatsapp_no}
                      onChange={(e) => setVerifyForm(p => ({ ...p, whatsapp_no: e.target.value }))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Phone</label>
                    <input type="text" className="form-control form-control-sm" value={verifyForm.phone_no}
                      onChange={(e) => setVerifyForm(p => ({ ...p, phone_no: e.target.value }))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label" style={{ fontSize: '13px' }}>House Number</label>
                    <input type="text" className="form-control form-control-sm" value={verifyForm.address_number}
                      onChange={(e) => setVerifyForm(p => ({ ...p, address_number: e.target.value }))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label" style={{ fontSize: '13px' }}>Floor</label>
                    <input type="text" className="form-control form-control-sm" value={verifyForm.address_floor}
                      onChange={(e) => setVerifyForm(p => ({ ...p, address_floor: e.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Full Address</label>
                    <textarea className="form-control form-control-sm" rows={2} value={verifyForm.full_address}
                      onChange={(e) => setVerifyForm(p => ({ ...p, full_address: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowVerifyModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleVerify} disabled={saving}>
                  {saving ? 'Saving...' : '✓ Verify Mumin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NIYYAT MODAL */}
      {showNiyyatModal && niyyatMumin && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Enter Niyyat — {niyyatMumin.sf_no} {niyyatMumin.full_name}</h5>
                <button className="btn-close" onClick={() => setShowNiyyatModal(false)} />
              </div>
              <div className="modal-body">
                {/* History */}
                {history.length > 0 && (
                  <div className="mb-4">
                    <p className="fw-semibold mb-2" style={{ fontSize: '13px' }}>Past Takhmeen History</p>
                    <table className="table table-sm table-bordered mb-0" style={{ fontSize: '12px' }}>
                      <thead style={{ background: '#f8f9fa' }}>
                        <tr>
                          <th>Year</th>
                          <th>Size</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id}>
                            <td>{(h as any).fiscal_years?.gregorian_year} / {(h as any).fiscal_years?.hijri_year}</td>
                            <td>{(h as any).thaali_types?.name || '—'}</td>
                            <td>{(h as any).thaali_categories?.name || '—'}</td>
                            <td>{h.niyyat_amount ? `Rs. ${Number(h.niyyat_amount).toLocaleString()}` : '—'}</td>
                            <td><span className="badge bg-secondary" style={{ fontSize: '10px' }}>{h.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Niyyat Form */}
                <p className="fw-semibold mb-2" style={{ fontSize: '13px' }}>
                  New Niyyat — {activeFY?.gregorian_year} / {activeFY?.hijri_year}
                </p>
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Size</label>
                    <select className="form-select form-select-sm" value={niyyatForm.thaali_type_id}
                      onChange={(e) => setNiyyatForm(p => ({ ...p, thaali_type_id: e.target.value }))}>
                      <option value="">Select size</option>
                      {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Type</label>
                    <select className="form-select form-select-sm" value={niyyatForm.thaali_category_id}
                      onChange={(e) => setNiyyatForm(p => ({ ...p, thaali_category_id: e.target.value }))}>
                      <option value="">Select type</option>
                      {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Niyyat Amount (Rs.)</label>
                    <input type="number" className="form-control form-control-sm" value={niyyatForm.niyyat_amount}
                      onChange={(e) => setNiyyatForm(p => ({ ...p, niyyat_amount: e.target.value }))}
                      placeholder="e.g. 5000" />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Remarks</label>
                    <textarea className="form-control form-control-sm" rows={2} value={niyyatForm.remarks}
                      onChange={(e) => setNiyyatForm(p => ({ ...p, remarks: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowNiyyatModal(false)}>Cancel</button>
                <button className="btn btn-success btn-sm" onClick={handleSaveNiyyat} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Niyyat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL MODAL */}
      {showApprovalModal && approvingItem && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Review & Approve</h5>
                <button className="btn-close" onClick={() => setShowApprovalModal(false)} />
              </div>
              <div className="modal-body">
                <div className="alert alert-light py-2 mb-3" style={{ fontSize: '13px' }}>
                  <strong>{(approvingItem as any).mumineen?.sf_no}</strong> — {(approvingItem as any).mumineen?.full_name}
                </div>
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Size</label>
                    <select className="form-select form-select-sm" value={approvalForm.thaali_type_id}
                      onChange={(e) => setApprovalForm(p => ({ ...p, thaali_type_id: e.target.value }))}>
                      <option value="">Select size</option>
                      {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Type</label>
                    <select className="form-select form-select-sm" value={approvalForm.thaali_category_id}
                      onChange={(e) => setApprovalForm(p => ({ ...p, thaali_category_id: e.target.value }))}>
                      <option value="">Select type</option>
                      {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Niyyat Amount (Rs.)</label>
                    <input type="number" className="form-control form-control-sm" value={approvalForm.niyyat_amount}
                      onChange={(e) => setApprovalForm(p => ({ ...p, niyyat_amount: e.target.value }))}
                      placeholder="e.g. 5000" />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Remarks</label>
                    <textarea className="form-control form-control-sm" rows={2} value={approvalForm.remarks}
                      onChange={(e) => setApprovalForm(p => ({ ...p, remarks: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowApprovalModal(false)}>Cancel</button>
                <button className="btn btn-success btn-sm" onClick={handleApprove} disabled={saving}>
                  {saving ? 'Saving...' : '✓ Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}