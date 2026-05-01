'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Thaali          { id: number; thaali_number: number }
interface ThaaliType      { id: number; name: string; status: string }
interface ThaaliCategory  { id: number; name: string }
interface Registration {
  id: number; mumin_id: number; thaali_id: number | null
  thaali_type_id: number | null; thaali_category_id: number | null
  distributor_id: number | null; remarks: string
  mumineen?:          { sf_no: string; full_name: string; its_no: string }
  thaalis?:           { thaali_number: number }
  thaali_types?:      { name: string }
  thaali_categories?: { name: string }
  distributors?:      { full_name: string }
}
interface Mumin       { id: number; sf_no: string; full_name: string; its_no: string; address_sector_id?: number | null }
interface Distributor { id: number; full_name: string }

const PAGE_SIZE = 50

// ── Searchable Select Component ───────────────────────────────────────────────
function SearchableSelect({
  options, value, onChange, placeholder, disabled = false,
}: {
  options: { id: number | string; label: string }[]
  value: string
  onChange: (val: string) => void
  placeholder: string
  disabled?: boolean
}) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const ref                 = useRef<HTMLDivElement>(null)

  const selected = options.find(o => String(o.id) === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: '1px solid var(--bs-border-color)', borderRadius: 8,
        background: disabled ? 'var(--bs-tertiary-bg)' : 'var(--bs-body-bg)',
        overflow: 'hidden', cursor: disabled ? 'not-allowed' : 'pointer',
      }} onClick={() => !disabled && setOpen(o => !o)}>
        {open ? (
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Type to search..."
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '7px 10px', fontSize: 13,
              background: 'transparent', color: 'var(--bs-body-color)' }} />
        ) : (
          <span style={{ flex: 1, padding: '7px 10px', fontSize: 13,
            color: selected ? 'var(--bs-body-color)' : 'var(--bs-secondary-color)' }}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <span style={{ padding: '0 10px', color: 'var(--bs-secondary-color)', fontSize: 11 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
        }}>
          {value && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: '#f06548', cursor: 'pointer',
              borderBottom: '1px solid var(--bs-border-color)' }}
              onMouseDown={() => { onChange(''); setQuery(''); setOpen(false) }}>
              ✕ Clear selection
            </div>
          )}
          {filtered.length === 0 ? (
            <div style={{ padding: '10px', fontSize: 13, color: 'var(--bs-secondary-color)', textAlign: 'center' }}>No results</div>
          ) : filtered.slice(0, 100).map(o => (
            <div key={o.id} style={{
              padding: '7px 10px', fontSize: 13, cursor: 'pointer',
              background: String(o.id) === value ? '#36457415' : undefined,
              color: String(o.id) === value ? '#364574' : 'var(--bs-body-color)',
            }}
              onMouseDown={() => { onChange(String(o.id)); setQuery(''); setOpen(false) }}>
              {o.label}
            </div>
          ))}
          {filtered.length > 100 && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--bs-secondary-color)', textAlign: 'center' }}>
              {filtered.length - 100} more — type to narrow
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ThaaliPage() {
  const [stats, setStats] = useState({ totalRegs: 0, withNumber: 0, unregisteredHofs: 0 })

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    const [totalRegs, withNumber, allHofs, regMuminIds] = await Promise.all([
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).not('thaali_id', 'is', null),
      supabase.from('mumineen').select('*', { count: 'exact', head: true }).eq('is_hof', true).eq('status', 'active'),
      supabase.from('thaali_registrations').select('mumin_id'),
    ])
    const registeredIds = new Set((regMuminIds.data || []).map((r: any) => r.mumin_id))
    const unregistered = (allHofs.count || 0) - registeredIds.size
    setStats({ totalRegs: totalRegs.count || 0, withNumber: withNumber.count || 0, unregisteredHofs: Math.max(0, unregistered) })
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Thaali</h4>
          <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
            Manage thaali registrations · Types, Categories and Numbers are in Settings
          </p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {[
          { label: 'Registered',         value: stats.totalRegs,        color: '#364574', title: 'HOFs with a thaali registration' },
          { label: 'Thaali Assigned',     value: stats.withNumber,       color: '#0ab39c', title: 'Registrations with a thaali number' },
          { label: 'HOFs Not Registered', value: stats.unregisteredHofs, color: '#f06548', title: 'Active HOFs with no thaali registration yet' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-4">
            <div className="card" title={s.title} style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 10, background: 'var(--bs-body-bg)' }}>
              <div className="card-body p-3">
                <p className="mb-1" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      <RegistrationsTab onStatsChange={fetchStats} />
    </div>
  )
}

// ── Registrations Tab ─────────────────────────────────────────────────────────
function RegistrationsTab({ onStatsChange }: { onStatsChange: () => void }) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading]             = useState(true)
  const [page, setPage]                   = useState(0)
  const [total, setTotal]                 = useState(0)
  const [showFilters, setShowFilters]     = useState(false)
  const [lookupsReady, setLookupsReady]   = useState(false)
  const [fetchError, setFetchError]       = useState('')

  const [searchInput, setSearchInput]           = useState('')
  const [search, setSearch]                     = useState('')
  const [filterDistributor, setFilterDistributor] = useState('')
  const [filterType, setFilterType]             = useState('')
  const [filterCategory, setFilterCategory]     = useState('')

  const [allThaalis, setAllThaalis]               = useState<Thaali[]>([])
  const [availableThaalis, setAvailableThaalis]   = useState<Thaali[]>([])
  const [thaaliTypes, setThaaliTypes]             = useState<ThaaliType[]>([])
  const [thaaliCategories, setThaaliCategories]   = useState<ThaaliCategory[]>([])
  const [distributors, setDistributors]           = useState<Distributor[]>([])
  const [sectorDistributors, setSectorDistributors] = useState<Distributor[]>([])
  const [unassignedHofs, setUnassignedHofs]       = useState<Mumin[]>([])

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Registration | null>(null)
  const [saving, setSaving]       = useState(false)

  const [form, setForm] = useState({
    mumin_id: 0, mumin_label: '',
    thaali_id: '', thaali_type_id: '', thaali_category_id: '',
    distributor_id: '',
  })

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { if (!lookupsReady) return; fetchRegistrations() },
    [lookupsReady, page, search, filterDistributor, filterType, filterCategory])

  const fetchLookups = async () => {
    const [tn, tt, tc, d] = await Promise.all([
      supabase.from('thaalis').select('id, thaali_number').order('thaali_number').limit(6000),
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
    const { data: assigned } = await supabase.from('thaali_registrations').select('thaali_id').not('thaali_id', 'is', null)
    const assignedIds = new Set((assigned || []).map((r: any) => r.thaali_id))
    if (excludeThaaliId) assignedIds.delete(excludeThaaliId)
    setAvailableThaalis(allThaalis.filter(t => !assignedIds.has(t.id)))
  }

  // Fetch distributors for HOF's sector
  const fetchSectorDistributors = async (muminId: number) => {
    setSectorDistributors([])
    // Get HOF's sector
    const { data: mumin } = await supabase.from('mumineen').select('address_sector_id').eq('id', muminId).single()
    if (!mumin?.address_sector_id) {
      // No sector — show all distributors
      setSectorDistributors(distributors)
      return null
    }
    // Get distributors assigned to that sector
    const { data: ds } = await supabase.from('distributor_sectors')
      .select('distributor_id, distributors(id, full_name)')
      .eq('sector_id', mumin.address_sector_id)
    const sectorDists: Distributor[] = (ds || [])
      .filter((d: any) => d.distributors)
      .map((d: any) => ({ id: d.distributors.id, full_name: d.distributors.full_name }))

    setSectorDistributors(sectorDists.length > 0 ? sectorDists : distributors)
    // Auto-select if only one
    if (sectorDists.length === 1) return String(sectorDists[0].id)
    return null
  }

  const fetchRegistrations = async () => {
    setLoading(true)
    setFetchError('')

    let query = supabase.from('thaali_registrations')
      .select(`*, mumineen!fk_tr_mumin(sf_no, full_name, its_no),
        thaalis!fk_tr_thaali(thaali_number), thaali_types(name),
        thaali_categories(name), distributors(full_name)`,
        { count: 'exact' })
      .order('id', { ascending: false })

    if (filterDistributor) query = query.eq('distributor_id', parseInt(filterDistributor))
    if (filterType)        query = query.eq('thaali_type_id', parseInt(filterType))
    if (filterCategory)    query = query.eq('thaali_category_id', parseInt(filterCategory))

    if (search) {
      const s = search.trim()

      // Server-side: find mumin IDs matching name / SF# / ITS#
      const { data: matchingMumin } = await supabase
        .from('mumineen')
        .select('id')
        .or(`full_name.ilike.%${s}%,sf_no.ilike.%${s}%,its_no.ilike.%${s}%`)
      const muminIds = (matchingMumin || []).map((m: any) => m.id as number)

      // Thaali number search — use already-loaded allThaalis lookup (integers)
      const thaaliIds = allThaalis
        .filter(t => t.thaali_number.toString().includes(s))
        .map(t => t.id)

      const orParts: string[] = []
      if (muminIds.length > 0)  orParts.push(`mumin_id.in.(${muminIds.join(',')})`)
      if (thaaliIds.length > 0) orParts.push(`thaali_id.in.(${thaaliIds.join(',')})`)

      if (orParts.length === 0) {
        setRegistrations([])
        setTotal(0)
        setLoading(false)
        return
      }
      query = query.or(orParts.join(','))
    }

    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const { data, count, error } = await query
    if (error) { setFetchError(error.message); setLoading(false); return }

    setRegistrations(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const loadUnassignedHofs = async () => {
    const { data: existing } = await supabase.from('thaali_registrations').select('mumin_id')
    const registeredIds = new Set((existing || []).map((r: any) => r.mumin_id).filter(Boolean))
    const { data } = await supabase.from('mumineen')
      .select('id, sf_no, full_name, its_no, address_sector_id')
      .eq('is_hof', true).eq('status', 'active').order('full_name')
    setUnassignedHofs((data || []).filter((m: any) => !registeredIds.has(m.id)))
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ mumin_id: 0, mumin_label: '', thaali_id: '', thaali_type_id: '', thaali_category_id: '', distributor_id: '' })
    setSectorDistributors(distributors)
    loadUnassignedHofs()
    fetchAvailableThaalis()
    setShowModal(true)
  }

  const openEdit = (r: Registration) => {
    setEditing(r)
    setForm({
      mumin_id:           r.mumin_id,
      mumin_label:        `${r.mumineen?.sf_no} — ${r.mumineen?.full_name}`,
      thaali_id:          r.thaali_id?.toString() || '',
      thaali_type_id:     r.thaali_type_id?.toString() || '',
      thaali_category_id: r.thaali_category_id?.toString() || '',
      distributor_id:     r.distributor_id?.toString() || '',
    })
    fetchAvailableThaalis(r.thaali_id || undefined)
    fetchSectorDistributors(r.mumin_id)
    setShowModal(true)
  }

  const handleHofSelect = async (muminId: number) => {
    const m = unassignedHofs.find(h => h.id === muminId)
    if (!m) { setForm(f => ({ ...f, mumin_id: 0, mumin_label: '', distributor_id: '' })); return }
    setForm(f => ({ ...f, mumin_id: m.id, mumin_label: `${m.sf_no} — ${m.full_name}`, distributor_id: '' }))
    const autoDistId = await fetchSectorDistributors(m.id)
    if (autoDistId) setForm(f => ({ ...f, mumin_id: m.id, mumin_label: `${m.sf_no} — ${m.full_name}`, distributor_id: autoDistId }))
  }

  const handleDelete = async (r: Registration) => {
    if (!confirm(`Remove thaali registration for ${r.mumineen?.full_name}?`)) return
    await supabase.from('thaali_registrations').delete().eq('id', r.id)
    await fetchRegistrations(); onStatsChange()
  }

  const handleSave = async () => {
    if (!form.mumin_id) return
    setSaving(true)
    const payload = {
      mumin_id:           form.mumin_id,
      thaali_id:          form.thaali_id          ? parseInt(form.thaali_id)          : null,
      thaali_type_id:     form.thaali_type_id      ? parseInt(form.thaali_type_id)      : null,
      thaali_category_id: form.thaali_category_id  ? parseInt(form.thaali_category_id)  : null,
      distributor_id:     form.distributor_id       ? parseInt(form.distributor_id)       : null,
    }
    if (editing) await supabase.from('thaali_registrations').update(payload).eq('id', editing.id)
    else         await supabase.from('thaali_registrations').insert(payload)
    await fetchRegistrations(); onStatsChange()
    setShowModal(false); setSaving(false)
  }

  const clearFilters = () => {
    setSearchInput(''); setSearch('')
    setFilterDistributor(''); setFilterType(''); setFilterCategory('')
    setPage(0)
  }

  const activeFilterCount = [filterDistributor, filterType, filterCategory].filter(Boolean).length
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Build option lists for SearchableSelect
  const thaaliOptions = [
    ...(editing && form.thaali_id && !availableThaalis.find(t => String(t.id) === form.thaali_id)
      ? [{ id: String(editing.thaali_id), label: `#${editing.thaalis?.thaali_number} (current)` }]
      : []),
    ...availableThaalis.map(t => ({ id: String(t.id), label: `#${t.thaali_number}` })),
  ]
  const typeOptions     = thaaliTypes.map(t => ({ id: String(t.id), label: t.name }))
  const categoryOptions = thaaliCategories.map(c => ({ id: String(c.id), label: c.name }))
  const distOptions     = sectorDistributors.map(d => ({ id: String(d.id), label: d.full_name }))

  return (
    <div>
      {/* Toolbar */}
      <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 10, background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <div className="d-flex flex-grow-1 gap-2">
              <input type="text" className="form-control form-control-sm" placeholder="Search name, SF#, ITS#, thaali no…"
                value={searchInput} style={{ maxWidth: 300 }} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
              <button className="btn btn-sm btn-primary" onClick={() => { setSearch(searchInput); setPage(0) }}>
                <i className="bi bi-search" />
              </button>
            </div>
            <button className="btn btn-sm btn-outline-secondary position-relative" onClick={() => setShowFilters(v => !v)}>
              <i className="bi bi-funnel me-1" />Filters
              {activeFilterCount > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: 10 }}>
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
                <label style={{ fontSize: 11, color: 'var(--bs-secondary-color)' }}>Distributor</label>
                <select className="form-select form-select-sm" value={filterDistributor}
                  onChange={e => { setFilterDistributor(e.target.value); setPage(0) }}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                  <option value="">All</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label style={{ fontSize: 11, color: 'var(--bs-secondary-color)' }}>Type</label>
                <select className="form-select form-select-sm" value={filterType}
                  onChange={e => { setFilterType(e.target.value); setPage(0) }}
                  style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)' }}>
                  <option value="">All</option>
                  {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label style={{ fontSize: 11, color: 'var(--bs-secondary-color)' }}>Category</label>
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
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 10, background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-0">
          {fetchError ? (
            <div className="alert alert-danger m-3" style={{ fontSize: 13 }}>
              <i className="bi bi-exclamation-triangle me-2" /><strong>Fetch error:</strong> {fetchError}
            </div>
          ) : loading ? (
            <div className="text-center py-5"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
              <i className="bi bi-inbox fs-3 d-block mb-2" />No registrations found
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13, minWidth: 800 }}>
                  <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                    <tr>
                      {['#', 'Thaali No', 'SF#', 'Name', 'Type', 'Category', 'Distributor', 'Actions'].map(h => (
                        <th key={h} style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 600, whiteSpace: 'nowrap', padding: '10px 12px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r, i) => (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--bs-secondary-color)', padding: '10px 12px' }}>{page * PAGE_SIZE + i + 1}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#364574' }}>
                          {r.thaalis?.thaali_number
                            ? `#${r.thaalis.thaali_number}`
                            : <span className="badge bg-warning text-dark" style={{ fontSize: 10 }}>No Number</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#364574' }}>{r.mumineen?.sf_no || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)', fontWeight: 500 }}>{r.mumineen?.full_name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>{r.thaali_types?.name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>{r.thaali_categories?.name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>{r.distributors?.full_name || '—'}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-outline-secondary me-1" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-sm btn-outline-danger" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => handleDelete(r)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center px-3 py-2" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                  <span style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)}>«</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                      const pn = Math.max(0, Math.min(page - 2, totalPages - 5)) + idx
                      return <button key={pn} className={`btn btn-sm ${page === pn ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPage(pn)}>{pn + 1}</button>
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
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}
          onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-xl" style={{ marginTop: 60 }} onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title" style={{ color: 'var(--bs-body-color)' }}>
                  {editing ? 'Edit Registration' : 'Add Registration'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>

              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                <div className="row g-3">

                  {/* HOF */}
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: 13, color: 'var(--bs-body-color)', marginBottom: 6 }}>
                      HOF (Head of Family) *
                      <span className="ms-2" style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 400 }}>
                        Active HOFs only · already registered are hidden
                      </span>
                    </label>
                    {editing ? (
                      <div className="d-flex align-items-center gap-2 p-2 rounded"
                        style={{ background: 'var(--bs-tertiary-bg)', border: '1px solid var(--bs-border-color)' }}>
                        <i className="bi bi-person-check text-success fs-5" />
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--bs-body-color)' }}>{form.mumin_label}</span>
                      </div>
                    ) : (
                      <>
                        <SearchableSelect
                          options={unassignedHofs.map(m => ({ id: m.id, label: `${m.full_name} · SF# ${m.sf_no}` }))}
                          value={form.mumin_id ? String(form.mumin_id) : ''}
                          onChange={val => val ? handleHofSelect(parseInt(val)) : setForm(f => ({ ...f, mumin_id: 0, mumin_label: '', distributor_id: '' }))}
                          placeholder="— Search and select HOF —"
                        />
                        {unassignedHofs.length === 0 && (
                          <div className="mt-1" style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                            All active HOFs are already registered
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Thaali Number */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>Thaali Number</label>
                    <SearchableSelect
                      options={thaaliOptions}
                      value={form.thaali_id}
                      onChange={val => setForm(f => ({ ...f, thaali_id: val }))}
                      placeholder="— Search thaali number —"
                    />
                    {availableThaalis.length === 0 && allThaalis.length > 0 && !editing && (
                      <div className="mt-1" style={{ fontSize: 11, color: '#f06548' }}>
                        All thaali numbers assigned — add more in Settings
                      </div>
                    )}
                  </div>

                  {/* Type */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>Type</label>
                    <SearchableSelect
                      options={typeOptions}
                      value={form.thaali_type_id}
                      onChange={val => setForm(f => ({ ...f, thaali_type_id: val }))}
                      placeholder="— Select type —"
                    />
                  </div>

                  {/* Category */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>Category (Size)</label>
                    <SearchableSelect
                      options={categoryOptions}
                      value={form.thaali_category_id}
                      onChange={val => setForm(f => ({ ...f, thaali_category_id: val }))}
                      placeholder="— Select category —"
                    />
                  </div>

                  {/* Distributor — filtered by HOF sector */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>
                      Distributor
                      {form.mumin_id > 0 && sectorDistributors.length !== distributors.length && (
                        <span className="ms-2 badge" style={{ background: '#0ab39c20', color: '#0ab39c', fontSize: 10, fontWeight: 600 }}>
                          {sectorDistributors.length} in sector
                        </span>
                      )}
                      {form.mumin_id > 0 && sectorDistributors.length === 1 && (
                        <span className="ms-2 badge bg-success" style={{ fontSize: 10 }}>auto-selected</span>
                      )}
                    </label>
                    <SearchableSelect
                      options={distOptions}
                      value={form.distributor_id}
                      onChange={val => setForm(f => ({ ...f, distributor_id: val }))}
                      placeholder={form.mumin_id ? '— Select distributor —' : '— Select HOF first —'}
                      disabled={!form.mumin_id}
                    />
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