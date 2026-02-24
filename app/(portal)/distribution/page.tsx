'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
    address_type_id: number; address_number: string; address_floor: string
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
  approved: 'bg-success', pending: 'bg-warning text-dark', stopped: 'bg-danger',
  transfered: 'bg-info', 'not required': 'bg-secondary', 'required distributor': 'bg-primary'
}

export default function DistributionPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [allData, setAllData] = useState<Registration[]>([]) // for CSV export
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  const [distributors, setDistributors] = useState<LookupItem[]>([])
  const [sectors, setSectors] = useState<LookupItem[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [thaaliTypes, setThaaliTypes] = useState<LookupItem[]>([])
  const [thaaliCategories, setThaaliCategories] = useState<LookupItem[]>([])
  const [houseBlocks, setHouseBlocks] = useState<LookupItem[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filterDistributor, setFilterDistributor] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [filterStatus, setFilterStatus] = useState('approved')
  const [filterFiscalYear, setFilterFiscalYear] = useState('')
  const [filterThaaliType, setFilterThaaliType] = useState('')
  const [filterThaaliCategory, setFilterThaaliCategory] = useState('')
  const [filterBlock, setFilterBlock] = useState('')

  const [stats, setStats] = useState({ total: 0, approved: 0, stopped: 0, pending: 0 })
  const [exporting, setExporting] = useState(false)

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchRegistrations() }, [page, search, filterDistributor, filterSector, filterStatus, filterFiscalYear, filterThaaliType, filterThaaliCategory, filterBlock])

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
    setFiscalYears(fy.data || [])
    setThaaliTypes(tt.data || [])
    setThaaliCategories(tc.data || [])
    setHouseBlocks(hb.data || [])
    const activeFY = (fy.data || []).find((f: FiscalYear) => f.is_active)
    if (activeFY) setFilterFiscalYear(activeFY.id.toString())
  }


  const fetchRegistrations = async () => {
  setLoading(true)

  let query = supabase
    .from('thaali_registrations')
    .select(`
      *,
      mumineen!fk_tr_mumin(
        sf_no, full_name, its_no,
        address_sector_id, address_block_id, address_type_id,
        address_number, address_floor, full_address,
        whatsapp_no, phone_no, niyyat_status_id,
        house_sectors(name),
        house_blocks(name),
        house_types(name),
        niyyat_statuses(name)
      ),
      thaalis!fk_tr_thaali(thaali_number),
      thaali_types!fk_tr_type(name),
      thaali_categories!fk_tr_category(name),
      distributors!fk_tr_distributor(full_name),
      fiscal_years!fk_tr_fiscal(gregorian_year, hijri_year)
    `, { count: 'exact' })
    .order('thaali_id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (filterStatus) query = query.eq('status', filterStatus)
  if (filterDistributor) query = query.eq('distributor_id', parseInt(filterDistributor))
  if (filterFiscalYear) query = query.eq('fiscal_year_id', parseInt(filterFiscalYear))
  if (filterThaaliType) query = query.eq('thaali_type_id', parseInt(filterThaaliType))
  if (filterThaaliCategory) query = query.eq('thaali_category_id', parseInt(filterThaaliCategory))

  const { data, count } = await query

  const filtered = applyClientFilters(data || [])
  setRegistrations(filtered)
  setTotal(count || 0)

  const { count: approved } = await supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'approved')
  const { count: stopped } = await supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'stopped')
  const { count: pending } = await supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  setStats({ total: count || 0, approved: approved || 0, stopped: stopped || 0, pending: pending || 0 })

  setLoading(false)
}

  const applyClientFilters = (data: Registration[]) => {
    let filtered = data
    if (search) {
      filtered = filtered.filter(r =>
        r.mumineen?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.mumineen?.sf_no?.toLowerCase().includes(search.toLowerCase()) ||
        r.mumineen?.its_no?.toLowerCase().includes(search.toLowerCase()) ||
        r.thaalis?.thaali_number?.toString().includes(search)
      )
    }
    if (filterSector) filtered = filtered.filter(r => r.mumineen?.address_sector_id?.toString() === filterSector)
    if (filterBlock) filtered = filtered.filter(r => r.mumineen?.address_block_id?.toString() === filterBlock)
    return filtered
  }

  const exportCSV = async () => {
  setExporting(true)
  const { data } = await supabase
    .from('thaali_registrations')
    .select(`
      *,
      mumineen!fk_tr_mumin(sf_no, full_name, its_no, address_number, address_floor, full_address, whatsapp_no, phone_no, address_sector_id, address_block_id, house_sectors(name), house_blocks(name), house_types(name), niyyat_statuses(name)),
      thaalis!fk_tr_thaali(thaali_number),
      thaali_types!fk_tr_type(name),
      thaali_categories!fk_tr_category(name),
      distributors!fk_tr_distributor(full_name),
      fiscal_years!fk_tr_fiscal(gregorian_year, hijri_year)
    `)
    .order('thaali_id')
    .range(0, 9999)

  const filtered = applyClientFilters(data || [])
  const headers = ['SF#', 'ITS#', 'Full Name', 'Thaali No', 'Size', 'Type', 'Distributor', 'Sector', 'Block', 'Number', 'Floor', 'Full Address', 'WhatsApp', 'Phone', 'Niyyat Status', 'Status', 'Remarks']
  const rows = filtered.map(r => [
    r.mumineen?.sf_no || '', r.mumineen?.its_no || '', r.mumineen?.full_name || '',
    r.thaalis?.thaali_number || '', r.thaali_types?.name || '', r.thaali_categories?.name || '',
    r.distributors?.full_name || '', r.mumineen?.house_sectors?.name || '',
    r.mumineen?.house_blocks?.name || '', r.mumineen?.address_number || '',
    r.mumineen?.address_floor || '', r.mumineen?.full_address || '',
    r.mumineen?.whatsapp_no || '', r.mumineen?.phone_no || '',
    r.mumineen?.niyyat_statuses?.name || '', r.status || '', r.remarks || '',
  ])
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `distribution_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
  setExporting(false)
}

  const clearFilters = () => {
    setSearchInput(''); setSearch('')
    setFilterDistributor(''); setFilterSector(''); setFilterStatus('approved')
    setFilterThaaliType(''); setFilterThaaliCategory(''); setFilterBlock('')
    const activeFY = fiscalYears.find(f => f.is_active)
    setFilterFiscalYear(activeFY ? activeFY.id.toString() : '')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0">Distribution</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Master delivery list</p>
        </div>
        <button className="btn btn-success btn-sm" onClick={exportCSV} disabled={exporting}>
          {exporting ? 'Exporting...' : '↓ Export CSV'}
        </button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Showing', value: registrations.length, color: '#364574' },
          { label: 'Approved', value: stats.approved, color: '#0ab39c' },
          { label: 'Stopped', value: stats.stopped, color: '#f06548' },
          { label: 'Pending', value: stats.pending, color: '#f7b84b' },
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

      {/* Filters */}
      <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body py-3">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Search</label>
              <div className="input-group input-group-sm">
                <input type="text" className="form-control" placeholder="Name, SF#, ITS#, Thaali#..."
                  value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
                <button className="btn btn-outline-primary" onClick={() => { setSearch(searchInput); setPage(0) }}>Go</button>
              </div>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Fiscal Year</label>
              <select className="form-select form-select-sm" value={filterFiscalYear}
                onChange={(e) => { setFilterFiscalYear(e.target.value); setPage(0) }}>
                <option value="">All Years</option>
                {fiscalYears.map(fy => (
                  <option key={fy.id} value={fy.id}>{fy.gregorian_year} / {fy.hijri_year}{fy.is_active ? ' ★' : ''}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Distributor</label>
              <select className="form-select form-select-sm" value={filterDistributor}
                onChange={(e) => { setFilterDistributor(e.target.value); setPage(0) }}>
                <option value="">All Distributors</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Sector</label>
              <select className="form-select form-select-sm" value={filterSector}
                onChange={(e) => { setFilterSector(e.target.value); setPage(0) }}>
                <option value="">All Sectors</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Block</label>
              <select className="form-select form-select-sm" value={filterBlock}
                onChange={(e) => { setFilterBlock(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {houseBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Size</label>
              <select className="form-select form-select-sm" value={filterThaaliType}
                onChange={(e) => { setFilterThaaliType(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {thaaliTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Type</label>
              <select className="form-select form-select-sm" value={filterThaaliCategory}
                onChange={(e) => { setFilterThaaliCategory(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {thaaliCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-md-1">
              <label style={{ fontSize: '12px', color: '#6c757d' }}>Status</label>
              <select className="form-select form-select-sm" value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }}>
                <option value="">All</option>
                {['approved', 'pending', 'stopped', 'transfered', 'not required', 'required distributor'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button className="btn btn-sm btn-outline-secondary w-100" onClick={clearFilters}>Clear</button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <>
              <table className="table table-hover mb-0" style={{ fontSize: '12px', minWidth: '1200px' }}>
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    {['#', 'Thaali No', 'SF#', 'ITS#', 'Name', 'Size', 'Type', 'Block', 'No', 'Floor', 'Sector', 'Distributor', 'WhatsApp', 'Niyyat', 'Status'].map(h => (
                      <th key={h} style={{ fontSize: '11px', color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: '#6c757d' }}>{page * PAGE_SIZE + i + 1}</td>
                      <td style={{ fontWeight: 700, color: '#364574' }}>{r.thaalis?.thaali_number || '—'}</td>
                      <td>{r.mumineen?.sf_no || '—'}</td>
                      <td style={{ color: '#6c757d' }}>{r.mumineen?.its_no || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{r.mumineen?.full_name || '—'}</td>
                      <td>{r.thaali_types?.name || '—'}</td>
                      <td>{r.thaali_categories?.name || '—'}</td>
                      <td>{r.mumineen?.house_blocks?.name || '—'}</td>
                      <td>{r.mumineen?.address_number || '—'}</td>
                      <td>{r.mumineen?.address_floor || '—'}</td>
                      <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.mumineen?.house_sectors?.name || '—'}
                      </td>
                      <td>{r.distributors?.full_name || '—'}</td>
                      <td>{r.mumineen?.whatsapp_no || '—'}</td>
                      <td>
                        <span style={{ fontSize: '10px', color: '#666' }}>
                          {r.mumineen?.niyyat_statuses?.name || '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[r.status] || 'bg-secondary'}`} style={{ fontSize: '10px' }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {registrations.length === 0 && (
                    <tr><td colSpan={15} className="text-center text-muted py-4">No records found</td></tr>
                  )}
                </tbody>
              </table>

              <div className="d-flex justify-content-between align-items-center mt-3">
                <small className="text-muted">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</small>
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