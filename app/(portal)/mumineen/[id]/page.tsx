'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Mumin {
  id: number; sf_no: string; its_no: string; full_name: string
  phone_no: string; whatsapp_no: string; email: string; dob: string
  status: string; address_sector_id: number | null; address_block_id: number | null
  address_type_id: number | null; address_category: string; address_number: string
  address_floor: string; full_address: string; niyyat_status_id: number | null
  mumin_category_id: number | null; total_adult: number; total_child: number
  total_infant: number; remarks: string; is_hof: boolean; hof_id: number | null
}

interface ThaaliReg {
  thaali_number: number | null
  distributor_name: string | null
}

interface Sector        { id: number; name: string }
interface HouseBlock    { id: number; name: string }
interface HouseType     { id: number; name: string }
interface NiyyatStatus  { id: number; name: string }
interface MuminCategory { id: number; name: string; colour: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: '+92',  label: '🇵🇰 +92'  }, { code: '+971', label: '🇦🇪 +971' },
  { code: '+966', label: '🇸🇦 +966' }, { code: '+1',   label: '🇺🇸 +1'   },
  { code: '+44',  label: '🇬🇧 +44'  }, { code: '+61',  label: '🇦🇺 +61'  },
  { code: '+91',  label: '🇮🇳 +91'  }, { code: '+974', label: '🇶🇦 +974' },
]

const parsePhone = (val: string) => {
  if (!val) return { cc: '+92', num: '' }
  for (const c of COUNTRY_CODES) {
    if (val.startsWith(c.code)) return { cc: c.code, num: val.slice(c.code.length) }
  }
  return { cc: '+92', num: val.replace(/^\+/, '') }
}

const classifyAge = (dob: string): 'adult' | 'child' | 'infant' | null => {
  if (!dob) return null
  const birth = new Date(dob), now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  if (age < 0) return null
  if (age <= 3) return 'infant'
  if (age <= 14) return 'child'
  return 'adult'
}

const calcAge = (dob: string): string => {
  if (!dob) return '—'
  const d = new Date(dob), now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
  if (age < 0) return '—'
  const group = classifyAge(dob)
  return `${age}y ${group ? `(${group.charAt(0).toUpperCase() + group.slice(1)})` : ''}`
}

const buildAddress = (typeName: string, num: string, cat: string, floor: string, blockName: string, sectorName: string) => {
  const parts: string[] = []
  const unit = `${typeName ? typeName + ' ' : ''}${num}${cat}`.trim()
  if (unit) parts.push(unit)
  if (floor) {
    const lbl = FLOOR_OPTIONS.find(f => f.value === floor)?.label || `${floor} Floor`
    parts.push(lbl)
  }
  if (blockName) parts.push(`Block ${blockName}`)
  if (sectorName) parts.push(sectorName)
  return parts.join(', ')
}

const AGE_COLORS: Record<string, string> = { adult: '#0ab39c', child: '#299cdb', infant: '#f06548' }

const toTitleCase = (val: string) => val.replace(/(^|\s)\S/g, c => c.toUpperCase())

const FLOOR_OPTIONS = [
  { value: '0', label: 'Ground Floor' },
  ...Array.from({ length: 20 }, (_, i) => {
    const n = i + 1
    const s = ['th','st','nd','rd']
    const v = n % 100
    const suffix = s[(v-20)%10] || s[v] || s[0]
    return { value: String(n), label: `${n}${suffix} Floor` }
  })
]

const getNiyyatColor = (name: string) => {
  const n = name.toLowerCase()
  if (n.includes('approved'))                       return { bg: '#0ab39c20', color: '#0ab39c' }
  if (n.includes('no-show') || n.includes('no show')) return { bg: '#e6394620', color: '#e63946' }
  if (n.includes('pending'))                        return { bg: '#ffbf6920', color: '#856404' }
  return { bg: '#36457420', color: '#364574' }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const Modal = ({ children, onClose, size = '' }: { children: React.ReactNode; onClose: () => void; size?: string }) => (
  <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }} onClick={onClose}>
    <div className={`modal-dialog ${size}`} style={{ marginTop: 60 }} onClick={e => e.stopPropagation()}>
      <div className="modal-content" style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: 'none', borderRadius: 12 }}>
        {children}
      </div>
    </div>
  </div>
)

const PhoneInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => {
  const { cc, num } = parsePhone(value)
  return (
    <div className="input-group input-group-sm">
      <select className="form-select form-select-sm" value={cc} style={{ maxWidth: 110, fontSize: 12 }}
        onChange={e => onChange(e.target.value + num)}>
        {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>
      <input type="tel" className="form-control form-control-sm" placeholder={placeholder || '3001234567'} value={num}
        onChange={e => onChange(cc + e.target.value.replace(/\D/g, ''))} />
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: 4 }
const sectionLabel: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: 'var(--bs-secondary-color)', marginBottom: 8 }
const metaLabel: React.CSSProperties  = { fontSize: 11, color: 'var(--bs-secondary-color)', marginBottom: 2 }
const metaValue: React.CSSProperties  = { fontSize: 14, fontWeight: 500, color: 'var(--bs-body-color)' }

// ── Main component ─────────────────────────────────────────────────────────────

export default function MuminDetailPage() {
  const { id } = useParams()
  const router  = useRouter()

  const [hof, setHof]                       = useState<Mumin | null>(null)
  const [family, setFamily]                 = useState<Mumin[]>([])
  const [thaaliReg, setThaaliReg]           = useState<ThaaliReg | null>(null)
  const [sectors, setSectors]               = useState<Sector[]>([])
  const [blocks, setBlocks]                 = useState<HouseBlock[]>([])
  const [houseTypes, setHouseTypes]         = useState<HouseType[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [categories, setCategories]         = useState<MuminCategory[]>([])
  const [loading, setLoading]               = useState(true)

  // HOF edit modal
  const [showHofModal, setShowHofModal]     = useState(false)
  const [hofSaving, setHofSaving]           = useState(false)
  const [hofSaveError, setHofSaveError]     = useState('')

  const emptyHofForm = {
    sf_no: '', its_no: '', full_name: '', dob: '', email: '', remarks: '',
    phone_cc: '+92', phone_num: '', wa_cc: '+92', wa_num: '',
    address_type_id: '' as string|number, address_block_id: '' as string|number,
    address_sector_id: '' as string|number, address_number: '', address_category: '',
    address_floor: '', mumin_category_id: '' as string|number,
    niyyat_status_id: '' as string|number, status: 'active',
    total_adult: 0 as number, total_child: 0 as number, total_infant: 0 as number,
  }
  const [hofForm, setHofForm] = useState(emptyHofForm)
  const hf = (k: string, v: any) => setHofForm(p => ({ ...p, [k]: v }))

  // Family member modal
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [memberSaving, setMemberSaving]       = useState(false)
  const [memberSaveError, setMemberSaveError] = useState('')
  const [editingMember, setEditingMember]     = useState<Mumin | null>(null)

  const emptyMemberForm = { its_no: '', full_name: '', dob: '', phone_cc: '+92', phone_num: '', wa_cc: '+92', wa_num: '' }
  const [memberForm, setMemberForm] = useState(emptyMemberForm)
  const mf = (k: string, v: any) => setMemberForm(p => ({ ...p, [k]: v }))

  const [showDeleteMember, setShowDeleteMember] = useState<Mumin | null>(null)
  const [deletingMember, setDeletingMember]     = useState(false)

  useEffect(() => { fetchAll() }, [id])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true)
    const [hofRes, familyRes, sRes, bRes, tRes, nRes, cRes] = await Promise.all([
      supabase.from('mumineen').select('*').eq('id', id).single(),
      supabase.from('mumineen').select('*').eq('hof_id', id).order('full_name'),
      supabase.from('house_sectors').select('id,name').order('name'),
      supabase.from('house_blocks').select('id,name').order('name'),
      supabase.from('house_types').select('id,name').order('name'),
      supabase.from('niyyat_statuses').select('id,name').order('name'),
      supabase.from('mumin_categories').select('id,name,colour').order('name'),
    ])
    setHof(hofRes.data)
    setFamily(familyRes.data || [])
    setSectors(sRes.data || [])
    setBlocks(bRes.data || [])
    setHouseTypes(tRes.data || [])
    setNiyyatStatuses(nRes.data || [])
    setCategories(cRes.data || [])

    // Fetch thaali registration — separate two-step (avoids FK ambiguity)
    if (hofRes.data?.id) {
      const { data: reg } = await supabase
        .from('thaali_registrations')
        .select('thaali_id, distributor_id')
        .eq('mumin_id', hofRes.data.id)
        .maybeSingle()

      if (reg) {
        const [thaaliRes, distRes] = await Promise.all([
          reg.thaali_id
            ? supabase.from('thaalis').select('thaali_number').eq('id', reg.thaali_id).single()
            : Promise.resolve({ data: null }),
          reg.distributor_id
            ? supabase.from('distributors').select('full_name').eq('id', reg.distributor_id).single()
            : Promise.resolve({ data: null }),
        ])
        setThaaliReg({
          thaali_number: thaaliRes.data?.thaali_number ?? null,
          distributor_name: distRes.data?.full_name ?? null,
        })
      } else {
        setThaaliReg(null)
      }
    }

    setLoading(false)
  }

  const getSector  = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getBlock   = (id: number | null) => blocks.find(b => b.id === id)?.name || ''
  const getType    = (id: number | null) => houseTypes.find(t => t.id === id)?.name || ''
  const getNiyyat  = (id: number | null) => niyyatStatuses.find(n => n.id === id)?.name || '—'
  const getCat     = (id: number | null) => categories.find(c => c.id === id)

  // ── Recalc totals ──────────────────────────────────────────────────────────

  const recalcTotals = async (members: Mumin[]) => {
    let adult = 0, child = 0, infant = 0
    members.forEach(m => {
      const g = classifyAge(m.dob || '')
      if (g === 'adult') adult++
      else if (g === 'child') child++
      else if (g === 'infant') infant++
    })
    await supabase.from('mumineen').update({ total_adult: adult, total_child: child, total_infant: infant }).eq('id', Number(id))
  }

  // ── HOF modal ──────────────────────────────────────────────────────────────

  const openHofModal = () => {
    if (!hof) return
    const ph = parsePhone(hof.phone_no || '')
    const wa = parsePhone(hof.whatsapp_no || '')
    setHofForm({
      sf_no: hof.sf_no || '', its_no: hof.its_no || '', full_name: hof.full_name || '',
      dob: hof.dob || '', email: hof.email || '', remarks: hof.remarks || '',
      phone_cc: ph.cc, phone_num: ph.num, wa_cc: wa.cc, wa_num: wa.num,
      address_type_id: hof.address_type_id || '',
      address_block_id: hof.address_block_id || '',
      address_sector_id: hof.address_sector_id || '',
      address_number: hof.address_number || '',
      address_category: hof.address_category || '',
      address_floor: hof.address_floor || '',
      mumin_category_id: hof.mumin_category_id || '',
      niyyat_status_id: hof.niyyat_status_id || '',
      status: hof.status || 'active',
      total_adult: hof.total_adult || 0,
      total_child: hof.total_child || 0,
      total_infant: hof.total_infant || 0,
    })
    setHofSaveError(''); setShowHofModal(true)
  }

  const hofAddrPreview = buildAddress(
    getType(Number(hofForm.address_type_id) || null),
    hofForm.address_number, hofForm.address_category, hofForm.address_floor,
    getBlock(Number(hofForm.address_block_id) || null),
    getSector(Number(hofForm.address_sector_id) || null) === '—' ? '' : getSector(Number(hofForm.address_sector_id) || null)
  )

  const handleSaveHof = async () => {
    if (!hofForm.full_name.trim()) { setHofSaveError('Full Name is required.'); return }
    setHofSaving(true); setHofSaveError('')
    const payload: any = {
      sf_no: hofForm.sf_no.trim() || null, its_no: hofForm.its_no.trim() || null,
      full_name: hofForm.full_name.trim(), dob: hofForm.dob || null,
      email: hofForm.email.trim() || null, remarks: hofForm.remarks.trim() || null,
      phone_no: hofForm.phone_num ? hofForm.phone_cc + hofForm.phone_num : null,
      whatsapp_no: hofForm.wa_num ? hofForm.wa_cc + hofForm.wa_num : null,
      address_type_id: hofForm.address_type_id || null,
      address_block_id: hofForm.address_block_id || null,
      address_sector_id: hofForm.address_sector_id || null,
      address_number: hofForm.address_number || null,
      address_category: hofForm.address_category || null,
      address_floor: hofForm.address_floor || null,
      full_address: hofAddrPreview || null,
      mumin_category_id: hofForm.mumin_category_id || null,
      niyyat_status_id: hofForm.niyyat_status_id || null,
      status: hofForm.status,
      total_adult: Number(hofForm.total_adult) || 0,
      total_child: Number(hofForm.total_child) || 0,
      total_infant: Number(hofForm.total_infant) || 0,
    }
    const { error } = await supabase.from('mumineen').update(payload).eq('id', hof!.id)
    if (error) { setHofSaveError(error.message); setHofSaving(false); return }
    await fetchAll(); setShowHofModal(false); setHofSaving(false)
  }

  // ── Family member modal ────────────────────────────────────────────────────

  const openAddMember = () => {
    setEditingMember(null); setMemberForm(emptyMemberForm); setMemberSaveError(''); setShowMemberModal(true)
  }

  const openEditMember = (m: Mumin) => {
    setEditingMember(m)
    const ph = parsePhone(m.phone_no || '')
    const wa = parsePhone(m.whatsapp_no || '')
    setMemberForm({ its_no: m.its_no || '', full_name: m.full_name || '', dob: m.dob || '', phone_cc: ph.cc, phone_num: ph.num, wa_cc: wa.cc, wa_num: wa.num })
    setMemberSaveError(''); setShowMemberModal(true)
  }

  const handleSaveMember = async () => {
    if (!memberForm.full_name.trim()) { setMemberSaveError('Full Name is required.'); return }
    if (!memberForm.its_no.trim())    { setMemberSaveError('ITS# is required.'); return }
    setMemberSaving(true); setMemberSaveError('')
    const payload = {
      its_no: memberForm.its_no.trim() || null,
      full_name: memberForm.full_name.trim(),
      sf_no: hof?.sf_no || null,
      dob: memberForm.dob || null,
      phone_no: memberForm.phone_num ? memberForm.phone_cc + memberForm.phone_num : null,
      whatsapp_no: memberForm.wa_num ? memberForm.wa_cc + memberForm.wa_num : null,
      hof_id: Number(id), is_hof: false, status: 'active',
    }
    const res = editingMember
      ? await supabase.from('mumineen').update(payload).eq('id', editingMember.id)
      : await supabase.from('mumineen').insert(payload)
    if (res.error) { setMemberSaveError(res.error.message); setMemberSaving(false); return }
    const { data: updatedFamily } = await supabase.from('mumineen').select('*').eq('hof_id', id)
    if (updatedFamily && updatedFamily.some((m: any) => m.dob)) await recalcTotals(updatedFamily as Mumin[])
    await fetchAll(); setShowMemberModal(false); setMemberSaving(false)
  }

  const handleDeleteMember = async () => {
    if (!showDeleteMember) return
    setDeletingMember(true)
    await supabase.from('mumineen').delete().eq('id', showDeleteMember.id)
    const { data: updatedFamily } = await supabase.from('mumineen').select('*').eq('hof_id', id)
    await recalcTotals((updatedFamily || []) as Mumin[])
    await fetchAll(); setShowDeleteMember(null); setDeletingMember(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
  if (!hof)    return <div className="alert alert-danger">Mumin not found.</div>

  const category   = getCat(hof.mumin_category_id)
  const niyyatName = getNiyyat(hof.niyyat_status_id)
  const nc         = getNiyyatColor(niyyatName)

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center gap-3 mb-4">
        <button className="btn btn-light btn-sm" onClick={() => router.push('/mumineen')}>
          <i className="bi bi-arrow-left me-1" />Back
        </button>
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>{hof.full_name}</h4>
          <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
            SF# {hof.sf_no} · Head of Family
            {hof.status !== 'active' && (
              <span className="badge ms-2 bg-secondary bg-opacity-10" style={{ color: '#6c757d', fontSize: 11 }}>{hof.status}</span>
            )}
          </p>
        </div>
        <button className="btn btn-outline-primary btn-sm ms-auto" onClick={openHofModal}>
          <i className="bi bi-pencil me-1" />Edit HOF
        </button>
      </div>

      {/* HOF Info Card */}
      <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 10 }}>
        <div className="card-body">
          <p style={sectionLabel}>Personal Information</p>
          <div className="row g-3 mb-3">
            {[
              { label: 'SF#',           value: hof.sf_no },
              { label: 'ITS#',          value: hof.its_no },
              { label: 'Phone',         value: hof.phone_no },
              { label: 'WhatsApp',      value: hof.whatsapp_no },
              { label: 'Email',         value: hof.email },
              { label: 'Date of Birth', value: hof.dob ? `${hof.dob} · ${calcAge(hof.dob)}` : null },
            ].map(({ label, value }) => (
              <div key={label} className="col-md-3 col-6">
                <div style={metaLabel}>{label}</div>
                <div style={metaValue}>{value || '—'}</div>
              </div>
            ))}
            <div className="col-md-3 col-6">
              <div style={metaLabel}>Niyyat Status</div>
              <span className="badge" style={{ background: nc.bg, color: nc.color, fontWeight: 600, fontSize: 12 }}>{niyyatName}</span>
            </div>
            <div className="col-md-3 col-6">
              <div style={metaLabel}>Category</div>
              {category
                ? <span className="badge" style={{ background: category.colour+'22', color: category.colour, border: `1px solid ${category.colour}44`, fontWeight: 600, fontSize: 12, padding: '4px 10px' }}>{category.name}</span>
                : <div style={metaValue}>—</div>}
            </div>
            {hof.remarks && (
              <div className="col-12">
                <div style={metaLabel}>Remarks</div>
                <div style={{ ...metaValue, fontSize: 13 }}>{hof.remarks}</div>
              </div>
            )}
          </div>

          <p style={sectionLabel}>Address</p>
          <div className="row g-3 mb-3">
            <div className="col-md-6 col-12">
              <div style={metaLabel}>Full Address</div>
              <div style={metaValue}>{hof.full_address || '—'}</div>
            </div>
            <div className="col-md-3 col-6">
              <div style={metaLabel}>Sector</div>
              <div style={metaValue}>{getSector(hof.address_sector_id)}</div>
            </div>
            <div className="col-md-3 col-6">
              <div style={metaLabel}>Block</div>
              <div style={metaValue}>{getBlock(hof.address_block_id) || '—'}</div>
            </div>
          </div>

          {/* Thaali Registration */}
          <p style={sectionLabel}>Thaali Registration</p>
          <div className="row g-3 mb-3">
            <div className="col-md-3 col-6">
              <div style={metaLabel}>Thaali Number</div>
              {thaaliReg
                ? thaaliReg.thaali_number
                  ? <span className="badge" style={{ background: '#364574', color: '#fff', fontSize: 13, padding: '5px 12px', letterSpacing: 0.5 }}>
                      #{thaaliReg.thaali_number}
                    </span>
                  : <span className="badge" style={{ background: '#fff3cd', color: '#856404', fontSize: 12 }}>Registered — No Number</span>
                : <span style={{ ...metaValue, color: 'var(--bs-secondary-color)', fontSize: 13 }}>Not registered</span>
              }
            </div>
            <div className="col-md-3 col-6">
              <div style={metaLabel}>Distributor</div>
              <div style={metaValue}>{thaaliReg?.distributor_name || '—'}</div>
            </div>
          </div>

          <hr className="my-3" style={{ borderColor: 'var(--bs-border-color)' }} />
          <div className="d-flex gap-4 flex-wrap">
            {[
              { label: 'Adults',         value: hof.total_adult  || 0, color: '#0ab39c' },
              { label: 'Children',       value: hof.total_child  || 0, color: '#299cdb' },
              { label: 'Infants',        value: hof.total_infant || 0, color: '#f06548' },
              { label: 'Family Members', value: family.length,         color: '#364574' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Family Members Card */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 10 }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Family Members</h6>
            <button className="btn btn-sm" style={{ background: '#364574', color: '#fff' }} onClick={openAddMember}>
              <i className="bi bi-plus me-1" />Add Member
            </button>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                <tr>
                  {['#','ITS#','Full Name','Age','Phone','WhatsApp','Age Group',''].map(h => (
                    <th key={h} style={{ fontSize: 12, color: 'var(--bs-secondary-color)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {family.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>No family members added yet</td></tr>
                ) : family.map((m, i) => {
                  const ageGroup = classifyAge(m.dob || '')
                  return (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--bs-secondary-color)' }}>{i+1}</td>
                      <td style={{ color: 'var(--bs-secondary-color)' }}>{m.its_no || '—'}</td>
                      <td style={{ fontWeight: 500, color: 'var(--bs-body-color)' }}>{m.full_name}</td>
                      <td style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>{calcAge(m.dob)}</td>
                      <td style={{ color: 'var(--bs-secondary-color)' }}>{m.phone_no || '—'}</td>
                      <td style={{ color: 'var(--bs-secondary-color)' }}>{m.whatsapp_no || '—'}</td>
                      <td>
                        {ageGroup
                          ? <span className="badge" style={{ background: AGE_COLORS[ageGroup]+'22', color: AGE_COLORS[ageGroup], border: `1px solid ${AGE_COLORS[ageGroup]}44`, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{ageGroup}</span>
                          : '—'}
                      </td>
                      <td>
                        <div className="d-flex gap-1 justify-content-end">
                          <button className="btn btn-sm" title="Edit" style={{ padding: '2px 7px', color: '#364574' }} onClick={() => openEditMember(m)}><i className="bi bi-pencil" /></button>
                          <button className="btn btn-sm" title="Delete" style={{ padding: '2px 7px', color: '#dc3545' }} onClick={() => setShowDeleteMember(m)}><i className="bi bi-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Edit HOF Modal ── */}
      {showHofModal && (
        <Modal onClose={() => setShowHofModal(false)} size="modal-lg">
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
            <h5 className="modal-title fw-bold" style={{ color: 'var(--bs-body-color)' }}>Edit Head of Family</h5>
            <button className="btn-close" onClick={() => setShowHofModal(false)} />
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {hofSaveError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{hofSaveError}</div>}

            <p style={sectionLabel}>Personal Information</p>
            <div className="row g-3 mb-4">
              <div className="col-6">
                <label style={labelStyle}>SF# <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--bs-secondary-color)' }}>(family number)</span></label>
                <input className="form-control form-control-sm" value={hofForm.sf_no} onChange={e => hf('sf_no', e.target.value)} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>ITS# *</label>
                <input className="form-control form-control-sm" value={hofForm.its_no} onChange={e => hf('its_no', e.target.value)} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Full Name *</label>
                <input className="form-control form-control-sm" value={hofForm.full_name} onChange={e => hf('full_name', toTitleCase(e.target.value))} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Date of Birth</label>
                <input type="date" className="form-control form-control-sm" value={hofForm.dob} onChange={e => hf('dob', e.target.value)} />
                {hofForm.dob && <small style={{ color: 'var(--bs-secondary-color)', fontSize: 11 }}>{calcAge(hofForm.dob)}</small>}
              </div>
              <div className="col-6">
                <label style={labelStyle}>Phone No</label>
                <PhoneInput value={hofForm.phone_cc + hofForm.phone_num} onChange={v => { const p = parsePhone(v); hf('phone_cc', p.cc); hf('phone_num', p.num) }} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>WhatsApp No</label>
                <PhoneInput value={hofForm.wa_cc + hofForm.wa_num} onChange={v => { const p = parsePhone(v); hf('wa_cc', p.cc); hf('wa_num', p.num) }} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Email</label>
                <input type="email" className="form-control form-control-sm" value={hofForm.email} onChange={e => hf('email', e.target.value)} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Niyyat Status</label>
                <select className="form-select form-select-sm" value={hofForm.niyyat_status_id} onChange={e => hf('niyyat_status_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {niyyatStatuses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label style={labelStyle}>Mumin Category</label>
                <select className="form-select form-select-sm" value={hofForm.mumin_category_id} onChange={e => hf('mumin_category_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label style={labelStyle}>Status</label>
                <select className="form-select form-select-sm" value={hofForm.status} onChange={e => hf('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="transferred">Transferred</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="col-12">
                <label style={labelStyle}>Remarks</label>
                <textarea className="form-control form-control-sm" rows={2} value={hofForm.remarks} onChange={e => hf('remarks', e.target.value)} />
              </div>
            </div>

            <p style={sectionLabel}>Address</p>
            <div className="row g-3 mb-4">
              <div className="col-4">
                <label style={labelStyle}>House Type</label>
                <select className="form-select form-select-sm" value={hofForm.address_type_id} onChange={e => hf('address_type_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {houseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label style={labelStyle}>Number</label>
                <input className="form-control form-control-sm" placeholder="e.g. 4" value={hofForm.address_number} onChange={e => hf('address_number', e.target.value)} />
              </div>
              <div className="col-4">
                <label style={labelStyle}>Category (A–Z)</label>
                <input className="form-control form-control-sm" placeholder="e.g. A or 2" value={hofForm.address_category} onChange={e => hf('address_category', e.target.value)} maxLength={5} />
              </div>
              <div className="col-4">
                <label style={labelStyle}>Floor</label>
                <select className="form-select form-select-sm" value={hofForm.address_floor} onChange={e => hf('address_floor', e.target.value)}>
                  <option value="">— Select —</option>
                  {FLOOR_OPTIONS.map(fl => <option key={fl.value} value={fl.value}>{fl.label}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label style={labelStyle}>Block</label>
                <select className="form-select form-select-sm" value={hofForm.address_block_id} onChange={e => hf('address_block_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label style={labelStyle}>Sector</label>
                <select className="form-select form-select-sm" value={hofForm.address_sector_id} onChange={e => hf('address_sector_id', e.target.value)}>
                  <option value="">— Select Sector —</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label style={labelStyle}>Full Address Preview</label>
                <div style={{ background: 'var(--bs-secondary-bg)', borderRadius: 6, padding: '8px 12px', fontSize: 13, borderLeft: `3px solid ${hofAddrPreview ? '#ffbf69' : 'var(--bs-border-color)'}`, minHeight: 36, color: hofAddrPreview ? '#364574' : 'var(--bs-secondary-color)' }}>
                  {hofAddrPreview || (hof.full_address
                    ? <><span style={{ color: 'var(--bs-body-color)' }}>{hof.full_address}</span> <span style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>(fill fields above to update)</span></>
                    : 'Fill in the fields above to preview…')}
                </div>
              </div>
            </div>

            <p style={sectionLabel}>
              Family Count <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(auto-updated when members have DOB)</span>
            </p>
            <div className="row g-3">
              <div className="col-4">
                <label style={labelStyle}>Adults</label>
                <input type="number" min={0} className="form-control form-control-sm" value={hofForm.total_adult} onChange={e => hf('total_adult', e.target.value)} />
              </div>
              <div className="col-4">
                <label style={labelStyle}>Children</label>
                <input type="number" min={0} className="form-control form-control-sm" value={hofForm.total_child} onChange={e => hf('total_child', e.target.value)} />
              </div>
              <div className="col-4">
                <label style={labelStyle}>Infants</label>
                <input type="number" min={0} className="form-control form-control-sm" value={hofForm.total_infant} onChange={e => hf('total_infant', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
            <button className="btn btn-light btn-sm" onClick={() => setShowHofModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: '#364574', color: '#fff' }} onClick={handleSaveHof} disabled={hofSaving}>
              {hofSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Family Member Modal ── */}
      {showMemberModal && (
        <Modal onClose={() => setShowMemberModal(false)}>
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
            <div>
              <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>{editingMember ? 'Edit Member' : 'Add Family Member'}</h5>
              <small style={{ color: 'var(--bs-secondary-color)' }}>HOF: {hof.full_name} · SF# {hof.sf_no}</small>
            </div>
            <button className="btn-close" onClick={() => setShowMemberModal(false)} />
          </div>
          <div className="modal-body">
            {memberSaveError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{memberSaveError}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label style={labelStyle}>ITS# *</label>
                <input className="form-control form-control-sm" placeholder="e.g. 40000002" value={memberForm.its_no} onChange={e => mf('its_no', e.target.value)} />
              </div>
              <div className="col-12">
                <label style={labelStyle}>Full Name *</label>
                <input className="form-control form-control-sm" placeholder="Enter full name" value={memberForm.full_name} onChange={e => mf('full_name', toTitleCase(e.target.value))} />
              </div>
              <div className="col-12">
                <label style={labelStyle}>Date of Birth</label>
                <input type="date" className="form-control form-control-sm" value={memberForm.dob} onChange={e => mf('dob', e.target.value)} />
                {memberForm.dob && (() => {
                  const g = classifyAge(memberForm.dob)
                  return g ? (
                    <small className="d-flex align-items-center gap-1 mt-1">
                      <span className="badge" style={{ background: AGE_COLORS[g]+'22', color: AGE_COLORS[g], border: `1px solid ${AGE_COLORS[g]}44`, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{g}</span>
                      <span style={{ color: 'var(--bs-secondary-color)', fontSize: 11 }}>{calcAge(memberForm.dob)}</span>
                    </small>
                  ) : null
                })()}
              </div>
              <div className="col-6">
                <label style={labelStyle}>Phone No</label>
                <PhoneInput value={memberForm.phone_cc + memberForm.phone_num} onChange={v => { const p = parsePhone(v); mf('phone_cc', p.cc); mf('phone_num', p.num) }} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>WhatsApp No</label>
                <PhoneInput value={memberForm.wa_cc + memberForm.wa_num} onChange={v => { const p = parsePhone(v); mf('wa_cc', p.cc); mf('wa_num', p.num) }} />
              </div>
              <div className="col-12">
                <div className="p-2" style={{ background: 'var(--bs-info-bg-subtle)', borderRadius: 8, fontSize: 12, color: 'var(--bs-info-text-emphasis)' }}>
                  <i className="bi bi-info-circle me-1" />SF# will be inherited from HOF: <strong>{hof.sf_no}</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
            <button className="btn btn-light btn-sm" onClick={() => setShowMemberModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: '#364574', color: '#fff' }} onClick={handleSaveMember} disabled={memberSaving}>
              {memberSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete Member Modal ── */}
      {showDeleteMember && (
        <Modal onClose={() => setShowDeleteMember(null)} size="modal-sm">
          <div className="modal-header border-0 pb-0">
            <h6 className="modal-title fw-bold text-danger"><i className="bi bi-exclamation-triangle me-2" />Delete Member</h6>
            <button className="btn-close" onClick={() => setShowDeleteMember(null)} />
          </div>
          <div className="modal-body" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>
            Permanently delete <strong>{showDeleteMember.full_name}</strong>? This cannot be undone.
          </div>
          <div className="modal-footer border-0 pt-0">
            <button className="btn btn-light btn-sm" onClick={() => setShowDeleteMember(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={handleDeleteMember} disabled={deletingMember}>
              {deletingMember ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}