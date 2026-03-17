'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/*
  ── SQL Migrations (run once in Supabase SQL Editor) ─────────────────────────
  CREATE TABLE IF NOT EXISTS takhmeen_niyyat_log (
    id SERIAL PRIMARY KEY,
    takhmeen_id INTEGER REFERENCES takhmeen(id) ON DELETE CASCADE,
    mumin_id INTEGER NOT NULL,
    fiscal_year_id INTEGER,
    niyyat_amount NUMERIC,
    remarks TEXT,
    action VARCHAR(20) DEFAULT 'entered',  -- 'entered' | 'edited' | 'approved_edit'
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE takhmeen ADD COLUMN IF NOT EXISTS approved_amount NUMERIC;
  ALTER TABLE takhmeen ADD COLUMN IF NOT EXISTS approved_at DATE;
  NOTIFY pgrst, 'reload schema';
*/

// ── Types ─────────────────────────────────────────────────────────────────────

interface Mumin {
  id: number; sf_no: string; full_name: string; its_no: string
  whatsapp_no: string; phone_no: string; full_address: string
  address_number: string; address_floor: string; address_category: string
  address_type_id: number | null; address_block_id: number | null; address_sector_id: number | null
  niyyat_status_id: number; mumin_category_id: number | null
  house_sectors?: { name: string }
  house_blocks?: { name: string }
  house_types?: { name: string }
  niyyat_statuses?: { name: string }
  mumin_categories?: { name: string }
}

interface ThaaliReg { thaali_number: number | null; distributor_name: string | null }

interface Takhmeen {
  id: number; mumin_id: number; fiscal_year_id: number
  niyyat_amount: number | null; approved_amount: number | null; approved_at: string | null
  remarks: string | null; status: string
  fiscal_years?: { gregorian_year: number; hijri_year: string }
  mumineen?: Mumin
}

interface NiyyatLog {
  id: number; takhmeen_id: number; niyyat_amount: number | null
  remarks: string | null; action: string; created_at: string
}

interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }
interface LookupItem { id: number; name: string }

const PAGE_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildAddress = (typeName: string, num: string, cat: string, floor: string, blockName: string, sectorName: string) => {
  const parts: string[] = []
  const unit = `${typeName ? typeName + ' ' : ''}${num}${cat}`.trim()
  if (unit) parts.push(unit)
  if (floor) {
    const n = parseInt(floor)
    if (n === 0) parts.push('Ground Floor')
    else {
      const s = ['th','st','nd','rd'], v = n % 100
      const suffix = s[(v-20)%10] || s[v] || s[0]
      parts.push(`${n}${suffix} Floor`)
    }
  }
  if (blockName) parts.push(`Block ${blockName}`)
  if (sectorName) parts.push(sectorName)
  return parts.join(', ')
}

const fmtAmount = (n: number | null | undefined) =>
  n ? `Rs. ${Number(n).toLocaleString()}` : '—'

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

// ── Style constants ───────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: 'var(--bs-secondary-color)', marginBottom: 8 }
const metaLabel: React.CSSProperties    = { fontSize: 11, color: 'var(--bs-secondary-color)', marginBottom: 2 }
const metaValue: React.CSSProperties    = { fontSize: 13, fontWeight: 500, color: 'var(--bs-body-color)' }
const labelStyle: React.CSSProperties  = { fontSize: 13, fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: 4 }
const th: React.CSSProperties          = { fontSize: 12, color: 'var(--bs-secondary-color)', fontWeight: 600, whiteSpace: 'nowrap' }
const cardStyle                         = { border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }

// ── Main component ─────────────────────────────────────────────────────────────

export default function TakhmeenPage() {
  const [activeTab, setActiveTab]           = useState<'verification' | 'niyyat' | 'approval'>('verification')
  const [approvalSubTab, setApprovalSubTab] = useState<'pending' | 'approved'>('pending')
  const [approvedDateFilter, setApprovedDateFilter] = useState('')

  // Lookups
  const [houseTypes, setHouseTypes] = useState<LookupItem[]>([])
  const [sectors, setSectors]       = useState<LookupItem[]>([])
  const [blocks, setBlocks]         = useState<LookupItem[]>([])
  const [activeFY, setActiveFY]     = useState<FiscalYear | null>(null)
  const [fyLabel, setFyLabel]       = useState('')

  // Shared list state
  const [loading, setLoading]       = useState(false)
  const [page, setPage]             = useState(0)
  const [total, setTotal]           = useState(0)
  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [saving, setSaving]         = useState(false)
  const [stats, setStats]           = useState({ noShow:0, verified:0, pendingApproval:0, approved:0 })

  // Verification tab
  const [verifyList, setVerifyList]     = useState<Mumin[]>([])
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyingMumin, setVerifyingMumin]   = useState<Mumin | null>(null)
  const [verifyThaali, setVerifyThaali]       = useState<ThaaliReg | null>(null)
  const [verifyForm, setVerifyForm] = useState({
    full_name:'', whatsapp_no:'', phone_no:'',
    address_type_id:'' as string|number, address_block_id:'' as string|number,
    address_sector_id:'' as string|number, address_number:'', address_category:'', address_floor:'',
  })

  // Niyyat tab
  const [niyyatList, setNiyyatList]         = useState<Mumin[]>([])
  const [showNiyyatModal, setShowNiyyatModal] = useState(false)
  const [niyyatMumin, setNiyyatMumin]       = useState<Mumin | null>(null)
  const [niyyatHistory, setNiyyatHistory]   = useState<Takhmeen[]>([])
  const [niyyatLog, setNiyyatLog]           = useState<NiyyatLog[]>([])
  const [currentTakhmeem, setCurrentTakhmeem] = useState<Takhmeen | null>(null)
  const [niyyatForm, setNiyyatForm]         = useState({ niyyat_amount:'', remarks:'' })
  const [niyyatError, setNiyyatError]       = useState('')

  // Approval tab
  const [approvalList, setApprovalList]     = useState<Takhmeen[]>([])
  const [approvedList, setApprovedList]     = useState<Takhmeen[]>([])
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvingItem, setApprovingItem]   = useState<Takhmeen | null>(null)
  const [approvalNiyyatLog, setApprovalNiyyatLog] = useState<NiyyatLog[]>([])
  const [approvalForm, setApprovalForm] = useState({
    niyyat_amount:'', approved_amount:'',
    approved_at: new Date().toISOString().split('T')[0], remarks:'',
  })
  const [approvalError, setApprovalError]   = useState('')

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { if (activeFY) fetchStats() }, [activeFY])
  useEffect(() => {
    setPage(0); setSearch(''); setSearchInput('')
    if (activeTab === 'verification') fetchVerification()
    else if (activeTab === 'niyyat') fetchNiyyat()
    else fetchApproval()
  }, [activeTab])
  useEffect(() => {
    if (activeTab === 'verification') fetchVerification()
    else if (activeTab === 'niyyat') fetchNiyyat()
    else fetchApproval()
  }, [page, search, filterSector, activeFY, approvalSubTab, approvedDateFilter])

  // ── Lookups ───────────────────────────────────────────────────────────────

  const fetchLookups = async () => {
    const [fy, ht, s, b] = await Promise.all([
      supabase.from('fiscal_years').select('*').order('id', { ascending: false }),
      supabase.from('house_types').select('id, name').order('name'),
      supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name'),
      supabase.from('house_blocks').select('id, name').order('name'),
    ])
    setHouseTypes(ht.data || [])
    setSectors(s.data || [])
    setBlocks(b.data || [])
    const active = (fy.data || []).find((f: FiscalYear) => f.is_active) || (fy.data || [])[0]
    if (active) { setActiveFY(active); setFyLabel(`${active.gregorian_year} / ${active.hijri_year} H`) }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const fetchStats = async () => {
    const getCount = async (name: string) => {
      const { data: s } = await supabase.from('niyyat_statuses').select('id').eq('name', name).single()
      if (!s) return 0
      const { count } = await supabase.from('mumineen').select('*', { count:'exact', head:true })
        .eq('is_hof', true).eq('niyyat_status_id', s.id)
      return count || 0
    }
    const [noShow, verified, pendingApproval, approved] = await Promise.all([
      getCount('No-Show'), getCount('Verified'), getCount('Pending Approval'), getCount('Approved')
    ])
    setStats({ noShow, verified, pendingApproval, approved })
  }

  // ── Fetch tabs ────────────────────────────────────────────────────────────

  const fetchVerification = async () => {
    setLoading(true)
    const { data: ns } = await supabase.from('niyyat_statuses').select('id').eq('name', 'No-Show').single()
    if (!ns) { setLoading(false); return }
    let q = supabase.from('mumineen')
      .select('*, house_sectors(name), house_blocks(name), house_types(name), niyyat_statuses(name), mumin_categories(name)', { count:'exact' })
      .eq('is_hof', true).eq('niyyat_status_id', ns.id).order('full_name')
      .range(page * PAGE_SIZE, (page+1) * PAGE_SIZE - 1)
    if (search) q = q.or(`full_name.ilike.%${search}%,sf_no.ilike.%${search}%,its_no.ilike.%${search}%`)
    if (filterSector) q = q.eq('address_sector_id', parseInt(filterSector))
    const { data, count } = await q
    setVerifyList((data as Mumin[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const fetchNiyyat = async () => {
    setLoading(true)
    const { data: ns } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Verified').single()
    if (!ns) { setLoading(false); return }
    let q = supabase.from('mumineen')
      .select('*, house_sectors(name), house_blocks(name), niyyat_statuses(name)', { count:'exact' })
      .eq('is_hof', true).eq('niyyat_status_id', ns.id).order('full_name')
      .range(page * PAGE_SIZE, (page+1) * PAGE_SIZE - 1)
    if (search) q = q.or(`full_name.ilike.%${search}%,sf_no.ilike.%${search}%,its_no.ilike.%${search}%`)
    if (filterSector) q = q.eq('address_sector_id', parseInt(filterSector))
    const { data, count } = await q
    setNiyyatList((data as Mumin[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }

  const fetchApproval = async () => {
    if (!activeFY) return
    setLoading(true)
    if (approvalSubTab === 'pending') {
      const { data, count } = await supabase.from('takhmeen')
        .select('*, mumineen(id, sf_no, full_name, its_no, whatsapp_no, phone_no, full_address, house_sectors(name))', { count:'exact' })
        .eq('status', 'pending_approval').eq('fiscal_year_id', activeFY.id)
        .order('id', { ascending: false })
        .range(page * PAGE_SIZE, (page+1) * PAGE_SIZE - 1)
      setApprovalList((data as Takhmeen[]) || [])
      setTotal(count || 0)
    } else {
      let q = supabase.from('takhmeen')
        .select('*, mumineen(id, sf_no, full_name, its_no, house_sectors(name))', { count:'exact' })
        .eq('status', 'approved').eq('fiscal_year_id', activeFY.id)
        .order('approved_at', { ascending: false })
        .range(page * PAGE_SIZE, (page+1) * PAGE_SIZE - 1)
      if (approvedDateFilter) q = q.eq('approved_at', approvedDateFilter)
      const { data, count } = await q
      setApprovedList((data as Takhmeen[]) || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  // ── Verify modal ──────────────────────────────────────────────────────────

  const openVerifyModal = async (m: Mumin) => {
    setVerifyingMumin(m)
    setVerifyForm({
      full_name: m.full_name || '', whatsapp_no: m.whatsapp_no || '', phone_no: m.phone_no || '',
      address_type_id: m.address_type_id || '', address_block_id: m.address_block_id || '',
      address_sector_id: m.address_sector_id || '', address_number: m.address_number || '',
      address_category: m.address_category || '', address_floor: m.address_floor || '',
    })
    // Fetch thaali registration
    const { data: reg } = await supabase.from('thaali_registrations')
      .select('thaali_id, distributor_id').eq('mumin_id', m.id).maybeSingle()
    if (reg) {
      const [thaaliRes, distRes] = await Promise.all([
        reg.thaali_id ? supabase.from('thaalis').select('thaali_number').eq('id', reg.thaali_id).single() : Promise.resolve({ data: null }),
        reg.distributor_id ? supabase.from('distributors').select('full_name').eq('id', reg.distributor_id).single() : Promise.resolve({ data: null }),
      ])
      setVerifyThaali({ thaali_number: thaaliRes.data?.thaali_number ?? null, distributor_name: distRes.data?.full_name ?? null })
    } else { setVerifyThaali(null) }
    setShowVerifyModal(true)
  }

  const verifyAddrPreview = buildAddress(
    houseTypes.find(t => t.id === Number(verifyForm.address_type_id))?.name || '',
    verifyForm.address_number, verifyForm.address_category, verifyForm.address_floor,
    blocks.find(b => b.id === Number(verifyForm.address_block_id))?.name || '',
    sectors.find(s => s.id === Number(verifyForm.address_sector_id))?.name || '',
  )

  const handleVerify = async () => {
    if (!verifyingMumin) return
    setSaving(true)
    const { data: vs } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Verified').single()
    await supabase.from('mumineen').update({
      full_name: verifyForm.full_name,
      whatsapp_no: verifyForm.whatsapp_no || null,
      phone_no: verifyForm.phone_no || null,
      address_type_id: verifyForm.address_type_id || null,
      address_block_id: verifyForm.address_block_id || null,
      address_sector_id: verifyForm.address_sector_id || null,
      address_number: verifyForm.address_number || null,
      address_category: verifyForm.address_category || null,
      address_floor: verifyForm.address_floor || null,
      full_address: verifyAddrPreview || null,
      niyyat_status_id: vs?.id,
    }).eq('id', verifyingMumin.id)
    await fetchVerification(); await fetchStats()
    setShowVerifyModal(false); setSaving(false)
  }

  // ── Niyyat modal ──────────────────────────────────────────────────────────

  const openNiyyatModal = async (m: Mumin) => {
    setNiyyatMumin(m); setNiyyatError('')
    if (activeFY) {
      const { data: existing } = await supabase.from('takhmeen')
        .select('*').eq('mumin_id', m.id).eq('fiscal_year_id', activeFY.id).maybeSingle()
      setCurrentTakhmeem(existing || null)
      setNiyyatForm({ niyyat_amount: existing?.niyyat_amount?.toString() || '', remarks: existing?.remarks || '' })
      if (existing) {
        const { data: log } = await supabase.from('takhmeen_niyyat_log')
          .select('*').eq('takhmeen_id', existing.id).order('created_at', { ascending: false })
        setNiyyatLog(log || [])
      } else { setNiyyatLog([]) }
    }
    // Past 4 years — fetch last 4 FYs and match approved records
    const { data: allFYs } = await supabase.from('fiscal_years')
      .select('id, gregorian_year, hijri_year')
      .order('id', { ascending: false }).limit(5)
    const { data: histData } = await supabase.from('takhmeen')
      .select('fiscal_year_id, niyyat_amount, approved_amount, status')
      .eq('mumin_id', m.id)
    // Build 4-year array always showing something
    const histMap = new Map((histData || []).map((h: any) => [h.fiscal_year_id, h]))
    const past4 = (allFYs || [])
      .filter((fy: any) => fy.id !== activeFY?.id)
      .slice(0, 4)
      .map((fy: any) => ({
        fiscal_year_id: fy.id,
        fiscal_years: { gregorian_year: fy.gregorian_year, hijri_year: fy.hijri_year },
        approved_amount: histMap.get(fy.id)?.approved_amount ?? null,
        niyyat_amount: histMap.get(fy.id)?.niyyat_amount ?? null,
        status: histMap.get(fy.id)?.status ?? null,
        id: fy.id,
      }))
    setNiyyatHistory(past4)
    setShowNiyyatModal(true)
  }

  const handleSaveNiyyat = async () => {
    if (!niyyatMumin || !activeFY) return
    if (!niyyatForm.niyyat_amount.trim()) { setNiyyatError('Niyyat amount is required.'); return }
    setSaving(true); setNiyyatError('')
    try {
      const amount = parseFloat(niyyatForm.niyyat_amount)
      if (currentTakhmeem) {
        await supabase.from('takhmeen').update({
          niyyat_amount: amount, remarks: niyyatForm.remarks || null,
        }).eq('id', currentTakhmeem.id)
        await supabase.from('takhmeen_niyyat_log').insert({
          takhmeen_id: currentTakhmeem.id, mumin_id: niyyatMumin.id,
          fiscal_year_id: activeFY.id, niyyat_amount: amount,
          remarks: niyyatForm.remarks || null, action: 'edited',
        })
      } else {
        const { data: newT } = await supabase.from('takhmeen').insert({
          mumin_id: niyyatMumin.id, fiscal_year_id: activeFY.id,
          niyyat_amount: amount, remarks: niyyatForm.remarks || null, status: 'pending_approval',
        }).select('id').single()
        if (newT?.id) {
          await supabase.from('takhmeen_niyyat_log').insert({
            takhmeen_id: newT.id, mumin_id: niyyatMumin.id,
            fiscal_year_id: activeFY.id, niyyat_amount: amount,
            remarks: niyyatForm.remarks || null, action: 'entered',
          })
        }
        const { data: ps } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Pending Approval').single()
        await supabase.from('mumineen').update({ niyyat_status_id: ps?.id }).eq('id', niyyatMumin.id)
      }
      await fetchNiyyat(); await fetchStats()
      setShowNiyyatModal(false)
    } finally { setSaving(false) }
  }

  // ── Approval modal ────────────────────────────────────────────────────────

  const openApprovalModal = async (item: Takhmeen) => {
    setApprovingItem(item); setApprovalError('')
    setApprovalForm({
      niyyat_amount: item.niyyat_amount?.toString() || '',
      approved_amount: item.approved_amount?.toString() || item.niyyat_amount?.toString() || '',
      approved_at: item.approved_at || new Date().toISOString().split('T')[0],
      remarks: item.remarks || '',
    })
    const { data: log } = await supabase.from('takhmeen_niyyat_log')
      .select('*').eq('takhmeen_id', item.id).order('created_at', { ascending: true })
    setApprovalNiyyatLog(log || [])
    setShowApprovalModal(true)
  }

  const handleSaveNiyyatEdit = async () => {
    if (!approvingItem) return
    if (!approvalForm.niyyat_amount) { setApprovalError('Niyyat amount required.'); return }
    setSaving(true)
    const amount = parseFloat(approvalForm.niyyat_amount)
    await supabase.from('takhmeen').update({
      niyyat_amount: amount, remarks: approvalForm.remarks || null,
    }).eq('id', approvingItem.id)
    await supabase.from('takhmeen_niyyat_log').insert({
      takhmeen_id: approvingItem.id, mumin_id: approvingItem.mumin_id,
      fiscal_year_id: approvingItem.fiscal_year_id, niyyat_amount: amount,
      remarks: approvalForm.remarks || null, action: 'approved_edit',
    })
    const { data: log } = await supabase.from('takhmeen_niyyat_log')
      .select('*').eq('takhmeen_id', approvingItem.id).order('created_at', { ascending: true })
    setApprovalNiyyatLog(log || [])
    setApprovingItem({ ...approvingItem, niyyat_amount: amount })
    setSaving(false)
  }

  const handleApprove = async () => {
    if (!approvingItem) return
    if (!approvalForm.approved_amount) { setApprovalError('Approved amount is required.'); return }
    setSaving(true); setApprovalError('')
    const { data: as_ } = await supabase.from('niyyat_statuses').select('id').eq('name', 'Approved').single()
    await supabase.from('takhmeen').update({
      approved_amount: parseFloat(approvalForm.approved_amount),
      approved_at: approvalForm.approved_at || null,
      remarks: approvalForm.remarks || null,
      status: 'approved',
    }).eq('id', approvingItem.id)
    await supabase.from('mumineen').update({ niyyat_status_id: as_?.id }).eq('id', approvingItem.mumin_id)
    await fetchApproval(); await fetchStats()
    setShowApprovalModal(false); setSaving(false)
  }

  // ── Shared UI ─────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const FilterBar = () => (
    <div className="d-flex gap-2 mb-3 flex-wrap">
      <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
        <input type="text" className="form-control" placeholder="Search name, SF#, ITS#..."
          value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
        <button className="btn btn-outline-primary" onClick={() => { setSearch(searchInput); setPage(0) }}>Go</button>
        {search && <button className="btn btn-outline-secondary" onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}>✕</button>}
      </div>
      <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={filterSector}
        onChange={e => { setFilterSector(e.target.value); setPage(0) }}>
        <option value="">All Sectors</option>
        {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )

  const Pagination = () => (
    <div className="d-flex justify-content-between align-items-center mt-3">
      <small style={{ color: 'var(--bs-secondary-color)' }}>
        Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page+1) * PAGE_SIZE, total)} of {total}
      </small>
      <div className="d-flex gap-1">
        <button className="btn btn-sm btn-outline-secondary" disabled={page===0} onClick={() => setPage(0)}>«</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={page===0} onClick={() => setPage(p=>p-1)}>‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_,i) => {
          const pn = Math.max(0, Math.min(page-2, totalPages-5)) + i
          return <button key={pn} className={`btn btn-sm ${pn===page?'btn-primary':'btn-outline-secondary'}`} onClick={() => setPage(pn)}>{pn+1}</button>
        })}
        <button className="btn btn-sm btn-outline-secondary" disabled={page>=totalPages-1} onClick={() => setPage(p=>p+1)}>›</button>
        <button className="btn btn-sm btn-outline-secondary" disabled={page>=totalPages-1} onClick={() => setPage(totalPages-1)}>»</button>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header — FY auto-detected, no dropdown */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Takhmeen</h4>
          <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>Annual niyyat verification and approval</p>
        </div>
        <span className="badge" style={{ background: '#364574', fontSize: 13, padding: '7px 14px' }}>
          {fyLabel} ★
        </span>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label:'No-Show',          value: stats.noShow,          color:'#6c757d' },
          { label:'Verified',         value: stats.verified,        color:'#0dcaf0' },
          { label:'Pending Approval', value: stats.pendingApproval, color:'#0d6efd' },
          { label:'Approved',         value: stats.approved,        color:'#0ab39c' },
        ].map((s, i) => (
          <div key={i} className="col-md-3">
            <div className="card" style={cardStyle}>
              <div className="card-body p-3">
                <p className="mb-1" style={{ fontSize: 13, color:'var(--bs-secondary-color)' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main tabs */}
      <ul className="nav nav-tabs mb-0">
        {[
          { key:'verification', label:'1. Verification' },
          { key:'niyyat',       label:'2. Niyyat' },
          { key:'approval',     label:'3. Approval' },
        ].map(t => (
          <li key={t.key} className="nav-item">
            <button className={`nav-link ${activeTab===t.key?'active':''}`}
              onClick={() => setActiveTab(t.key as any)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {/* ── VERIFICATION TAB ── */}
      {activeTab === 'verification' && (
        <div className="card" style={{ ...cardStyle, borderRadius:'0 0 10px 10px' }}>
          <div className="card-body">
            <FilterBar />
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0" style={{ fontSize:13 }}>
                    <thead style={{ background:'var(--bs-tertiary-bg)', borderBottom:'2px solid var(--bs-border-color)' }}>
                      <tr>{['#','SF#','ITS#','Name','Category','Sector','Address','WhatsApp','Action'].map(h=><th key={h} style={th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {verifyList.map((m, i) => (
                        <tr key={m.id}>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{page*PAGE_SIZE+i+1}</td>
                          <td style={{ fontWeight:600, color:'#364574' }}>{m.sf_no}</td>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{m.its_no||'—'}</td>
                          <td style={{ fontWeight:500, color:'var(--bs-body-color)' }}>{m.full_name}</td>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{(m as any).mumin_categories?.name||'—'}</td>
                          <td>{(m as any).house_sectors?.name||'—'}</td>
                          <td style={{ maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--bs-secondary-color)' }}>{m.full_address||'—'}</td>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{m.whatsapp_no||'—'}</td>
                          <td>
                            <button className="btn btn-sm btn-primary" style={{ fontSize:11 }} onClick={() => openVerifyModal(m)}>Verify</button>
                          </td>
                        </tr>
                      ))}
                      {verifyList.length===0 && <tr><td colSpan={9} className="text-center py-4" style={{ color:'var(--bs-secondary-color)' }}>No mumineen pending verification</td></tr>}
                    </tbody>
                  </table>
                </div>
                <Pagination />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── NIYYAT TAB ── */}
      {activeTab === 'niyyat' && (
        <div className="card" style={{ ...cardStyle, borderRadius:'0 0 10px 10px' }}>
          <div className="card-body">
            <FilterBar />
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0" style={{ fontSize:13 }}>
                    <thead style={{ background:'var(--bs-tertiary-bg)', borderBottom:'2px solid var(--bs-border-color)' }}>
                      <tr>{['#','SF#','ITS#','Name','Sector','Address','WhatsApp','Action'].map(h=><th key={h} style={th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {niyyatList.map((m, i) => (
                        <tr key={m.id}>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{page*PAGE_SIZE+i+1}</td>
                          <td style={{ fontWeight:600, color:'#364574' }}>{m.sf_no}</td>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{m.its_no||'—'}</td>
                          <td style={{ fontWeight:500, color:'var(--bs-body-color)' }}>{m.full_name}</td>
                          <td>{(m as any).house_sectors?.name||'—'}</td>
                          <td style={{ maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--bs-secondary-color)' }}>{m.full_address||'—'}</td>
                          <td style={{ color:'var(--bs-secondary-color)' }}>{m.whatsapp_no||'—'}</td>
                          <td>
                            <button className="btn btn-sm btn-success" style={{ fontSize:11 }} onClick={() => openNiyyatModal(m)}>Enter Niyyat</button>
                          </td>
                        </tr>
                      ))}
                      {niyyatList.length===0 && <tr><td colSpan={8} className="text-center py-4" style={{ color:'var(--bs-secondary-color)' }}>No verified mumineen pending niyyat</td></tr>}
                    </tbody>
                  </table>
                </div>
                <Pagination />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── APPROVAL TAB ── */}
      {activeTab === 'approval' && (
        <>
          {/* Sub-tabs */}
          <div className="d-flex align-items-center" style={{ background:'var(--bs-tertiary-bg)', borderBottom:'1px solid var(--bs-border-color)', paddingLeft:8 }}>
            {([['pending',`Pending (${stats.pendingApproval})`],['approved',`Approved (${stats.approved})`]] as [string,string][]).map(([key,label]) => (
              <button key={key} onClick={() => { setApprovalSubTab(key as any); setPage(0) }}
                style={{
                  border:'none', background:'none', padding:'8px 16px', fontSize:12.5, cursor:'pointer',
                  color: approvalSubTab===key ? '#364574' : 'var(--bs-secondary-color)',
                  fontWeight: approvalSubTab===key ? 600 : 400,
                  borderBottom: approvalSubTab===key ? '2px solid #364574' : '2px solid transparent',
                  marginBottom: -1,
                }}>{label}</button>
            ))}
            {approvalSubTab === 'approved' && (
              <div className="ms-auto d-flex align-items-center gap-2 pe-3">
                <label style={{ fontSize:12, color:'var(--bs-secondary-color)', marginBottom:0 }}>Filter by date:</label>
                <input type="date" className="form-control form-control-sm" style={{ maxWidth:160 }}
                  value={approvedDateFilter} onChange={e => { setApprovedDateFilter(e.target.value); setPage(0) }} />
                {approvedDateFilter && <button className="btn btn-sm btn-outline-secondary" onClick={() => setApprovedDateFilter('')}>Clear</button>}
              </div>
            )}
          </div>

          <div className="card" style={{ ...cardStyle, borderRadius:'0 0 10px 10px' }}>
            <div className="card-body">
              {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
                <>
                  {/* Pending sub-tab */}
                  {approvalSubTab === 'pending' && (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0" style={{ fontSize:13 }}>
                        <thead style={{ background:'var(--bs-tertiary-bg)', borderBottom:'2px solid var(--bs-border-color)' }}>
                          <tr>{['#','SF#','Name','Niyyat Amount','Remarks','Action'].map(h=><th key={h} style={th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {approvalList.map((item, i) => (
                            <tr key={item.id}>
                              <td style={{ color:'var(--bs-secondary-color)' }}>{page*PAGE_SIZE+i+1}</td>
                              <td style={{ fontWeight:600, color:'#364574' }}>{(item.mumineen as any)?.sf_no||'—'}</td>
                              <td style={{ fontWeight:500, color:'var(--bs-body-color)' }}>{(item.mumineen as any)?.full_name||'—'}</td>
                              <td style={{ fontWeight:700, color:'#364574', fontSize:14 }}>{fmtAmount(item.niyyat_amount)}</td>
                              <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--bs-secondary-color)' }}>{item.remarks||'—'}</td>
                              <td>
                                <button className="btn btn-sm btn-success" style={{ fontSize:11 }} onClick={() => openApprovalModal(item)}>
                                  Review & Approve
                                </button>
                              </td>
                            </tr>
                          ))}
                          {approvalList.length===0 && <tr><td colSpan={6} className="text-center py-4" style={{ color:'var(--bs-secondary-color)' }}>No pending approvals</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Approved sub-tab */}
                  {approvalSubTab === 'approved' && (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0" style={{ fontSize:13 }}>
                        <thead style={{ background:'var(--bs-tertiary-bg)', borderBottom:'2px solid var(--bs-border-color)' }}>
                          <tr>{['#','SF#','Name','Niyyat','Approved Amount','Approved On','Remarks'].map(h=><th key={h} style={th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {approvedList.map((item, i) => (
                            <tr key={item.id}>
                              <td style={{ color:'var(--bs-secondary-color)' }}>{page*PAGE_SIZE+i+1}</td>
                              <td style={{ fontWeight:600, color:'#364574' }}>{(item.mumineen as any)?.sf_no||'—'}</td>
                              <td style={{ fontWeight:500, color:'var(--bs-body-color)' }}>{(item.mumineen as any)?.full_name||'—'}</td>
                              <td style={{ color:'var(--bs-secondary-color)' }}>{fmtAmount(item.niyyat_amount)}</td>
                              <td style={{ fontWeight:700, color:'#0ab39c', fontSize:14 }}>{fmtAmount(item.approved_amount)}</td>
                              <td style={{ color:'var(--bs-secondary-color)' }}>{fmtDate(item.approved_at)}</td>
                              <td style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--bs-secondary-color)' }}>{item.remarks||'—'}</td>
                            </tr>
                          ))}
                          {approvedList.length===0 && <tr><td colSpan={7} className="text-center py-4" style={{ color:'var(--bs-secondary-color)' }}>No approved records{approvedDateFilter?' for selected date':''}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Pagination />
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── VERIFY MODAL ── */}
      {showVerifyModal && verifyingMumin && (
        <div className="modal show d-block" style={{ background:'rgba(0,0,0,0.5)', zIndex:1055 }}>
          <div className="modal-dialog modal-lg" style={{ marginTop:60 }}>
            <div className="modal-content" style={{ background:'var(--bs-body-bg)', border:'none', borderRadius:12 }}>
              <div className="modal-header" style={{ borderBottom:'1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color:'var(--bs-body-color)' }}>Verify — SF# {verifyingMumin.sf_no}</h5>
                  <small style={{ color:'var(--bs-secondary-color)' }}>Review and confirm details before verifying</small>
                </div>
                <button className="btn-close" onClick={() => setShowVerifyModal(false)} />
              </div>
              <div className="modal-body" style={{ overflowY:'auto', maxHeight:'70vh' }}>

                {/* Read-only info panel */}
                <div className="p-3 mb-4 rounded" style={{ background:'var(--bs-secondary-bg)', border:'1px solid var(--bs-border-color)' }}>
                  <p style={sectionLabel}>HOF Information</p>
                  <div className="row g-3">
                    <div className="col-3"><div style={metaLabel}>SF#</div><div style={{ ...metaValue, color:'#364574', fontWeight:700 }}>{verifyingMumin.sf_no}</div></div>
                    <div className="col-3"><div style={metaLabel}>ITS#</div><div style={metaValue}>{verifyingMumin.its_no||'—'}</div></div>
                    <div className="col-3"><div style={metaLabel}>Category</div><div style={metaValue}>{(verifyingMumin as any).mumin_categories?.name||'—'}</div></div>
                    <div className="col-3"><div style={metaLabel}>Sector</div><div style={metaValue}>{(verifyingMumin as any).house_sectors?.name||'—'}</div></div>
                    <div className="col-4">
                      <div style={metaLabel}>Thaali #</div>
                      <div>
                        {verifyThaali?.thaali_number
                          ? <span className="badge" style={{ background:'#364574', color:'#fff', fontSize:12 }}>#{verifyThaali.thaali_number}</span>
                          : <span style={{ ...metaValue, color:'var(--bs-secondary-color)' }}>Not assigned</span>}
                      </div>
                    </div>
                    <div className="col-4"><div style={metaLabel}>Distributor</div><div style={metaValue}>{verifyThaali?.distributor_name||'—'}</div></div>
                    <div className="col-4"><div style={metaLabel}>Phone</div><div style={metaValue}>{verifyingMumin.phone_no||'—'}</div></div>
                  </div>
                </div>

                {/* Editable details */}
                <p style={sectionLabel}>Update Details</p>
                <div className="row g-3 mb-4">
                  <div className="col-12">
                    <label style={labelStyle}>Full Name *</label>
                    <input className="form-control form-control-sm" value={verifyForm.full_name}
                      onChange={e => setVerifyForm(p=>({...p, full_name:e.target.value}))} />
                  </div>
                  <div className="col-6">
                    <label style={labelStyle}>WhatsApp</label>
                    <input className="form-control form-control-sm" value={verifyForm.whatsapp_no}
                      onChange={e => setVerifyForm(p=>({...p, whatsapp_no:e.target.value}))} />
                  </div>
                  <div className="col-6">
                    <label style={labelStyle}>Phone</label>
                    <input className="form-control form-control-sm" value={verifyForm.phone_no}
                      onChange={e => setVerifyForm(p=>({...p, phone_no:e.target.value}))} />
                  </div>
                </div>

                <p style={sectionLabel}>Address</p>
                <div className="row g-3">
                  <div className="col-4">
                    <label style={labelStyle}>House Type</label>
                    <select className="form-select form-select-sm" value={verifyForm.address_type_id}
                      onChange={e => setVerifyForm(p=>({...p, address_type_id:e.target.value}))}>
                      <option value="">— Select —</option>
                      {houseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Number</label>
                    <input className="form-control form-control-sm" placeholder="e.g. 4" value={verifyForm.address_number}
                      onChange={e => setVerifyForm(p=>({...p, address_number:e.target.value}))} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Category (A–Z)</label>
                    <input className="form-control form-control-sm" placeholder="e.g. A" value={verifyForm.address_category}
                      onChange={e => setVerifyForm(p=>({...p, address_category:e.target.value}))} maxLength={5} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Floor <span style={{ fontWeight:400, fontSize:11 }}>(0=Ground)</span></label>
                    <input className="form-control form-control-sm" placeholder="e.g. 2" value={verifyForm.address_floor}
                      onChange={e => setVerifyForm(p=>({...p, address_floor:e.target.value}))} />
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Block</label>
                    <select className="form-select form-select-sm" value={verifyForm.address_block_id}
                      onChange={e => setVerifyForm(p=>({...p, address_block_id:e.target.value}))}>
                      <option value="">— Select —</option>
                      {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="col-4">
                    <label style={labelStyle}>Sector</label>
                    <select className="form-select form-select-sm" value={verifyForm.address_sector_id}
                      onChange={e => setVerifyForm(p=>({...p, address_sector_id:e.target.value}))}>
                      <option value="">— Select —</option>
                      {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="col-12">
                    <label style={labelStyle}>Address Preview</label>
                    <div style={{ background:'var(--bs-secondary-bg)', borderRadius:6, padding:'8px 12px', fontSize:13, minHeight:36, borderLeft:`3px solid ${verifyAddrPreview?'#ffbf69':'var(--bs-border-color)'}`, color: verifyAddrPreview?'#364574':'var(--bs-secondary-color)' }}>
                      {verifyAddrPreview || 'Fill fields above to preview…'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop:'1px solid var(--bs-border-color)' }}>
                <button className="btn btn-light btn-sm" onClick={() => setShowVerifyModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleVerify} disabled={saving}>
                  {saving ? 'Saving...' : '✓ Verify Mumin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NIYYAT MODAL ── */}
      {showNiyyatModal && niyyatMumin && (
        <div className="modal show d-block" style={{ background:'rgba(0,0,0,0.5)', zIndex:1055 }}>
          <div className="modal-dialog modal-lg" style={{ marginTop:60 }}>
            <div className="modal-content" style={{ background:'var(--bs-body-bg)', border:'none', borderRadius:12 }}>
              <div className="modal-header" style={{ borderBottom:'1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color:'var(--bs-body-color)' }}>
                    Niyyat — SF# {niyyatMumin.sf_no} · {niyyatMumin.full_name}
                  </h5>
                  <small style={{ color:'var(--bs-secondary-color)' }}>{fyLabel}</small>
                </div>
                <button className="btn-close" onClick={() => setShowNiyyatModal(false)} />
              </div>
              <div className="modal-body" style={{ overflowY:'auto', maxHeight:'70vh' }}>

                {/* Mumin info */}
                <div className="p-3 mb-3 rounded" style={{ background:'var(--bs-secondary-bg)', border:'1px solid var(--bs-border-color)' }}>
                  <div className="row g-2">
                    <div className="col-3"><div style={metaLabel}>SF#</div><div style={{ ...metaValue, color:'#364574', fontWeight:700 }}>{niyyatMumin.sf_no}</div></div>
                    <div className="col-3"><div style={metaLabel}>ITS#</div><div style={metaValue}>{niyyatMumin.its_no||'—'}</div></div>
                    <div className="col-3"><div style={metaLabel}>WhatsApp</div><div style={metaValue}>{niyyatMumin.whatsapp_no||'—'}</div></div>
                    <div className="col-3"><div style={metaLabel}>Sector</div><div style={metaValue}>{(niyyatMumin as any).house_sectors?.name||'—'}</div></div>
                    <div className="col-12"><div style={metaLabel}>Address</div><div style={metaValue}>{niyyatMumin.full_address||'—'}</div></div>
                  </div>
                </div>

                {/* Past 4 years — always shown */}
                <div className="mb-3">
                  <p style={sectionLabel}>Past 4 Years Contributions</p>
                  <div className="d-flex gap-2 flex-wrap">
                    {niyyatHistory.map((h: any) => {
                      const amt = h.approved_amount ?? h.niyyat_amount
                      const hasRecord = h.status !== null
                      return (
                        <div key={h.fiscal_year_id} className="text-center p-2 rounded" style={{ background:'var(--bs-secondary-bg)', border:'1px solid var(--bs-border-color)', minWidth:120 }}>
                          <div style={{ fontSize:10, color:'var(--bs-secondary-color)', marginBottom:2 }}>
                            {(h as any).fiscal_years?.gregorian_year}
                          </div>
                          <div style={{ fontSize:10, color:'var(--bs-secondary-color)', marginBottom:4 }}>
                            {(h as any).fiscal_years?.hijri_year} H
                          </div>
                          <div style={{ fontSize:15, fontWeight:700, color: hasRecord ? (h.status==='approved'?'#0ab39c':'#f59e0b') : 'var(--bs-secondary-color)' }}>
                            {hasRecord && amt ? fmtAmount(amt) : 'Rs. 0'}
                          </div>
                          {hasRecord && (
                            <div style={{ fontSize:9, color: h.status==='approved'?'#0ab39c':'#f59e0b', marginTop:2 }}>
                              {h.status==='approved'?'Approved':h.status==='pending_approval'?'Pending':'—'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {niyyatHistory.length === 0 && (
                      <>
                        {[1,2,3,4].map(n => (
                          <div key={n} className="text-center p-2 rounded" style={{ background:'var(--bs-secondary-bg)', border:'1px solid var(--bs-border-color)', minWidth:110 }}>
                            <div style={{ fontSize:10, color:'var(--bs-secondary-color)', marginBottom:4 }}>—</div>
                            <div style={{ fontSize:15, fontWeight:700, color:'var(--bs-secondary-color)' }}>Rs. 0</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Niyyat entry log for current year */}
                {niyyatLog.length > 0 && (
                  <div className="mb-3">
                    <p style={sectionLabel}>Niyyat Log — {fyLabel}</p>
                    <table className="table table-sm" style={{ fontSize:12 }}>
                      <thead style={{ background:'var(--bs-tertiary-bg)' }}>
                        <tr>
                          <th style={th}>Date & Time</th>
                          <th style={th}>Action</th>
                          <th style={th}>Amount</th>
                          <th style={th}>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {niyyatLog.map(log => (
                          <tr key={log.id}>
                            <td style={{ color:'var(--bs-secondary-color)' }}>{fmtDateTime(log.created_at)}</td>
                            <td>
                              <span className={`badge ${log.action==='entered'?'bg-success':'bg-warning text-dark'}`} style={{ fontSize:10 }}>
                                {log.action==='entered'?'First Entry':'Revised'}
                              </span>
                            </td>
                            <td style={{ fontWeight:600, color:'#364574' }}>{fmtAmount(log.niyyat_amount)}</td>
                            <td style={{ color:'var(--bs-secondary-color)' }}>{log.remarks||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Niyyat form */}
                <p style={sectionLabel}>{currentTakhmeem ? 'Revise Niyyat' : 'Enter Niyyat'}</p>
                {niyyatError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize:13 }}>{niyyatError}</div>}
                <div className="row g-3">
                  <div className="col-md-5">
                    <label style={labelStyle}>Niyyat Amount (Rs.) *</label>
                    <input type="number" className="form-control form-control-sm" placeholder="e.g. 50000"
                      value={niyyatForm.niyyat_amount}
                      onChange={e => setNiyyatForm(p=>({...p, niyyat_amount:e.target.value}))} />
                  </div>
                  <div className="col-12">
                    <label style={labelStyle}>Remarks</label>
                    <textarea className="form-control form-control-sm" rows={2} value={niyyatForm.remarks}
                      onChange={e => setNiyyatForm(p=>({...p, remarks:e.target.value}))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop:'1px solid var(--bs-border-color)' }}>
                <button className="btn btn-light btn-sm" onClick={() => setShowNiyyatModal(false)}>Cancel</button>
                <button className="btn btn-success btn-sm" onClick={handleSaveNiyyat} disabled={saving}>
                  {saving ? 'Saving...' : currentTakhmeem ? 'Revise Niyyat' : 'Save Niyyat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── APPROVAL MODAL ── */}
      {showApprovalModal && approvingItem && (
        <div className="modal show d-block" style={{ background:'rgba(0,0,0,0.5)', zIndex:1055 }}>
          <div className="modal-dialog modal-lg" style={{ marginTop:60 }}>
            <div className="modal-content" style={{ background:'var(--bs-body-bg)', border:'none', borderRadius:12 }}>
              <div className="modal-header" style={{ borderBottom:'1px solid var(--bs-border-color)' }}>
                <div>
                  <h5 className="modal-title fw-bold mb-0" style={{ color:'var(--bs-body-color)' }}>Review & Approve</h5>
                  <small style={{ color:'var(--bs-secondary-color)' }}>
                    SF# {(approvingItem.mumineen as any)?.sf_no} — {(approvingItem.mumineen as any)?.full_name}
                  </small>
                </div>
                <button className="btn-close" onClick={() => setShowApprovalModal(false)} />
              </div>
              <div className="modal-body" style={{ overflowY:'auto', maxHeight:'70vh' }}>

                {/* Mumin info + niyyat amount hero */}
                <div className="row g-3 mb-3">
                  <div className="col-md-8">
                    <div className="p-3 rounded h-100" style={{ background:'var(--bs-secondary-bg)', border:'1px solid var(--bs-border-color)' }}>
                      <div className="row g-2">
                        <div className="col-4"><div style={metaLabel}>SF#</div><div style={{ ...metaValue, color:'#364574', fontWeight:700 }}>{(approvingItem.mumineen as any)?.sf_no||'—'}</div></div>
                        <div className="col-4"><div style={metaLabel}>ITS#</div><div style={metaValue}>{(approvingItem.mumineen as any)?.its_no||'—'}</div></div>
                        <div className="col-4"><div style={metaLabel}>Sector</div><div style={metaValue}>{(approvingItem.mumineen as any)?.house_sectors?.name||'—'}</div></div>
                        <div className="col-6"><div style={metaLabel}>WhatsApp</div><div style={metaValue}>{(approvingItem.mumineen as any)?.whatsapp_no||'—'}</div></div>
                        <div className="col-12"><div style={metaLabel}>Address</div><div style={{ ...metaValue, fontSize:12 }}>{(approvingItem.mumineen as any)?.full_address||'—'}</div></div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="p-3 rounded h-100 text-center d-flex flex-column justify-content-center" style={{ background:'#364574', border:'1px solid #364574' }}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Niyyat Amount</div>
                      <div style={{ fontSize:26, fontWeight:800, color:'#ffbf69' }}>{fmtAmount(approvingItem.niyyat_amount)}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:4 }}>{fyLabel}</div>
                    </div>
                  </div>
                </div>

                {/* Niyyat log */}
                {approvalNiyyatLog.length > 0 && (
                  <div className="mb-3">
                    <p style={sectionLabel}>Niyyat History / Log</p>
                    <table className="table table-sm" style={{ fontSize:12 }}>
                      <thead style={{ background:'var(--bs-tertiary-bg)' }}>
                        <tr>
                          <th style={th}>Date & Time</th>
                          <th style={th}>Action</th>
                          <th style={th}>Amount</th>
                          <th style={th}>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvalNiyyatLog.map(log => (
                          <tr key={log.id}>
                            <td style={{ color:'var(--bs-secondary-color)' }}>{fmtDateTime(log.created_at)}</td>
                            <td>
                              <span className={`badge ${log.action==='entered'?'bg-success':log.action==='approved_edit'?'bg-info text-dark':'bg-warning text-dark'}`} style={{ fontSize:10 }}>
                                {log.action==='entered'?'First Entry':log.action==='approved_edit'?'Admin Edit':'Revised'}
                              </span>
                            </td>
                            <td style={{ fontWeight:600, color:'#364574' }}>{fmtAmount(log.niyyat_amount)}</td>
                            <td style={{ color:'var(--bs-secondary-color)' }}>{log.remarks||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Edit niyyat (admin can revise before approving) */}
                <div className="p-3 mb-3 rounded" style={{ border:'1px solid var(--bs-border-color)', background:'var(--bs-tertiary-bg)' }}>
                  <p style={{ ...sectionLabel, marginBottom:10 }}>Edit Niyyat <span style={{ textTransform:'none', fontWeight:400, fontSize:11 }}>(creates a log entry)</span></p>
                  <div className="row g-2 align-items-end">
                    <div className="col-5">
                      <label style={labelStyle}>Niyyat Amount (Rs.)</label>
                      <input type="number" className="form-control form-control-sm"
                        value={approvalForm.niyyat_amount}
                        onChange={e => setApprovalForm(p=>({...p, niyyat_amount:e.target.value}))} />
                    </div>
                    <div className="col-5">
                      <label style={labelStyle}>Remarks</label>
                      <input className="form-control form-control-sm"
                        value={approvalForm.remarks}
                        onChange={e => setApprovalForm(p=>({...p, remarks:e.target.value}))} />
                    </div>
                    <div className="col-2">
                      <button className="btn btn-outline-primary btn-sm w-100" onClick={handleSaveNiyyatEdit} disabled={saving}>Save</button>
                    </div>
                  </div>
                </div>

                {/* Final approval */}
                <p style={sectionLabel}>Final Approval</p>
                {approvalError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize:13 }}>{approvalError}</div>}
                <div className="row g-3">
                  <div className="col-md-5">
                    <label style={labelStyle}>Approved Amount (Rs.) *</label>
                    <input type="number" className="form-control form-control-sm" placeholder="Final approved amount"
                      value={approvalForm.approved_amount}
                      onChange={e => setApprovalForm(p=>({...p, approved_amount:e.target.value}))} />
                    <small style={{ color:'var(--bs-secondary-color)', fontSize:11 }}>May differ from niyyat amount</small>
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Approval Date</label>
                    <input type="date" className="form-control form-control-sm"
                      value={approvalForm.approved_at}
                      onChange={e => setApprovalForm(p=>({...p, approved_at:e.target.value}))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop:'1px solid var(--bs-border-color)' }}>
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