'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Registration {
  id: number
  mumin_id: number
  thaali_id: number | null
  thaali_type_id: number | null
  thaali_category_id: number | null
  distributor_id: number | null
  fiscal_year_id: number | null
  status: string
  remarks: string
  mumineen?: {
    sf_no: string
    full_name: string
    its_no: string
    whatsapp_no: string
    full_address: string
    house_sectors?: { name: string }
  }
  thaalis?: { thaali_number: number }
  thaali_types?: { name: string }
  thaali_categories?: { name: string }
  distributors?: { full_name: string }
  fiscal_years?: { gregorian_year: number; hijri_year: string }
}

interface Thaali { id: number; thaali_number: number }
interface ThaaliType { id: number; name: string }
interface ThaaliCategory { id: number; name: string }
interface Distributor { id: number; full_name: string }
interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }
interface Mumin { id: number; sf_no: string; full_name: string; its_no: string }

const REG_STATUSES = ['approved', 'pending', 'stopped', 'transfered', 'not required', 'required distributor']
const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-success', pending: 'bg-warning text-dark', stopped: 'bg-danger',
  transfered: 'bg-info', 'not required': 'bg-secondary', 'required distributor': 'bg-primary'
}
const PAGE_SIZE = 50

export default function ThaaliRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats] = useState({ total: 0, approved: 0, inactive: 0, unassigned: 0 })

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFiscalYear, setFilterFiscalYear] = useState('')
  const [filterDistributor, setFilterDistributor] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  // Lookups
  const [thaaliNumbers, setThaaliNumbers] = useState<Thaali[]>([])
  const [thaaliTypes, setThaaliTypes] = useState<ThaaliType[]>([])
  const [thaaliCategories, setThaaliCategories] = useState<ThaaliCategory[]>([])
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Registration | null>(null)
  const [saving, setSaving] = useState(false)
  const [muminSearch, setMuminSearch] = useState('')
  const [muminResults, setMuminResults] = useState<Mumin[]>([])
  const [muminSearching, setMuminSearching] = useState(false)
  const [form, setForm] = useState({
    mumin_id: 0, mumin_label: '',
    thaali_id: '', thaali_type_id: '', thaali_category_id: '',
    distributor_id: '', fiscal_year_id: '', status: 'approved', remarks: ''
  })

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchRegistrations() }, [page, search, filterStatus, filterFiscalYear, filterDistributor, filterType, filterCategory])

  const fetchLookups = async () => {
    const [tn, tt, tc, d, fy] = await Promise.all([
      supabase.from('thaalis').select('id, thaali_number').order('thaali_number'),
      supabase.from('thaali_types').select('id, name').eq('status', 'active'),
      supabase.from('thaali_categories').select('id, name'),
      supabase.from('distributors').select('id, full_name').eq('status', 'active').order('full_name'),
      supabase.from('fiscal_years').select('*').order('id', { ascending: false }),
    ])
    setThaaliNumbers(tn.data || [])
    setThaaliTypes(tt.data || [])
    setThaaliCategories(tc.data || [])
    setDistributors(d.data || [])
    setFiscalYears(fy.data || [])
    const activeFY = (fy.data || []).find((f: FiscalYear) => f.is_active)
    if (activeFY) setFilterFiscalYear(activeFY.id.toString())
  }

  const fetchRegistrations = async () => {
    setLoading(true)
    let query = supabase
      .from('thaali_registrations')
      .select(`
        *,
        mumineen!fk_tr_mumin(sf_no, full_name, its_no, whatsapp_no, full_address, house_sectors(name)),
        thaalis!fk_tr_thaali(thaali_number),
        thaali_types!fk_tr_type(name),
        thaali_categories!fk_tr_category(name),
        distributors!fk_tr_distributor(full_name),
        fiscal_years!fk_tr_fiscal(gregorian_year, hijri_year)
      `, { count: 'exact' })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterStatus) query = query.eq('status', filterStatus)
    if (filterFiscalYear) query = query.eq('fiscal_year_id', parseInt(filterFiscalYear))
    if (filterDistributor) query = query.eq('distributor_id', parseInt(filterDistributor))
    if (filterType) query = query.eq('thaali_type_id', parseInt(filterType))
    if (filterCategory) query = query.eq('thaali_category_id', parseInt(filterCategory))

    const { data, count } = await query
    let filtered = data || []
    if (search) {
      filtered = filtered.filter((r: Registration) =>
        r.mumineen?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.mumineen?.sf_no?.toLowerCase().includes(search.toLowerCase()) ||
        r.mumineen?.its_no?.toLowerCase().includes(search.toLowerCase()) ||
        r.thaalis?.thaali_number?.toString().includes(search)
      )
    }
    setRegistrations(filtered)
    setTotal(count || 0)

    // Stats
    const [approved, inactive, unassigned] = await Promise.all([
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).not('status', 'eq', 'approved'),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).is('thaali_id', null),
    ])
    setStats({ total: count || 0, approved: approved.count || 0, inactive: inactive.count || 0, unassigned: unassigned.count || 0 })
    setLoading(false)
  }

  const searchMumin = async (val: string) => {
    setMuminSearch(val)
    if (val.length < 2) { setMuminResults([]); return }
    setMuminSearching(true)
    const { data } = await supabase.from('mumineen')
      .select('id, sf_no, full_name, its_no')
      .or(`full_name.ilike.%${val}%,sf_no.ilike.%${val}%,its_no.ilike.%${val}%`)
      .eq('is_hof', true).limit(10)
    setMuminResults(data || [])
    setMuminSearching(false)
  }

  const selectMumin = (m: Mumin) => {
    setForm(f => ({ ...f, mumin_id: m.id, mumin_label: `${m.sf_no} — ${m.full_name}` }))
    setMuminSearch(''); setMuminResults([])
  }

  const openAdd = () => {
    setEditing(null)
    const activeFY = fiscalYears.find(f => f.is_active)
    setForm({ mumin_id: 0, mumin_label: '', thaali_id: '', thaali_type_id: '', thaali_category_id: '', distributor_id: '', fiscal_year_id: activeFY?.id.toString() || '', status: 'approved', remarks: '' })
    setMuminSearch(''); setMuminResults([])
    setShowModal(true)
  }

  const openEdit = (r: Registration) => {
    setEditing(r)
    setForm({
      mumin_id: r.mumin_id,
      mumin_label: `${r.mumineen?.sf_no} — ${r.mumineen?.full_name}`,
      thaali_id: r.thaali_id?.toString() || '',
      thaali_type_id: r.thaali_type_id?.toString() || '',
      thaali_category_id: r.thaali_category_id?.toString() || '',
      distributor_id: r.distributor_id?.toString() || '',
      fiscal_year_id: r.fiscal_year_id?.toString() || '',
      status: r.status || 'approved',
      remarks: r.remarks || ''
    })
    setMuminSearch(''); setMuminResults([])
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.mumin_id) return
    setSaving(true)
    const payload = {
      mumin_id: form.mumin_id,
      thaali_id: form.thaali_id ? parseInt(form.thaali_id) : null,
      thaali_type_id: form.thaali_type_id ? parseInt(form.thaali_type_id) : null,
      thaali_category_id: form.thaali_category_id ? parseInt(form.thaali_category_id) : null,
      distributor_id: form.distributor_id ? parseInt(form.distributor_id) : null,
      fiscal_year_id: form.fiscal_year_id ? parseInt(form.fiscal_year_id) : null,
      status: form.status,
      remarks: form.remarks,
    }
    if (editing) {
      await supabase.from('thaali_registrations').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('thaali_registrations').insert(payload)
    }
    await fetchRegistrations()
    setShowModal(false)
    setSaving(false)
  }

  const quickStatus = async (r: Registration, status: string) => {
    await supabase.from('thaali_registrations').update({ status }).eq('id', r.id)
    await fetchRegistrations()
  }

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setFilterStatus('')
    setFilterDistributor(''); setFilterType(''); setFilterCategory('')
    const activeFY = fiscalYears.find(f => f.is_active)
    setFilterFiscalYear(activeFY ? activeFY.id.toString() : '')
    setPage(0)
  }

  const activeFilterCount = [filterStatus, filterDistributor, filterType, filterCategory, search].filter(Boolean).length
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Thaali Registrations</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Manage mumin thaali registrations</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Registration</button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Registrations', value: stats.total, color: '#364574' },
          { label: 'Active (Approved)', value: stats.approved, color: '#0ab39c' },
          { label: 'Inactive', value: stats.inactive, color: '#f06548' },
          { label: 'Unassigned Thaali', value: stats.unassigned, color: '#f7b84b' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <div className="card-body p-3">
                <p className="text-muted mb-1" style={{ fontSize: '13px' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="input-group input-group-sm" style={{ maxWidth: '320px', minWidth: '180px' }}>
          <input type="text" className="form-control" placeholder="SF#, Name, ITS#, Thaali#..."
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
          <button className="btn btn-outline-primary" onClick={() => { setSearch(searchInput); setPage(0) }}>Go</button>
        </div>
        <button className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setShowFilters(f => !f)}>
          <i className="bi bi-funnel me-1" />
          Filters {activeFilterCount > 0 && <span className="badge bg-danger ms-1">{activeFilterCount}</span>}
        </button>
        {(activeFilterCount > 0 || search) && (
          <button className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Collapsible filters */}
      {showFilters && (
        <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body py-3">
            <div className="row g-2">
              <div className="col-6 col-md-2">
                <label style={{ fontSize: '12px', color: '#6c757d' }}>Status</label>
                <select className="form-select form-select-sm" value={filterStatus}
                  onChange={e => { setFilterStatus(e.target.value); setPage(0) }}>
                  <option value="">All</option>
                  {REG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label style={{ fontSize: '12px', color: '#6c757d' }}>Fiscal Year</label>
                <select className="form-select form-select-sm" value={filterFiscalYear}
                  onChange={e => { setFilterFiscalYear(e.target.value); setPage(0) }}>
                  <option value="">All</option>
                  {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.gregorian_year} / {fy.hijri_year}{fy.is_active ? ' ★' : ''}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label style={{ fontSize: '12px', color: '#6c757d' }}>Distributor</label>
                <select className="form-select form-select-sm" value={filterDistributor}
                  onChange={e => { setFilterDistributor(e.target.value); setPage(0) }}>
                  <option value="">All</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label style={{ fontSize: '12px', color: '#6c757d' }}>Type</label>
                <select className="form-select form-select-sm" value={filterType}
                  onChange={e => { setFilterType(e.target.value); setPage(0) }}>
                  <option value="">All</option>
                  {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label style={{ fontSize: '12px', color: '#6c757d' }}>Category</label>
                <select className="form-select form-select-sm" value={filterCategory}
                  onChange={e => { setFilterCategory(e.target.value); setPage(0) }}>
                  <option value="">All</option>
                  {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '13px', minWidth: '900px' }}>
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>
                      {['#', 'SF#', 'Name', 'Thaali No', 'Type', 'Category', 'Distributor', 'FY', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r, i) => (
                      <tr key={r.id}>
                        <td style={{ color: '#6c757d', fontSize: '12px' }}>{page * PAGE_SIZE + i + 1}</td>
                        <td style={{ fontWeight: 600, color: '#364574' }}>{r.mumineen?.sf_no || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.mumineen?.full_name || '—'}</td>
                        <td style={{ fontWeight: 700 }}>
                          {r.thaalis?.thaali_number
                            ? <span style={{ color: '#364574' }}>#{r.thaalis.thaali_number}</span>
                            : <span className="badge bg-warning text-dark" style={{ fontSize: '10px' }}>Unassigned</span>}
                        </td>
                        <td>{r.thaali_types?.name || '—'}</td>
                        <td>{r.thaali_categories?.name || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{r.distributors?.full_name || '—'}</td>
                        <td style={{ fontSize: '11px', color: '#6c757d' }}>{r.fiscal_years?.gregorian_year || '—'}</td>
                        <td>
                          <span className={`badge ${STATUS_COLORS[r.status] || 'bg-secondary'}`} style={{ fontSize: '10px' }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-outline-primary me-1" style={{ fontSize: '11px' }}
                            onClick={() => openEdit(r)}>Edit</button>
                          {r.status !== 'approved' && (
                            <button className="btn btn-sm btn-outline-success me-1" style={{ fontSize: '11px' }}
                              onClick={() => quickStatus(r, 'approved')}>Approve</button>
                          )}
                          {r.status === 'approved' && (
                            <button className="btn btn-sm btn-outline-danger" style={{ fontSize: '11px' }}
                              onClick={() => quickStatus(r, 'stopped')}>Stop</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {registrations.length === 0 && (
                      <tr><td colSpan={10} className="text-center text-muted py-4">No registrations found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
                <small className="text-muted">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</small>
                <div className="d-flex gap-1 flex-wrap">
                  <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)}>«</button>
                  <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pn = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
                    return <button key={pn} className={`btn btn-sm ${pn === page ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPage(pn)}>{pn + 1}</button>
                  })}
                  <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
                  <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Registration' : 'Add Registration'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div className="row g-3">

                  {/* Mumin search */}
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Mumin (HOF) *</label>
                    {form.mumin_id ? (
                      <div className="d-flex align-items-center gap-2">
                        <div className="form-control form-control-sm" style={{ background: '#f8f9fa', flex: 1 }}>
                          {form.mumin_label}
                        </div>
                        {!editing && (
                          <button className="btn btn-sm btn-outline-secondary"
                            onClick={() => setForm(f => ({ ...f, mumin_id: 0, mumin_label: '' }))}>
                            Change
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <input type="text" className="form-control form-control-sm"
                          placeholder="Search by name, SF# or ITS#..."
                          value={muminSearch} onChange={e => searchMumin(e.target.value)} />
                        {muminSearching && <div style={{ fontSize: '12px', color: '#6c757d', padding: '4px' }}>Searching...</div>}
                        {muminResults.length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                            background: '#fff', border: '1px solid #dee2e6', borderRadius: '6px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto'
                          }}>
                            {muminResults.map(m => (
                              <div key={m.id} onClick={() => selectMumin(m)}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f0f0f0' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <strong>{m.sf_no}</strong> — {m.full_name}
                                <span style={{ color: '#6c757d', marginLeft: '8px', fontSize: '11px' }}>{m.its_no}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Number</label>
                    <select className="form-select form-select-sm" value={form.thaali_id}
                      onChange={e => setForm(f => ({ ...f, thaali_id: e.target.value }))}>
                      <option value="">— Unassigned —</option>
                      {thaaliNumbers.map(t => <option key={t.id} value={t.id}>#{t.thaali_number}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Thaali Type</label>
                    <select className="form-select form-select-sm" value={form.thaali_type_id}
                      onChange={e => setForm(f => ({ ...f, thaali_type_id: e.target.value }))}>
                      <option value="">Select type</option>
                      {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Category (Size)</label>
                    <select className="form-select form-select-sm" value={form.thaali_category_id}
                      onChange={e => setForm(f => ({ ...f, thaali_category_id: e.target.value }))}>
                      <option value="">Select category</option>
                      {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Distributor</label>
                    <select className="form-select form-select-sm" value={form.distributor_id}
                      onChange={e => setForm(f => ({ ...f, distributor_id: e.target.value }))}>
                      <option value="">Select distributor</option>
                      {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Fiscal Year</label>
                    <select className="form-select form-select-sm" value={form.fiscal_year_id}
                      onChange={e => setForm(f => ({ ...f, fiscal_year_id: e.target.value }))}>
                      <option value="">Select year</option>
                      {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.gregorian_year} / {fy.hijri_year}{fy.is_active ? ' ★' : ''}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Status</label>
                    <select className="form-select form-select-sm" value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {REG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Remarks</label>
                    <textarea className="form-control form-control-sm" rows={2}
                      placeholder="Optional notes..." value={form.remarks}
                      onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.mumin_id}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}