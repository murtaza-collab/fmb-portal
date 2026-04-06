'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { todayPKT } from '@/lib/time';

interface Registration {
  id: number
  mumin_id: number
  thaali_id: number
  distributor_id: number
  fiscal_year_id: number
  status: string
  remarks: string
  mumineen?: {
    sf_no: string; full_name: string; its_no: string
    address_sector_id: number; address_block_id: number
    address_number: string; address_floor: string
    full_address: string; whatsapp_no: string; phone_no: string
    niyyat_status_id: number
    house_sectors?: { name: string }
    house_blocks?: { name: string }
    house_types?: { name: string }
    niyyat_statuses?: { name: string }
  }
  thaalis?: { thaali_number: number }
  thaali_types?: { name: string }
  thaali_categories?: { name: string }
  distributors?: { full_name: string }
  fiscal_years?: { gregorian_year: number; hijri_year: string }
}

interface LookupItem { id: number; name: string }
interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }

const PAGE_SIZE = 50

const STATUS_COLORS: Record<string, string> = {
  active:               'bg-success',
  approved:             'bg-success',
  pending:              'bg-warning text-dark',
  stopped:              'bg-danger',
  transfered:           'bg-info text-dark',
  'not required':       'bg-secondary',
  'required distributor': 'bg-primary',
}

export default function DistributionPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading]             = useState(true)
  const [page, setPage]                   = useState(0)
  const [total, setTotal]                 = useState(0)

  const [distributors, setDistributors]         = useState<LookupItem[]>([])
  const [sectors, setSectors]                   = useState<LookupItem[]>([])
  const [thaaliTypes, setThaaliTypes]           = useState<LookupItem[]>([])
  const [thaaliCategories, setThaaliCategories] = useState<LookupItem[]>([])
  const [houseBlocks, setHouseBlocks]           = useState<LookupItem[]>([])

  // Active FY id — set once from DB, never shown as a filter
  const [activeFiscalYearId, setActiveFiscalYearId] = useState<number | null>(null)
  const [lookupsReady, setLookupsReady]             = useState(false)

  const [searchInput, setSearchInput]           = useState('')
  const [search, setSearch]                     = useState('')
  const [filterDistributor, setFilterDistributor] = useState('')
  const [filterSector, setFilterSector]         = useState('')
  const [filterStatus, setFilterStatus]         = useState('')
  const [filterThaaliType, setFilterThaaliType] = useState('')
  const [filterThaaliCategory, setFilterThaaliCategory] = useState('')
  const [filterBlock, setFilterBlock]           = useState('')

  const [stats, setStats] = useState({ total: 0, withThaali: 0, stopped: 0 })
  const [exporting, setExporting] = useState(false)

  // Load lookups first, then trigger data fetch
  useEffect(() => { fetchLookups() }, [])

  // Only fetch registrations after lookups are ready (so activeFiscalYearId is set)
  useEffect(() => {
    if (!lookupsReady) return
    fetchRegistrations()
  }, [lookupsReady, page, search, filterDistributor, filterSector, filterStatus,
      filterThaaliType, filterThaaliCategory, filterBlock])

  const fetchLookups = async () => {
    const [d, s, fy, tt, tc, hb] = await Promise.all([
      supabase.from('distributors').select('id, name:full_name').eq('status', 'active').order('full_name'),
      supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name'),
      supabase.from('fiscal_years').select('id, gregorian_year, hijri_year, is_active').order('id', { ascending: false }),
      supabase.from('thaali_types').select('id, name').eq('status', 'active'),
      supabase.from('thaali_categories').select('id, name'),
      supabase.from('house_blocks').select('id, name').order('name'),
    ])
    setDistributors(d.data || [])
    setSectors(s.data || [])
    setThaaliTypes(tt.data || [])
    setThaaliCategories(tc.data || [])
    setHouseBlocks(hb.data || [])

    const activeFY = (fy.data || []).find((f: FiscalYear) => f.is_active)
    if (activeFY) setActiveFiscalYearId(activeFY.id)

    setLookupsReady(true)
  }

  const fetchRegistrations = async () => {
    setLoading(true)

    // Build query — NO FK hints (removed in v4.0, they break queries)
    let query = supabase
      .from('thaali_registrations')
      .select(`
        *,
        mumineen(
          sf_no, full_name, its_no,
          address_sector_id, address_block_id,
          address_number, address_floor, full_address,
          whatsapp_no, phone_no, niyyat_status_id,
          house_sectors(name),
          house_blocks(name),
          house_types(name),
          niyyat_statuses(name)
        ),
        thaalis(thaali_number),
        thaali_types(name),
        thaali_categories(name),
        distributors(full_name),
        fiscal_years(gregorian_year, hijri_year)
      `, { count: 'exact' })
      .order('thaali_id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    // Always filter by active fiscal year
    if (activeFiscalYearId) query = query.eq('fiscal_year_id', activeFiscalYearId)

    if (filterStatus)         query = query.eq('status', filterStatus)
    if (filterDistributor)    query = query.eq('distributor_id', parseInt(filterDistributor))
    if (filterThaaliType)     query = query.eq('thaali_type_id', parseInt(filterThaaliType))
    if (filterThaaliCategory) query = query.eq('thaali_category_id', parseInt(filterThaaliCategory))

    const { data, count } = await query

    const filtered = applyClientFilters(data || [])
    setRegistrations(filtered)
    setTotal(count || 0)

    // Stats — total and withThaali derived from full (unfiltered) count query
    const today = todayPKT()
    let totalQuery = supabase.from('thaali_registrations').select('id, thaali_id', { count: 'exact' })
    if (activeFiscalYearId) totalQuery = totalQuery.eq('fiscal_year_id', activeFiscalYearId)
    const { data: allRegs, count: totalCount } = await totalQuery

    const withThaaliCount = (allRegs || []).filter((r: any) => r.thaali_id !== null).length

    const { count: stoppedCount } = await supabase
      .from('stop_thaalis')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'approved'])
      .lte('from_date', today)
      .gte('to_date', today)

    setStats({ total: totalCount || 0, withThaali: withThaaliCount, stopped: stoppedCount || 0 })

    setLoading(false)
  }

  const applyClientFilters = (data: Registration[]) => {
    let filtered = data
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(r =>
        r.mumineen?.full_name?.toLowerCase().includes(q) ||
        r.mumineen?.sf_no?.toLowerCase().includes(q) ||
        r.mumineen?.its_no?.toLowerCase().includes(q) ||
        r.thaalis?.thaali_number?.toString().includes(q)
      )
    }
    if (filterSector) filtered = filtered.filter(r => r.mumineen?.address_sector_id?.toString() === filterSector)
    if (filterBlock)  filtered = filtered.filter(r => r.mumineen?.address_block_id?.toString() === filterBlock)
    return filtered
  }

  const exportCSV = async () => {
    setExporting(true)
    let query = supabase
      .from('thaali_registrations')
      .select(`
        *,
        mumineen(sf_no, full_name, its_no, address_number, address_floor, full_address,
          whatsapp_no, phone_no, address_sector_id, address_block_id,
          house_sectors(name), house_blocks(name), house_types(name), niyyat_statuses(name)),
        thaalis(thaali_number),
        thaali_types(name),
        thaali_categories(name),
        distributors(full_name),
        fiscal_years(gregorian_year, hijri_year)
      `)
      .order('thaali_id')
      .range(0, 9999)

    if (activeFiscalYearId) query = query.eq('fiscal_year_id', activeFiscalYearId)
    if (filterStatus)       query = query.eq('status', filterStatus)
    if (filterDistributor)  query = query.eq('distributor_id', parseInt(filterDistributor))

    const { data } = await query
    const filtered = applyClientFilters(data || [])

    const headers = ['SF#','ITS#','Full Name','Thaali No','Size','Type','Distributor','Sector','Block','Number','Floor','Full Address','WhatsApp','Phone','Niyyat Status','Status','Remarks']
    const rows = filtered.map(r => [
      r.mumineen?.sf_no || '', r.mumineen?.its_no || '', r.mumineen?.full_name || '',
      r.thaalis?.thaali_number || '', r.thaali_types?.name || '', r.thaali_categories?.name || '',
      r.distributors?.full_name || '', r.mumineen?.house_sectors?.name || '',
      r.mumineen?.house_blocks?.name || '', r.mumineen?.address_number || '',
      r.mumineen?.address_floor || '', r.mumineen?.full_address || '',
      r.mumineen?.whatsapp_no || '', r.mumineen?.phone_no || '',
      r.mumineen?.niyyat_statuses?.name || '', r.status || '', r.remarks || '',
    ])
    const csv = [headers, ...rows].map(row =>
      row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `distribution_${todayPKT()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const clearFilters = () => {
    setSearchInput(''); setSearch('')
    setFilterDistributor(''); setFilterSector('')
    setFilterThaaliType(''); setFilterThaaliCategory(''); setFilterBlock('')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Distribution</h4>
          <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>Master delivery list</p>
        </div>
        <button className="btn btn-success btn-sm" onClick={exportCSV} disabled={exporting}>
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Showing',          value: registrations.length, color: '#364574' },
          { label: 'Total registered', value: stats.total,          color: '#0ab39c' },
          { label: 'Thaali assigned',  value: stats.withThaali,     color: '#405189' },
          { label: 'Stopped today',    value: stats.stopped,        color: '#f06548' },
        ].map(s => (
          <div key={s.label} className="col-md-3">
            <div className="card border-0 shadow-sm" style={{ borderRadius: 10 }}>
              <div className="card-body p-3" style={{ background: 'var(--bs-body-bg)' }}>
                <p className="mb-1" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>{s.label}</p>
                <h4 className="mb-0 fw-bold" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters — no fiscal year picker, it's always active FY */}
      <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: 10 }}>
        <div className="card-body py-3" style={{ background: 'var(--bs-body-bg)' }}>
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Search</label>
              <div className="input-group input-group-sm">
                <input
                  type="text" className="form-control"
                  placeholder="Name, SF#, ITS#, Thaali#..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
                />
                <button className="btn btn-outline-primary"
                  onClick={() => { setSearch(searchInput); setPage(0) }}>Go</button>
              </div>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Distributor</label>
              <select className="form-select form-select-sm" value={filterDistributor}
                onChange={e => { setFilterDistributor(e.target.value); setPage(0) }}>
                <option value="">All Distributors</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Sector</label>
              <select className="form-select form-select-sm" value={filterSector}
                onChange={e => { setFilterSector(e.target.value); setPage(0) }}>
                <option value="">All Sectors</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Block</label>
              <select className="form-select form-select-sm" value={filterBlock}
                onChange={e => { setFilterBlock(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {houseBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Size</label>
              <select className="form-select form-select-sm" value={filterThaaliType}
                onChange={e => { setFilterThaaliType(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Type</label>
              <select className="form-select form-select-sm" value={filterThaaliCategory}
                onChange={e => { setFilterThaaliCategory(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button className="btn btn-sm btn-outline-secondary w-100" onClick={clearFilters}>Clear</button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 10 }}>
        <div className="card-body p-0" style={{ background: 'var(--bs-body-bg)', overflowX: 'auto', borderRadius: 10 }}>
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" />
            </div>
          ) : (
            <>
              <table className="table table-hover mb-0" style={{ fontSize: 12, minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: 'var(--bs-secondary-bg)' }}>
                    {['#','Thaali No','SF#','ITS#','Name','Size','Type','Block','No','Floor','Sector','Distributor','WhatsApp','Niyyat','Status'].map(h => (
                      <th key={h} style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 600, whiteSpace: 'nowrap', padding: '10px 12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--bs-secondary-color)', padding: '8px 12px' }}>{page * PAGE_SIZE + i + 1}</td>
                      <td style={{ fontWeight: 700, color: '#364574', padding: '8px 12px' }}>{r.thaalis?.thaali_number || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.mumineen?.sf_no || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-secondary-color)' }}>{r.mumineen?.its_no || '—'}</td>
                      <td style={{ fontWeight: 500, padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.mumineen?.full_name || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.thaali_types?.name || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.thaali_categories?.name || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.mumineen?.house_blocks?.name || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.mumineen?.address_number || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.mumineen?.address_floor || '—'}</td>
                      <td style={{ padding: '8px 12px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--bs-body-color)' }}>
                        {r.mumineen?.house_sectors?.name || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-body-color)' }}>{r.distributors?.full_name || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--bs-secondary-color)' }}>{r.mumineen?.whatsapp_no || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 10, color: 'var(--bs-secondary-color)' }}>
                          {r.mumineen?.niyyat_statuses?.name || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span className={`badge ${STATUS_COLORS[r.status] || 'bg-secondary'}`} style={{ fontSize: 10 }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {registrations.length === 0 && (
                    <tr>
                      <td colSpan={15} className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
                        No records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center px-3 py-3"
                style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <small style={{ color: 'var(--bs-secondary-color)' }}>
                  Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </small>
                <div className="d-flex gap-1">
                  <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)}>«</button>
                  <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
                    return (
                      <button key={pageNum}
                        className={`btn btn-sm ${pageNum === page ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setPage(pageNum)}>
                        {pageNum + 1}
                      </button>
                    )
                  })}
                  <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
                  <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}