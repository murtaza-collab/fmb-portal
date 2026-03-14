'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Thaali {
  id: number
  thaali_number: number
  status: string
}

interface ThaaliType {
  id: number
  name: string
  status: string
}

interface ThaaliCategory {
  id: number
  name: string
  description?: string
}

interface Registration {
  id: number
  mumin_id: number
  thaali_id: number | null
  thaali_type_id: number | null
  thaali_category_id: number | null
  distributor_id: number | null
  remarks: string
  mumineen?: {
    sf_no: string
    full_name: string
    its_no: string
  }
  thaalis?: { thaali_number: number }
  thaali_types?: { name: string }
  thaali_categories?: { name: string }
  distributors?: { full_name: string }
}

interface Mumin { id: number; sf_no: string; full_name: string; its_no: string }
interface Distributor { id: number; full_name: string }

const PAGE_SIZE = 50

// ─── Root Page ────────────────────────────────────────────────────────────────

export default function ThaaliPage() {
  const [activeTab, setActiveTab] = useState<'registrations' | 'numbers' | 'types' | 'categories'>('registrations')
  const [stats, setStats] = useState({ totalNumbers: 0, totalRegs: 0, assigned: 0, unassigned: 0 })

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    const [nums, totalRegs, assigned] = await Promise.all([
      supabase.from('thaalis').select('*', { count: 'exact', head: true }),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).not('thaali_id', 'is', null),
    ])
    const t = totalRegs.count || 0
    const a = assigned.count || 0
    setStats({
      totalNumbers: nums.count || 0,
      totalRegs: t,
      assigned: a,
      unassigned: t - a,  // registrations not yet assigned a thaali number
    })
  }

  const TABS = [
    { key: 'registrations', label: 'Registrations' },
    { key: 'numbers',       label: 'Thaali Numbers' },
    { key: 'types',         label: 'Types' },
    { key: 'categories',    label: 'Categories' },
  ] as const

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Thaali</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>
            Manage thaali numbers, registrations, types and categories
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Thaali Numbers', value: stats.totalNumbers, color: '#364574' },
          { label: 'Registrations',  value: stats.totalRegs,    color: '#405189' },
          { label: 'Assigned',       value: stats.assigned,     color: '#0ab39c',  title: 'Registrations with a thaali number' },
          { label: 'No Number Yet',  value: stats.unassigned,   color: '#f06548',  title: 'Registrations without a thaali number assigned' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="card" title={(s as any).title} style={{
              border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              borderRadius: '10px', background: 'var(--bs-body-bg)',
            }}>
              <div className="card-body p-3">
                <p className="mb-1" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {TABS.map(t => (
          <li key={t.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === t.key ? 'active' : ''}`}
              style={{ fontSize: '13px' }}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'registrations' && <RegistrationsTab onStatsChange={fetchStats} />}
      {activeTab === 'numbers'       && <NumbersTab onStatsChange={fetchStats} />}
      {activeTab === 'types'         && <TypesTab />}
      {activeTab === 'categories'    && <CategoriesTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — REGISTRATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function RegistrationsTab({ onStatsChange }: { onStatsChange: () => void }) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  // FIX: ready flag — don't fetch registrations until lookups (and active FY) are loaded
  const [lookupsReady, setLookupsReady] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filterDistributor, setFilterDistributor] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const [allThaalis, setAllThaalis] = useState<Thaali[]>([])
  const [availableThaalis, setAvailableThaalis] = useState<Thaali[]>([])
  const [thaaliTypes, setThaaliTypes] = useState<ThaaliType[]>([])
  const [thaaliCategories, setThaaliCategories] = useState<ThaaliCategory[]>([])
  const [distributors, setDistributors] = useState<Distributor[]>([])

  const [fetchError, setFetchError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Registration | null>(null)
  const [saving, setSaving] = useState(false)

  const [unassignedHofs, setUnassignedHofs] = useState<Mumin[]>([])

  const [form, setForm] = useState({
    mumin_id: 0, mumin_label: '',
    thaali_id: '', thaali_type_id: '', thaali_category_id: '',
    distributor_id: '', remarks: '',
  })

  // FIX: load lookups first, THEN set lookupsReady which triggers registration fetch
  useEffect(() => { fetchLookups() }, [])

  useEffect(() => {
    if (!lookupsReady) return   // wait until lookups + active FY are set
    fetchRegistrations()
  }, [lookupsReady, page, search, filterDistributor, filterType, filterCategory])



  const fetchLookups = async () => {
    const [tn, tt, tc, d] = await Promise.all([
      supabase.from('thaalis').select('id, thaali_number, status').order('thaali_number'),
      supabase.from('thaali_types').select('id, name, status').eq('status', 'active'),
      supabase.from('thaali_categories').select('id, name'),
      supabase.from('distributors').select('id, full_name').eq('status', 'active').order('full_name'),
    ])
    setAllThaalis(tn.data || [])
    setThaaliTypes(tt.data || [])
    setThaaliCategories(tc.data || [])
    setDistributors(d.data || [])
    setLookupsReady(true)
  }

  const fetchAvailableThaalis = async (excludeThaaliId?: number) => {
    const { data: assigned } = await supabase
      .from('thaali_registrations')
      .select('thaali_id')
      .not('thaali_id', 'is', null)
    const assignedIds = new Set((assigned || []).map((r: any) => r.thaali_id))
    if (excludeThaaliId) assignedIds.delete(excludeThaaliId)
    setAvailableThaalis(allThaalis.filter(t => !assignedIds.has(t.id)))
  }

  const fetchRegistrations = async () => {
    setLoading(true)
    let query = supabase
      .from('thaali_registrations')
      .select(`
        *,
        mumineen!fk_tr_mumin(sf_no, full_name, its_no),
        thaalis!fk_tr_thaali(thaali_number),
        thaali_types!fk_tr_type(name),
        thaali_categories!fk_tr_category(name),
        distributors!fk_tr_distributor(full_name)
      `, { count: 'exact' })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterDistributor) query = query.eq('distributor_id', parseInt(filterDistributor))
    if (filterType)        query = query.eq('thaali_type_id', parseInt(filterType))
    if (filterCategory)    query = query.eq('thaali_category_id', parseInt(filterCategory))

    const { data, count, error } = await query
    if (error) {
      console.error('[thaali_registrations fetch error]', error)
      setFetchError(error.message)
      setLoading(false)
      return
    }
    setFetchError('')
    let filtered = data || []
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter((r: Registration) =>
        r.mumineen?.full_name?.toLowerCase().includes(s) ||
        r.mumineen?.sf_no?.toLowerCase().includes(s) ||
        r.mumineen?.its_no?.toLowerCase().includes(s) ||
        r.thaalis?.thaali_number?.toString().includes(s)
      )
    }
    setRegistrations(filtered)
    setTotal(count || 0)
    setLoading(false)
  }

  // Load all active HOFs not yet registered (for Add dropdown)
  const loadUnassignedHofs = async () => {
    const { data: existing } = await supabase
      .from('thaali_registrations')
      .select('mumin_id')
    const registeredIds = new Set((existing || []).map((r: any) => r.mumin_id).filter(Boolean))

    const { data } = await supabase
      .from('mumineen')
      .select('id, sf_no, full_name, its_no')
      .eq('is_hof', true)
      .eq('status', 'active')
      .order('full_name')
    const unassigned = (data || []).filter((m: any) => !registeredIds.has(m.id))
    setUnassignedHofs(unassigned)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({
      mumin_id: 0, mumin_label: '',
      thaali_id: '', thaali_type_id: '', thaali_category_id: '',
      distributor_id: '', remarks: '',
    })
    loadUnassignedHofs()
    fetchAvailableThaalis()
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
      remarks: r.remarks || '',
    })
    fetchAvailableThaalis(r.thaali_id || undefined)
    setShowModal(true)
  }

  const handleDelete = async (r: Registration) => {
    if (!confirm(`Remove thaali registration for ${r.mumineen?.full_name}?`)) return
    await supabase.from('thaali_registrations').delete().eq('id', r.id)
    await fetchRegistrations()
    onStatsChange()
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
      remarks: form.remarks,
    }
    if (editing) {
      await supabase.from('thaali_registrations').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('thaali_registrations').insert(payload)
    }
    await fetchRegistrations()
    onStatsChange()
    setShowModal(false)
    setSaving(false)
  }

  const clearFilters = () => {
    setSearchInput(''); setSearch('')
    setFilterDistributor(''); setFilterType(''); setFilterCategory('')
    setPage(0)
  }

  const activeFilterCount = [filterDistributor, filterType, filterCategory].filter(Boolean).length
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* Toolbar */}
      <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <div className="d-flex flex-grow-1 gap-2">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search name, SF#, ITS#, thaali no…"
                value={searchInput}
                style={{ maxWidth: 300 }}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
              />
              <button className="btn btn-sm btn-primary" onClick={() => { setSearch(searchInput); setPage(0) }}>
                <i className="bi bi-search" />
              </button>
            </div>

            <button
              className="btn btn-sm btn-outline-secondary position-relative"
              onClick={() => setShowFilters(v => !v)}
            >
              <i className="bi bi-funnel me-1" />Filters
              {activeFilterCount > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '10px' }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {(search || activeFilterCount > 0) && (
              <button className="btn btn-sm btn-outline-danger" onClick={clearFilters}>Clear</button>
            )}

            <button className="btn btn-sm btn-primary ms-auto" onClick={openAdd}>
              <i className="bi bi-plus-lg me-1" />Add Registration
            </button>
          </div>

          {showFilters && (
            <div className="row g-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
              <div className="col-6 col-md-3">
                <label style={{ fontSize: '11px', color: 'var(--bs-secondary-color)' }}>Distributor</label>
                <select className="form-select form-select-sm" value={filterDistributor}
                  onChange={e => { setFilterDistributor(e.target.value); setPage(0) }}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                  <option value="">All</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label style={{ fontSize: '11px', color: 'var(--bs-secondary-color)' }}>Type</label>
                <select className="form-select form-select-sm" value={filterType}
                  onChange={e => { setFilterType(e.target.value); setPage(0) }}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                  <option value="">All</option>
                  {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label style={{ fontSize: '11px', color: 'var(--bs-secondary-color)' }}>Category</label>
                <select className="form-select form-select-sm" value={filterCategory}
                  onChange={e => { setFilterCategory(e.target.value); setPage(0) }}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                  <option value="">All</option>
                  {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-0">
          {fetchError ? (
            <div className="alert alert-danger m-3" style={{ fontSize: 13 }}>
              <i className="bi bi-exclamation-triangle me-2" />
              <strong>Fetch error:</strong> {fetchError}
            </div>
          ) : loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" />
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
              <i className="bi bi-inbox fs-3 d-block mb-2" />
              No registrations found
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '13px', minWidth: '800px' }}>
                  <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                    <tr>
                      {['#', 'Thaali No', 'SF#', 'Name', 'Type', 'Category', 'Distributor', 'Actions'].map(h => (
                        <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, whiteSpace: 'nowrap', padding: '10px 12px' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r, i) => (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--bs-secondary-color)', padding: '10px 12px' }}>
                          {page * PAGE_SIZE + i + 1}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#364574' }}>
                          {r.thaalis?.thaali_number
                            ? `#${r.thaalis.thaali_number}`
                            : <span className="badge bg-warning text-dark" style={{ fontSize: '10px' }}>No Number</span>
                          }
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#364574' }}>
                          {r.mumineen?.sf_no || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>
                          <div style={{ fontWeight: 500 }}>{r.mumineen?.full_name || '—'}</div>

                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>
                          {r.thaali_types?.name || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>
                          {r.thaali_categories?.name || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>
                          {r.distributors?.full_name || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-sm btn-outline-secondary me-1"
                            style={{ fontSize: '11px', padding: '2px 10px' }}
                            onClick={() => openEdit(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            style={{ fontSize: '11px', padding: '2px 10px' }}
                            onClick={() => handleDelete(r)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center px-3 py-2"
                  style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)}>«</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                      const start = Math.max(0, Math.min(page - 2, totalPages - 5))
                      const pn = start + idx
                      return (
                        <button key={pn}
                          className={`btn btn-sm ${page === pn ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setPage(pn)}>
                          {pn + 1}
                        </button>
                      )
                    })}
                    <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title" style={{ color: 'var(--bs-body-color)' }}>
                  {editing ? 'Edit Registration' : 'Add Registration'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>

              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', background: 'var(--bs-body-bg)' }}>
                <div className="row g-3">

                  {/* HOF dropdown — unregistered active HOFs only */}
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)', marginBottom: 6 }}>
                      HOF (Head of Family) *
                      <span className="ms-2" style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 400 }}>
                        Active HOF only · already registered are hidden
                      </span>
                    </label>

                    {editing ? (
                      <div className="d-flex align-items-center gap-2 p-2 rounded"
                        style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                        <i className="bi bi-person-check text-success fs-5" />
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bs-body-color)' }}>
                          {form.mumin_label}
                        </span>
                      </div>
                    ) : (
                      <>
                        <select
                          className="form-select form-select-sm"
                          value={form.mumin_id || ''}
                          onChange={e => {
                            const id = parseInt(e.target.value)
                            const m = unassignedHofs.find(h => h.id === id)
                            if (m) setForm(f => ({ ...f, mumin_id: m.id, mumin_label: `${m.sf_no} — ${m.full_name}` }))
                            else setForm(f => ({ ...f, mumin_id: 0, mumin_label: '' }))
                          }}
                          style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}
                          autoFocus
                        >
                          <option value="">— Select HOF —</option>
                          {unassignedHofs.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.full_name} · SF# {m.sf_no}
                            </option>
                          ))}
                        </select>
                        {unassignedHofs.length === 0 && (
                          <div className="mt-1" style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>
                            All active HOFs are already registered
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Thaali Number */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Thaali Number</label>
                    <select className="form-select form-select-sm" value={form.thaali_id}
                      onChange={e => setForm(f => ({ ...f, thaali_id: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Assign Later —</option>
                      {editing && form.thaali_id && !availableThaalis.find(t => t.id.toString() === form.thaali_id) && (
                        <option value={form.thaali_id}>#{editing.thaalis?.thaali_number} (current)</option>
                      )}
                      {availableThaalis.map(t => (
                        <option key={t.id} value={t.id}>#{t.thaali_number}</option>
                      ))}
                    </select>
                    {availableThaalis.length === 0 && allThaalis.length > 0 && !editing && (
                      <div className="mt-1" style={{ fontSize: '11px', color: '#f06548' }}>
                        All thaali numbers are currently assigned
                      </div>
                    )}
                  </div>

                  {/* Type */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Type</label>
                    <select className="form-select form-select-sm" value={form.thaali_type_id}
                      onChange={e => setForm(f => ({ ...f, thaali_type_id: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Select Type —</option>
                      {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  {/* Category */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Category (Size)</label>
                    <select className="form-select form-select-sm" value={form.thaali_category_id}
                      onChange={e => setForm(f => ({ ...f, thaali_category_id: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Select Category —</option>
                      {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Distributor */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Distributor</label>
                    <select className="form-select form-select-sm" value={form.distributor_id}
                      onChange={e => setForm(f => ({ ...f, distributor_id: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                      <option value="">— Select Distributor —</option>
                      {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>

                  {/* Remarks */}
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Remarks</label>
                    <textarea className="form-control form-control-sm" rows={2}
                      value={form.remarks}
                      onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                      placeholder="Optional notes…"
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                  </div>

                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !form.mumin_id}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — THAALI NUMBERS
// ═══════════════════════════════════════════════════════════════════════════════

function NumbersTab({ onStatsChange }: { onStatsChange: () => void }) {
  const [thaalis, setThaalis] = useState<Thaali[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Thaali | null>(null)
  const [numberInput, setNumberInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchThaalis() }, [])

  const fetchThaalis = async () => {
    setLoading(true)
    const { data } = await supabase.from('thaalis').select('*').order('thaali_number')
    setThaalis(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setNumberInput(''); setError(''); setShowModal(true) }
  const openEdit = (t: Thaali) => { setEditing(t); setNumberInput(t.thaali_number.toString()); setError(''); setShowModal(true) }

  const handleSave = async () => {
    setError('')
    const num = parseInt(numberInput)
    if (!num || num < 1 || num > 9999) { setError('Enter a number between 1 and 9999'); return }
    setSaving(true)
    const { data: existing } = await supabase.from('thaalis').select('id').eq('thaali_number', num).maybeSingle()
    if (existing && (!editing || existing.id !== editing.id)) {
      setError(`Thaali #${num} already exists`)
      setSaving(false)
      return
    }
    if (editing) {
      await supabase.from('thaalis').update({ thaali_number: num }).eq('id', editing.id)
    } else {
      await supabase.from('thaalis').insert({ thaali_number: num, status: 'active' })
    }
    await fetchThaalis()
    onStatsChange()
    setShowModal(false)
    setSaving(false)
  }

  const filtered = thaalis.filter(t => t.thaali_number.toString().includes(search))

  return (
    <div>
      <div className="d-flex gap-2 align-items-center mb-3">
        <input type="text" className="form-control form-control-sm"
          placeholder="Search number…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        <span style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>{filtered.length} numbers</span>
        <button className="btn btn-sm btn-primary ms-auto" onClick={openAdd}>+ Add Number</button>
      </div>
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                  <tr>
                    {['Thaali No', 'Status', ''].map(h => (
                      <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, padding: '10px 16px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600, color: '#364574', padding: '10px 16px' }}>#{t.thaali_number}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span className={`badge bg-${t.status === 'active' ? 'success' : 'secondary'}`} style={{ fontSize: '10px' }}>{t.status}</span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: '11px', padding: '2px 10px' }}
                          onClick={() => openEdit(t)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title" style={{ color: 'var(--bs-body-color)' }}>{editing ? 'Edit Thaali Number' : 'Add Thaali Number'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Number *</label>
                <input type="number" className="form-control" min={1} max={9999}
                  value={numberInput} onChange={e => setNumberInput(e.target.value)}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}
                  autoFocus />
                {error && <div className="text-danger mt-1" style={{ fontSize: '12px' }}>{error}</div>}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — TYPES
// ═══════════════════════════════════════════════════════════════════════════════

function TypesTab() {
  const [types, setTypes] = useState<ThaaliType[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ThaaliType | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchTypes() }, [])

  const fetchTypes = async () => {
    setLoading(true)
    const { data } = await supabase.from('thaali_types').select('*').order('name')
    setTypes(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setName(''); setShowModal(true) }
  const openEdit = (t: ThaaliType) => { setEditing(t); setName(t.name); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('thaali_types').update({ name: name.trim() }).eq('id', editing.id)
    } else {
      await supabase.from('thaali_types').insert({ name: name.trim(), status: 'active' })
    }
    await fetchTypes()
    setShowModal(false)
    setSaving(false)
  }

  const toggleStatus = async (t: ThaaliType) => {
    await supabase.from('thaali_types').update({ status: t.status === 'active' ? 'inactive' : 'active' }).eq('id', t.id)
    await fetchTypes()
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>e.g. Normal, Spicy, Chronic</p>
        <button className="btn btn-sm btn-primary" onClick={openAdd}>+ Add Type</button>
      </div>
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                  <tr>
                    {['Type Name', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, padding: '10px 16px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {types.map(t => (
                    <tr key={t.id}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--bs-body-color)' }}>{t.name}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span className={`badge bg-${t.status === 'active' ? 'success' : 'secondary'}`} style={{ fontSize: '10px' }}>{t.status}</span>
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-outline-secondary me-1" style={{ fontSize: '11px', padding: '2px 10px' }} onClick={() => openEdit(t)}>Edit</button>
                        <button className={`btn btn-sm ${t.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          style={{ fontSize: '11px', padding: '2px 10px' }} onClick={() => toggleStatus(t)}>
                          {t.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title" style={{ color: 'var(--bs-body-color)' }}>{editing ? 'Edit Type' : 'Add Thaali Type'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Type Name *</label>
                <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Normal, Spicy, Chronic"
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}
                  autoFocus />
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

function CategoriesTab() {
  const [categories, setCategories] = useState<ThaaliCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ThaaliCategory | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    setLoading(true)
    const { data } = await supabase.from('thaali_categories').select('*').order('name')
    setCategories(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setName(''); setDescription(''); setShowModal(true) }
  const openEdit = (c: ThaaliCategory) => { setEditing(c); setName(c.name); setDescription(c.description || ''); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload = { name: name.trim(), description: description.trim() || null }
    if (editing) {
      await supabase.from('thaali_categories').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('thaali_categories').insert(payload)
    }
    await fetchCategories()
    setShowModal(false)
    setSaving(false)
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>e.g. Mini, Small, Medium, Large</p>
        <button className="btn btn-sm btn-primary" onClick={openAdd}>+ Add Category</button>
      </div>
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px', background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                <thead style={{ background: 'var(--bs-tertiary-bg)' }}>
                  <tr>
                    {['Category Name', 'Description', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', fontWeight: 600, padding: '10px 16px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c.id}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--bs-body-color)' }}>{c.name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--bs-secondary-color)' }}>{c.description || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: '11px', padding: '2px 10px' }}
                          onClick={() => openEdit(c)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title" style={{ color: 'var(--bs-body-color)' }}>{editing ? 'Edit Category' : 'Add Thaali Category'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                <div className="mb-3">
                  <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Category Name *</label>
                  <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Large, Mini, One Day"
                    style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}
                    autoFocus />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '13px', color: 'var(--bs-body-color)' }}>Description</label>
                  <input type="text" className="form-control" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Optional description"
                    style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }} />
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}