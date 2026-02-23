'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Thaali { id: number; thaali_number: number; status: string }
interface Registration {
  id: number; mumin_id: number; thaali_id: number; thaali_type_id: number
  thaali_category_id: number; distributor_id: number; fiscal_year_id: number
  start_date: string; end_date: string; status: string; remarks: string
  mumineen?: { sf_no: string; full_name: string }
  thaalis?: { thaali_number: number }
  thaali_types?: { name: string }
  thaali_categories?: { name: string }
  distributors?: { full_name: string }
  fiscal_years?: { gregorian_year: number; hijri_year: string }
}
interface Mumin { id: number; sf_no: string; full_name: string }
interface Distributor { id: number; full_name: string }
interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }
interface LookupItem { id: number; name: string }

const PAGE_SIZE = 50
const REG_STATUSES = ['pending', 'approved', 'stopped', 'required distributor', 'transfered', 'not required']

export default function ThaaliPage() {
  const [activeTab, setActiveTab] = useState<'thaalis' | 'registrations'>('thaalis')

  const [thaalis, setThaalis] = useState<Thaali[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Thaali | null>(null)
  const [thaaliNo, setThaaliNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 })

  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [regPage, setRegPage] = useState(0)
  const [regTotal, setRegTotal] = useState(0)
  const [regSearchInput, setRegSearchInput] = useState('')
  const [regSearch, setRegSearch] = useState('')
  const [showRegModal, setShowRegModal] = useState(false)
  const [editingReg, setEditingReg] = useState<Registration | null>(null)
  const [muminSearch, setMuminSearch] = useState('')
  const [muminResults, setMuminResults] = useState<Mumin[]>([])
  const [selectedMumin, setSelectedMumin] = useState<Mumin | null>(null)
  const [thaaliNumberInput, setThaaliNumberInput] = useState('')
  const [selectedThaaliId, setSelectedThaaliId] = useState<number | null>(null)
  const [thaaliLookupMsg, setThaaliLookupMsg] = useState('')
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [thaaliTypes, setThaaliTypes] = useState<LookupItem[]>([])
  const [thaaliCategories, setThaaliCategories] = useState<LookupItem[]>([])
  const [regForm, setRegForm] = useState({
    thaali_type_id: '', thaali_category_id: '',
    distributor_id: '', fiscal_year_id: '',
    start_date: '', end_date: '', status: 'approved', remarks: ''
  })
  const [formError, setFormError] = useState('')

  useEffect(() => { fetchThaalis(); fetchStats() }, [page, search, statusFilter])
  useEffect(() => { if (activeTab === 'registrations') { fetchRegistrations(); fetchLookups() } }, [activeTab, regPage, regSearch])

  const fetchThaalis = async () => {
    setLoading(true)
    let query = supabase.from('thaalis').select('*', { count: 'exact' })
      .order('thaali_number').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (search) query = query.eq('thaali_number', parseInt(search))
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const { data, count } = await query
    setThaalis(data || []); setTotalCount(count || 0); setLoading(false)
  }

  const fetchStats = async () => {
    const { count: total } = await supabase.from('thaalis').select('*', { count: 'exact', head: true })
    const { count: active } = await supabase.from('thaalis').select('*', { count: 'exact', head: true }).eq('status', 'active')
    setStats({ total: total || 0, active: active || 0, inactive: (total || 0) - (active || 0) })
  }

  const fetchRegistrations = async () => {
  setRegLoading(true)
  const { data, count, error } = await supabase
  .from('thaali_registrations')
  .select(`
    *,
    mumineen!fk_tr_mumin(sf_no, full_name),
    thaalis!fk_tr_thaali(thaali_number),
    thaali_types!fk_tr_type(name),
    thaali_categories!fk_tr_category(name),
    distributors!fk_tr_distributor(full_name),
    fiscal_years!fk_tr_fiscal(gregorian_year, hijri_year)
  `, { count: 'exact' })
  .order('id', { ascending: false })
  .range(regPage * PAGE_SIZE, (regPage + 1) * PAGE_SIZE - 1)
  
  console.log('data:', JSON.stringify(data))
  console.log('count:', count)
  console.log('error:', JSON.stringify(error))
  
  setRegistrations(data || [])
  setRegTotal(count || 0)
  setRegLoading(false)
}

  const fetchLookups = async () => {
    const [d, fy, tt, tc] = await Promise.all([
      supabase.from('distributors').select('id, full_name').eq('status', 'active').order('full_name'),
      supabase.from('fiscal_years').select('id, gregorian_year, hijri_year, is_active').order('id', { ascending: false }),
      supabase.from('thaali_types').select('id, name'),
      supabase.from('thaali_categories').select('id, name'),
    ])
    setDistributors(d.data || [])
    setFiscalYears(fy.data || [])
    setThaaliTypes(tt.data || [])
    setThaaliCategories(tc.data || [])
    const activeFY = (fy.data || []).find((f: FiscalYear) => f.is_active)
    if (activeFY) setRegForm(prev => ({ ...prev, fiscal_year_id: activeFY.id.toString() }))
  }

  const searchMumineen = async (q: string) => {
    setMuminSearch(q)
    setSelectedMumin(null)
    if (q.length < 2) { setMuminResults([]); return }
    const { data } = await supabase.from('mumineen').select('id, sf_no, full_name')
      .or(`full_name.ilike.%${q}%,sf_no.ilike.%${q}%`).eq('is_hof', true).limit(10)
    setMuminResults(data || [])
  }

  const lookupThaali = async (val: string) => {
    setThaaliNumberInput(val)
    setSelectedThaaliId(null)
    setThaaliLookupMsg('')
    if (!val) return
    const { data } = await supabase.from('thaalis').select('id, thaali_number, status')
      .eq('thaali_number', parseInt(val)).single()
    if (data) {
      setSelectedThaaliId(data.id)
      setThaaliLookupMsg(data.status === 'active' ? '✓ Thaali found' : '⚠ Thaali is inactive')
    } else {
      setThaaliLookupMsg('✗ Thaali not found')
    }
  }

  const openAddReg = () => {
    setEditingReg(null)
    setSelectedMumin(null)
    setMuminSearch('')
    setMuminResults([])
    setThaaliNumberInput('')
    setSelectedThaaliId(null)
    setThaaliLookupMsg('')
    setFormError('')
    const activeFY = fiscalYears.find(f => f.is_active)
    setRegForm({
      thaali_type_id: '', thaali_category_id: '', distributor_id: '',
      fiscal_year_id: activeFY ? activeFY.id.toString() : '',
      start_date: '', end_date: '', status: 'approved', remarks: ''
    })
    setShowRegModal(true)
  }

  const openEditReg = (r: Registration) => {
    setEditingReg(r)
    setSelectedMumin(r.mumineen ? { id: r.mumin_id, sf_no: r.mumineen.sf_no, full_name: r.mumineen.full_name } : null)
    setMuminSearch(r.mumineen ? `${r.mumineen.sf_no} — ${r.mumineen.full_name}` : '')
    setThaaliNumberInput(r.thaalis?.thaali_number?.toString() || '')
    setSelectedThaaliId(r.thaali_id)
    setThaaliLookupMsg(r.thaalis ? '✓ Thaali found' : '')
    setFormError('')
    setRegForm({
      thaali_type_id: r.thaali_type_id?.toString() || '',
      thaali_category_id: r.thaali_category_id?.toString() || '',
      distributor_id: r.distributor_id?.toString() || '',
      fiscal_year_id: r.fiscal_year_id?.toString() || '',
      start_date: r.start_date || '',
      end_date: r.end_date || '',
      status: r.status || 'approved',
      remarks: r.remarks || ''
    })
    setShowRegModal(true)
  }

  const handleSaveReg = async () => {
    setFormError('')
    if (!selectedMumin) { setFormError('Please select a Mumin'); return }
    if (!selectedThaaliId) { setFormError('Please enter a valid thaali number'); return }
    if (!regForm.distributor_id) { setFormError('Please select a distributor'); return }
    if (!regForm.fiscal_year_id) { setFormError('Please select a fiscal year'); return }
    setSaving(true)
    const payload = {
      mumin_id: selectedMumin.id,
      thaali_id: selectedThaaliId,
      thaali_type_id: regForm.thaali_type_id ? parseInt(regForm.thaali_type_id) : null,
      thaali_category_id: regForm.thaali_category_id ? parseInt(regForm.thaali_category_id) : null,
      distributor_id: parseInt(regForm.distributor_id),
      fiscal_year_id: parseInt(regForm.fiscal_year_id),
      start_date: regForm.start_date || null,
      end_date: regForm.end_date || null,
      status: regForm.status,
      remarks: regForm.remarks || null
    }
    if (editingReg) {
      await supabase.from('thaali_registrations').update(payload).eq('id', editingReg.id)
    } else {
      await supabase.from('thaali_registrations').insert(payload)
    }
    await fetchRegistrations()
    setShowRegModal(false)
    setSaving(false)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const regTotalPages = Math.ceil(regTotal / PAGE_SIZE)

  const openAdd = () => { setEditing(null); setThaaliNo(''); setShowModal(true) }
  const openEdit = (t: Thaali) => { setEditing(t); setThaaliNo(t.thaali_number.toString()); setShowModal(true) }
  const handleSave = async () => {
    if (!thaaliNo.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('thaalis').update({ thaali_number: parseInt(thaaliNo) }).eq('id', editing.id)
    } else {
      await supabase.from('thaalis').insert({ thaali_number: parseInt(thaaliNo) })
    }
    await fetchThaalis(); setShowModal(false); setSaving(false)
  }
  const toggleStatus = async (t: Thaali) => {
    await supabase.from('thaalis').update({ status: t.status === 'active' ? 'inactive' : 'active' }).eq('id', t.id)
    await fetchThaalis()
  }
  const handleSearch = () => { setPage(0); setSearch(searchInput) }
  const clearSearch = () => { setSearchInput(''); setSearch(''); setPage(0) }

  const statusColor: Record<string, string> = {
    approved: 'bg-success', pending: 'bg-warning text-dark', stopped: 'bg-danger',
    transfered: 'bg-info', 'not required': 'bg-secondary', 'required distributor': 'bg-primary'
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0">Thaali</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Manage thaali containers and registrations</p>
        </div>
        {activeTab === 'thaalis'
          ? <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Thaali</button>
          : <button className="btn btn-primary btn-sm" onClick={openAddReg}>+ New Registration</button>}
      </div>

      <div className="row g-3 mb-4">
        {[
          { label: 'Total Thaalis', value: stats.total, color: '#364574' },
          { label: 'Active', value: stats.active, color: '#0ab39c' },
          { label: 'Inactive', value: stats.inactive, color: '#f06548' },
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

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'thaalis' ? 'active' : ''}`} onClick={() => setActiveTab('thaalis')}>Thaali List</button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'registrations' ? 'active' : ''}`} onClick={() => setActiveTab('registrations')}>Registrations</button>
        </li>
      </ul>

      {activeTab === 'thaalis' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <div className="d-flex gap-2 mb-3 flex-wrap">
              <div className="input-group" style={{ maxWidth: '280px' }}>
                <input type="number" className="form-control form-control-sm" placeholder="Search thaali number..."
                  value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                {search && <button className="btn btn-sm btn-outline-secondary" onClick={clearSearch}>✕</button>}
                <button className="btn btn-sm btn-outline-primary" onClick={handleSearch}>Search</button>
              </div>
              <select className="form-select form-select-sm" style={{ maxWidth: '150px' }}
                value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(0) }}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <table className="table table-hover mb-0">
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>{['#', 'Thaali No', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {thaalis.map((t, i) => (
                      <tr key={t.id}>
                        <td style={{ fontSize: '13px', color: '#6c757d' }}>{page * PAGE_SIZE + i + 1}</td>
                        <td style={{ fontSize: '14px', fontWeight: 500 }}>{t.thaali_number}</td>
                        <td><span className={`badge ${t.status === 'active' ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '11px' }}>{t.status}</span></td>
                        <td>
                          <button className="btn btn-sm btn-outline-primary me-1" style={{ fontSize: '12px' }} onClick={() => openEdit(t)}>Edit</button>
                          <button className={`btn btn-sm ${t.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`} style={{ fontSize: '12px' }} onClick={() => toggleStatus(t)}>
                            {t.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {thaalis.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-4">No thaalis found</td></tr>}
                  </tbody>
                </table>
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <small className="text-muted">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</small>
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
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'registrations' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <div className="d-flex gap-2 mb-3">
              <div className="input-group" style={{ maxWidth: '300px' }}>
                <input type="text" className="form-control form-control-sm" placeholder="Search by SF#..."
                  value={regSearchInput} onChange={(e) => setRegSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setRegPage(0); setRegSearch(regSearchInput) } }} />
                <button className="btn btn-sm btn-outline-primary" onClick={() => { setRegPage(0); setRegSearch(regSearchInput) }}>Search</button>
              </div>
            </div>
            {regLoading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>{['#', 'SF#', 'Mumin Name', 'Thaali No', 'Type', 'Category', 'Distributor', 'Fiscal Year', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {registrations.map((r, i) => (
                      <tr key={r.id}>
                        <td style={{ color: '#6c757d' }}>{regPage * PAGE_SIZE + i + 1}</td>
                        <td>{r.mumineen?.sf_no || '—'}</td>
                        <td>{r.mumineen?.full_name || '—'}</td>
                        <td>{r.thaalis?.thaali_number || '—'}</td>
                        <td>{r.thaali_types?.name || '—'}</td>
                        <td>{r.thaali_categories?.name || '—'}</td>
                        <td>{r.distributors?.full_name || '—'}</td>
                        <td>{r.fiscal_years ? `${r.fiscal_years.gregorian_year} / ${r.fiscal_years.hijri_year}` : '—'}</td>
                        <td><span className={`badge ${statusColor[r.status] || 'bg-secondary'}`} style={{ fontSize: '10px' }}>{r.status}</span></td>
                        <td><button className="btn btn-sm btn-outline-primary" style={{ fontSize: '11px' }} onClick={() => openEditReg(r)}>Edit</button></td>
                      </tr>
                    ))}
                    {registrations.length === 0 && <tr><td colSpan={10} className="text-center text-muted py-4">No registrations found</td></tr>}
                  </tbody>
                </table>
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <small className="text-muted">Showing {regPage * PAGE_SIZE + 1}–{Math.min((regPage + 1) * PAGE_SIZE, regTotal)} of {regTotal}</small>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" disabled={regPage === 0} onClick={() => setRegPage(0)}>«</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={regPage === 0} onClick={() => setRegPage(p => p - 1)}>‹</button>
                    {Array.from({ length: Math.min(5, regTotalPages) }, (_, i) => {
                      const pageNum = Math.max(0, Math.min(regPage - 2, regTotalPages - 5)) + i
                      return <button key={pageNum} className={`btn btn-sm ${pageNum === regPage ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setRegPage(pageNum)}>{pageNum + 1}</button>
                    })}
                    <button className="btn btn-sm btn-outline-secondary" disabled={regPage >= regTotalPages - 1} onClick={() => setRegPage(p => p + 1)}>›</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={regPage >= regTotalPages - 1} onClick={() => setRegPage(regTotalPages - 1)}>»</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Thaali' : 'Add Thaali'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Thaali Number</label>
                <input type="number" className="form-control" value={thaaliNo}
                  onChange={(e) => setThaaliNo(e.target.value)} placeholder="e.g. 1" autoFocus />
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRegModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingReg ? 'Edit Registration' : 'New Registration'}</h5>
                <button className="btn-close" onClick={() => setShowRegModal(false)} />
              </div>
              <div className="modal-body">
                {formError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{formError}</div>}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Mumin (HOF) *</label>
                    <input type="text" className="form-control form-control-sm"
                      placeholder="Type name or SF# to search..."
                      value={muminSearch} onChange={(e) => searchMumineen(e.target.value)} />
                    {muminResults.length > 0 && (
                      <div className="border rounded mt-1" style={{ maxHeight: '150px', overflowY: 'auto', zIndex: 100, position: 'relative', background: '#fff' }}>
                        {muminResults.map(m => (
                          <div key={m.id} className="px-3 py-2" style={{ cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f0f0f0' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f0f4ff')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                            onClick={() => { setSelectedMumin(m); setMuminSearch(`${m.sf_no} — ${m.full_name}`); setMuminResults([]) }}>
                            <strong>{m.sf_no}</strong> — {m.full_name}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedMumin && <small className="text-success mt-1 d-block">✓ {selectedMumin.sf_no} — {selectedMumin.full_name}</small>}
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Number *</label>
                    <input type="number" className="form-control form-control-sm"
                      placeholder="Type thaali number..."
                      value={thaaliNumberInput} onChange={(e) => lookupThaali(e.target.value)} />
                    {thaaliLookupMsg && (
                      <small className={`mt-1 d-block ${thaaliLookupMsg.startsWith('✓') ? 'text-success' : 'text-danger'}`}>
                        {thaaliLookupMsg}
                      </small>
                    )}
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Fiscal Year *</label>
                    <select className="form-select form-select-sm" value={regForm.fiscal_year_id}
                      onChange={(e) => setRegForm(prev => ({ ...prev, fiscal_year_id: e.target.value }))}>
                      <option value="">Select fiscal year</option>
                      {fiscalYears.map(fy => (
                        <option key={fy.id} value={fy.id}>{fy.gregorian_year} / {fy.hijri_year}{fy.is_active ? ' (Current)' : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Type</label>
                    <select className="form-select form-select-sm" value={regForm.thaali_type_id}
                      onChange={(e) => setRegForm(prev => ({ ...prev, thaali_type_id: e.target.value }))}>
                      <option value="">Select type</option>
                      {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Category</label>
                    <select className="form-select form-select-sm" value={regForm.thaali_category_id}
                      onChange={(e) => setRegForm(prev => ({ ...prev, thaali_category_id: e.target.value }))}>
                      <option value="">Select category</option>
                      {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Distributor *</label>
                    <select className="form-select form-select-sm" value={regForm.distributor_id}
                      onChange={(e) => setRegForm(prev => ({ ...prev, distributor_id: e.target.value }))}>
                      <option value="">Select distributor</option>
                      {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Status</label>
                    <select className="form-select form-select-sm" value={regForm.status}
                      onChange={(e) => setRegForm(prev => ({ ...prev, status: e.target.value }))}>
                      {REG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Start Date</label>
                    <input type="date" className="form-control form-control-sm" value={regForm.start_date}
                      onChange={(e) => setRegForm(prev => ({ ...prev, start_date: e.target.value }))} />
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>End Date</label>
                    <input type="date" className="form-control form-control-sm" value={regForm.end_date}
                      onChange={(e) => setRegForm(prev => ({ ...prev, end_date: e.target.value }))} />
                  </div>

                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Remarks</label>
                    <textarea className="form-control form-control-sm" rows={2} value={regForm.remarks}
                      onChange={(e) => setRegForm(prev => ({ ...prev, remarks: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowRegModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveReg} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Registration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}