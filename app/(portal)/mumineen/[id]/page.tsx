'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Mumin {
  id: number
  sf_no: string
  its_no: string
  full_name: string
  phone_no: string
  whatsapp_no: string
  email: string
  dob: string
  status: string
  address_sector_id: number | null
  full_address: string
  niyyat_status_id: number | null
  mumin_category_id: number | null
  total_adult: number
  total_child: number
  total_infant: number
  remarks: string
}

interface Sector { id: number; name: string }
interface NiyyatStatus { id: number; name: string }
interface MuminCategory { id: number; name: string; colour: string }

const HOUSE_TYPES = ['Flat', 'Bungalow', 'Portion']
const BLOCKS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
const FLOORS = Array.from({ length: 20 }, (_, i) => i + 1)

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' Floor'
}

const buildAddress = (houseType: string, number: string, catLetter: string, floor: string, block: string, sectorName: string): string => {
  const parts: string[] = []
  const unit = `${houseType ? houseType + ' ' : ''}${number}${catLetter}`.trim()
  if (unit) parts.push(unit)
  if (floor) parts.push(ordinal(Number(floor)))
  if (block) parts.push(`Block ${block}`)
  if (sectorName) parts.push(sectorName)
  return parts.join(', ')
}

// Classify age from DOB string
const classifyAge = (dob: string): 'adult' | 'child' | 'infant' | null => {
  if (!dob) return null
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  if (age <= 3) return 'infant'
  if (age <= 14) return 'child'
  return 'adult'
}

// Modal — uses Bootstrap's own modal show pattern (confirmed working)
const Modal = ({ children, onClose, size = '' }: { children: React.ReactNode; onClose: () => void; size?: string }) => (
  <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
    <div className={`modal-dialog ${size}`} onClick={e => e.stopPropagation()}>
      <div className="modal-content">
        {children}
      </div>
    </div>
  </div>
)

export default function MuminDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [hof, setHof] = useState<Mumin | null>(null)
  const [family, setFamily] = useState<Mumin[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [categories, setCategories] = useState<MuminCategory[]>([])
  const [loading, setLoading] = useState(true)

  // HOF Edit modal
  const [showHofModal, setShowHofModal] = useState(false)
  const [hofSaving, setHofSaving] = useState(false)
  const [hofSaveError, setHofSaveError] = useState('')

  const emptyHofForm = {
    sf_no: '', its_no: '', full_name: '', phone_no: '', whatsapp_no: '',
    email: '', dob: '', remarks: '',
    address_sector_id: '' as string | number,
    niyyat_status_id: '' as string | number,
    mumin_category_id: '' as string | number,
    status: 'active',
    house_type: '', addr_number: '', addr_cat: '', addr_floor: '', addr_block: '',
    total_adult: '' as string | number,
    total_child: '' as string | number,
    total_infant: '' as string | number,
  }
  const [hofForm, setHofForm] = useState(emptyHofForm)

  // Add/Edit family member modal
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editingMember, setEditingMember] = useState<Mumin | null>(null)
  const emptyMemberForm = { sf_no: '', its_no: '', full_name: '', phone_no: '', whatsapp_no: '', dob: '' }
  const [memberForm, setMemberForm] = useState(emptyMemberForm)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    const [hofRes, familyRes, sectorsRes, niyyatRes, catRes] = await Promise.all([
      supabase.from('mumineen').select('*').eq('id', id).single(),
      supabase.from('mumineen').select('*').eq('hof_id', id).order('full_name'),
      supabase.from('house_sectors').select('id, name').order('name'),
      supabase.from('niyyat_statuses').select('id, name').order('name'),
      supabase.from('mumin_categories').select('id, name, colour').order('name'),
    ])
    setHof(hofRes.data)
    setFamily(familyRes.data || [])
    setSectors(sectorsRes.data || [])
    setNiyyatStatuses(niyyatRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  // Recalculate HOF totals based on all family members' DOBs
  const recalcFamilyTotals = async (allMembers: { dob?: string }[]) => {
    let adult = 0, child = 0, infant = 0
    allMembers.forEach(m => {
      const cat = classifyAge((m as any).dob || '')
      if (cat === 'adult') adult++
      else if (cat === 'child') child++
      else if (cat === 'infant') infant++
    })
    await supabase.from('mumineen').update({ total_adult: adult, total_child: child, total_infant: infant }).eq('id', Number(id))
  }

  const getSectorName = (sid: number | null) => sectors.find(s => s.id === sid)?.name || '—'
  const getNiyyatName = (nid: number | null) => niyyatStatuses.find(n => n.id === nid)?.name || '—'
  const getCategory = (cid: number | null) => categories.find(c => c.id === cid) || null

  const getHofAddrPreview = () => {
    const sectorName = sectors.find(s => String(s.id) === String(hofForm.address_sector_id))?.name || ''
    return buildAddress(hofForm.house_type, hofForm.addr_number, hofForm.addr_cat, hofForm.addr_floor, hofForm.addr_block, sectorName)
  }

  const openHofModal = () => {
    if (!hof) return
    setHofForm({
      sf_no: hof.sf_no || '', its_no: hof.its_no || '', full_name: hof.full_name || '',
      phone_no: hof.phone_no || '', whatsapp_no: hof.whatsapp_no || '',
      email: hof.email || '', dob: hof.dob || '', remarks: hof.remarks || '',
      address_sector_id: hof.address_sector_id ?? '',
      niyyat_status_id: hof.niyyat_status_id ?? '',
      mumin_category_id: hof.mumin_category_id ?? '',
      status: hof.status || 'active',
      house_type: '', addr_number: '', addr_cat: '', addr_floor: '', addr_block: '',
      total_adult: hof.total_adult ?? 0,
      total_child: hof.total_child ?? 0,
      total_infant: hof.total_infant ?? 0,
    })
    setHofSaveError('')
    setShowHofModal(true)
  }

  const handleSaveHof = async () => {
    if (!hofForm.full_name.trim()) { setHofSaveError('Full Name is required.'); return }
    setHofSaving(true); setHofSaveError('')
    const addressEntered = hofForm.addr_number || hofForm.house_type || hofForm.addr_block
    const newAddress = addressEntered ? getHofAddrPreview() : undefined
    const payload: any = {
      sf_no: hofForm.sf_no.trim() || null,
      its_no: hofForm.its_no.trim() || null,
      full_name: hofForm.full_name.trim(),
      phone_no: hofForm.phone_no.trim() || null,
      whatsapp_no: hofForm.whatsapp_no.trim() || null,
      email: hofForm.email.trim() || null,
      dob: hofForm.dob || null,
      remarks: hofForm.remarks.trim() || null,
      address_sector_id: hofForm.address_sector_id !== '' ? Number(hofForm.address_sector_id) : null,
      niyyat_status_id: hofForm.niyyat_status_id !== '' ? Number(hofForm.niyyat_status_id) : null,
      mumin_category_id: hofForm.mumin_category_id !== '' ? Number(hofForm.mumin_category_id) : null,
      status: hofForm.status,
      total_adult: Number(hofForm.total_adult) || 0,
      total_child: Number(hofForm.total_child) || 0,
      total_infant: Number(hofForm.total_infant) || 0,
    }
    if (newAddress) payload.full_address = newAddress
    const { error } = await supabase.from('mumineen').update(payload).eq('id', hof!.id)
    if (error) { setHofSaveError(error.message); setHofSaving(false); return }
    await fetchAll(); setShowHofModal(false); setHofSaving(false)
  }

  const openAddMember = () => { setEditingMember(null); setMemberForm(emptyMemberForm); setSaveError(''); setShowModal(true) }
  const openEditMember = (m: Mumin) => {
    setEditingMember(m)
    setMemberForm({ sf_no: m.sf_no || '', its_no: m.its_no || '', full_name: m.full_name || '', phone_no: m.phone_no || '', whatsapp_no: m.whatsapp_no || '', dob: (m as any).dob || '' })
    setSaveError(''); setShowModal(true)
  }

  const handleSaveMember = async () => {
    if (!memberForm.full_name.trim()) { setSaveError('Full Name is required.'); return }
    setSaving(true); setSaveError('')
    const payload = {
      sf_no: memberForm.sf_no.trim() || null,
      its_no: memberForm.its_no.trim() || null,
      full_name: memberForm.full_name.trim(),
      phone_no: memberForm.phone_no.trim() || null,
      whatsapp_no: memberForm.whatsapp_no.trim() || null,
      dob: memberForm.dob || null,
      hof_id: Number(id),
      is_hof: false,
      status: 'active',
    }
    const res = editingMember
      ? await supabase.from('mumineen').update(payload).eq('id', editingMember.id)
      : await supabase.from('mumineen').insert(payload)
    if (res.error) { setSaveError(res.error.message); setSaving(false); return }

    // Fetch updated family list and recalculate totals if any member has DOB
    const { data: updatedFamily } = await supabase.from('mumineen').select('dob').eq('hof_id', id)
    if (updatedFamily && updatedFamily.some((m: any) => m.dob)) {
      await recalcFamilyTotals(updatedFamily)
    }

    await fetchAll(); setShowModal(false); setSaving(false)
  }

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
  if (!hof) return <div className="alert alert-danger">Mumin not found.</div>

  const category = getCategory(hof.mumin_category_id)
  const addrPreview = getHofAddrPreview()

  // DOB preview label for family modal
  const memberAgeLabel = memberForm.dob ? classifyAge(memberForm.dob) : null
  const ageColors: Record<string, string> = { adult: '#0ab39c', child: '#299cdb', infant: '#f06548' }

  return (
    <div>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      {/* Header */}
      <div className="d-flex align-items-center gap-3 mb-4">
        <button className="btn btn-light btn-sm" onClick={() => router.push('/mumineen')}>← Back</button>
        <div>
          <h4 className="mb-0" style={{ color: '#212529', fontWeight: 600 }}>{hof.full_name}</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>SF# {hof.sf_no} · Head of Family</p>
        </div>
        <div className="ms-auto">
          <button className="btn btn-outline-primary btn-sm" onClick={openHofModal}>Edit HOF</button>
        </div>
      </div>

      {/* HOF Info Card */}
      <div className="card mb-4" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <h6 className="text-muted mb-3" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Personal Information</h6>
          <div className="row g-3">
            {[
              { label: 'SF#', value: hof.sf_no },
              { label: 'ITS#', value: hof.its_no },
              { label: 'Phone', value: hof.phone_no },
              { label: 'WhatsApp', value: hof.whatsapp_no },
              { label: 'Email', value: hof.email },
              { label: 'Date of Birth', value: hof.dob },
              { label: 'Sector', value: getSectorName(hof.address_sector_id) },
              { label: 'Niyyat Status', value: getNiyyatName(hof.niyyat_status_id) },
              { label: 'Full Address', value: hof.full_address },
              { label: 'Remarks', value: hof.remarks },
            ].map(({ label, value }) => (
              <div key={label} className="col-md-3 col-6">
                <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#212529' }}>{value || '—'}</div>
              </div>
            ))}
            <div className="col-md-3 col-6">
              <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>Category</div>
              <div>
                {category
                  ? <span className="badge" style={{ backgroundColor: category.colour + '22', color: category.colour, border: `1px solid ${category.colour}44`, fontWeight: 600, fontSize: '12px', padding: '4px 10px' }}>{category.name}</span>
                  : <span style={{ fontSize: '14px', fontWeight: 500, color: '#212529' }}>—</span>}
              </div>
            </div>
          </div>

          {/* Stats — no Total, Family Members IS the total */}
          <hr className="my-3" />
          <div className="d-flex gap-4 flex-wrap">
            {[
              { label: 'Adults', value: hof.total_adult || 0, color: '#0ab39c' },
              { label: 'Children', value: hof.total_child || 0, color: '#299cdb' },
              { label: 'Infants', value: hof.total_infant || 0, color: '#f06548' },
              { label: 'Family Members', value: family.length, color: '#364574' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: '11px', color: '#6c757d' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Family Members Card */}
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="mb-0">Family Members</h6>
            <button className="btn btn-primary btn-sm" onClick={openAddMember}>+ Add Member</button>
          </div>
          <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
            <thead style={{ background: '#f8f9fa' }}>
              <tr>
                {['#', 'SF#', 'ITS#', 'Full Name', 'Phone', 'WhatsApp', 'Date of Birth', 'Age Group', 'Actions'].map(h => (
                  <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {family.map((m, i) => {
                const ageGroup = classifyAge((m as any).dob || '')
                return (
                  <tr key={m.id}>
                    <td style={{ color: '#6c757d' }}>{i + 1}</td>
                    <td>{m.sf_no || '—'}</td>
                    <td>{m.its_no || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{m.full_name}</td>
                    <td>{m.phone_no || '—'}</td>
                    <td>{m.whatsapp_no || '—'}</td>
                    <td>{(m as any).dob || '—'}</td>
                    <td>
                      {ageGroup
                        ? <span className="badge" style={{ backgroundColor: ageColors[ageGroup] + '22', color: ageColors[ageGroup], border: `1px solid ${ageColors[ageGroup]}44`, fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' }}>{ageGroup}</span>
                        : '—'}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }} onClick={() => openEditMember(m)}>Edit</button>
                    </td>
                  </tr>
                )
              })}
              {family.length === 0 && <tr><td colSpan={9} className="text-center text-muted py-4">No family members added yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit HOF Modal ── */}
      {showHofModal && (
        <Modal onClose={() => setShowHofModal(false)} size="modal-lg">
          <div className="modal-header">
            <h5 className="modal-title">Edit Head of Family</h5>
            <button className="btn-close" onClick={() => setShowHofModal(false)} />
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {hofSaveError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{hofSaveError}</div>}

            <p className="text-muted mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Personal Information</p>
            <div className="row g-3 mb-4">
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>SF#</label><input type="text" className="form-control form-control-sm" value={hofForm.sf_no} onChange={e => setHofForm({ ...hofForm, sf_no: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>ITS#</label><input type="text" className="form-control form-control-sm" value={hofForm.its_no} onChange={e => setHofForm({ ...hofForm, its_no: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>Full Name *</label><input type="text" className="form-control form-control-sm" value={hofForm.full_name} onChange={e => setHofForm({ ...hofForm, full_name: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>Date of Birth</label><input type="date" className="form-control form-control-sm" value={hofForm.dob} onChange={e => setHofForm({ ...hofForm, dob: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>Phone No</label><input type="text" className="form-control form-control-sm" value={hofForm.phone_no} onChange={e => setHofForm({ ...hofForm, phone_no: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>WhatsApp No</label><input type="text" className="form-control form-control-sm" value={hofForm.whatsapp_no} onChange={e => setHofForm({ ...hofForm, whatsapp_no: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>Email</label><input type="email" className="form-control form-control-sm" value={hofForm.email} onChange={e => setHofForm({ ...hofForm, email: e.target.value })} /></div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Mumin Category</label>
                <select className="form-select form-select-sm" value={hofForm.mumin_category_id} onChange={e => setHofForm({ ...hofForm, mumin_category_id: e.target.value })}>
                  <option value="">— Select Category —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Niyyat Status</label>
                <select className="form-select form-select-sm" value={hofForm.niyyat_status_id} onChange={e => setHofForm({ ...hofForm, niyyat_status_id: e.target.value })}>
                  <option value="">— Select —</option>
                  {niyyatStatuses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Status</label>
                <select className="form-select form-select-sm" value={hofForm.status} onChange={e => setHofForm({ ...hofForm, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="col-12"><label className="form-label" style={{ fontSize: '13px' }}>Remarks</label><textarea className="form-control form-control-sm" rows={2} value={hofForm.remarks} onChange={e => setHofForm({ ...hofForm, remarks: e.target.value })} /></div>
            </div>

            <p className="text-muted mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Address</p>
            <div className="row g-3 mb-4">
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>House Type</label>
                <select className="form-select form-select-sm" value={hofForm.house_type} onChange={e => setHofForm({ ...hofForm, house_type: e.target.value })}>
                  <option value="">— Select —</option>
                  {HOUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-4"><label className="form-label" style={{ fontSize: '13px' }}>Number</label><input type="text" className="form-control form-control-sm" placeholder="e.g. 4" value={hofForm.addr_number} onChange={e => setHofForm({ ...hofForm, addr_number: e.target.value })} /></div>
              <div className="col-4"><label className="form-label" style={{ fontSize: '13px' }}>Category (A–Z or number)</label><input type="text" className="form-control form-control-sm" placeholder="e.g. A or 2" value={hofForm.addr_cat} onChange={e => setHofForm({ ...hofForm, addr_cat: e.target.value })} maxLength={5} /></div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Floor</label>
                <select className="form-select form-select-sm" value={hofForm.addr_floor} onChange={e => setHofForm({ ...hofForm, addr_floor: e.target.value })}>
                  <option value="">— Select —</option>
                  {FLOORS.map(f => <option key={f} value={f}>{ordinal(f)}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Block</label>
                <select className="form-select form-select-sm" value={hofForm.addr_block} onChange={e => setHofForm({ ...hofForm, addr_block: e.target.value })}>
                  <option value="">— Select —</option>
                  {BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Sector</label>
                <select className="form-select form-select-sm" value={hofForm.address_sector_id} onChange={e => setHofForm({ ...hofForm, address_sector_id: e.target.value })}>
                  <option value="">— Select Sector —</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label" style={{ fontSize: '13px' }}>Full Address Preview</label>
                <div style={{ background: '#f8f9fa', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', borderLeft: `3px solid ${addrPreview ? '#ffbf69' : '#dee2e6'}`, minHeight: '36px', lineHeight: '20px', color: addrPreview ? '#364574' : '#adb5bd' }}>
                  {addrPreview || (hof.full_address
                    ? <><span style={{ color: '#212529' }}>{hof.full_address}</span> <span style={{ color: '#adb5bd', fontSize: '12px' }}>(fill fields above to update)</span></>
                    : 'Fill in the fields above to generate address…')}
                </div>
              </div>
            </div>

            <p className="text-muted mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Family Count <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '11px' }}>(auto-updated when members have DOB)</span></p>
            <div className="row g-3">
              <div className="col-4"><label className="form-label" style={{ fontSize: '13px' }}>Adults</label><input type="number" min={0} className="form-control form-control-sm" value={hofForm.total_adult} onChange={e => setHofForm({ ...hofForm, total_adult: e.target.value })} /></div>
              <div className="col-4"><label className="form-label" style={{ fontSize: '13px' }}>Children</label><input type="number" min={0} className="form-control form-control-sm" value={hofForm.total_child} onChange={e => setHofForm({ ...hofForm, total_child: e.target.value })} /></div>
              <div className="col-4"><label className="form-label" style={{ fontSize: '13px' }}>Infants</label><input type="number" min={0} className="form-control form-control-sm" value={hofForm.total_infant} onChange={e => setHofForm({ ...hofForm, total_infant: e.target.value })} /></div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-light btn-sm" onClick={() => setShowHofModal(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveHof} disabled={hofSaving}>{hofSaving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Family Member Modal ── */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="modal-header">
            <h5 className="modal-title">{editingMember ? 'Edit Member' : 'Add Family Member'}</h5>
            <button className="btn-close" onClick={() => setShowModal(false)} />
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {saveError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{saveError}</div>}
            <div className="row g-3">
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>SF#</label><input type="text" className="form-control form-control-sm" placeholder="e.g. 1234" value={memberForm.sf_no} onChange={e => setMemberForm({ ...memberForm, sf_no: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>ITS#</label><input type="text" className="form-control form-control-sm" placeholder="e.g. 30000001" value={memberForm.its_no} onChange={e => setMemberForm({ ...memberForm, its_no: e.target.value })} /></div>
              <div className="col-12"><label className="form-label" style={{ fontSize: '13px' }}>Full Name *</label><input type="text" className="form-control form-control-sm" placeholder="Enter full name" value={memberForm.full_name} onChange={e => setMemberForm({ ...memberForm, full_name: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>Phone No</label><input type="text" className="form-control form-control-sm" placeholder="03001234567" value={memberForm.phone_no} onChange={e => setMemberForm({ ...memberForm, phone_no: e.target.value })} /></div>
              <div className="col-6"><label className="form-label" style={{ fontSize: '13px' }}>WhatsApp No</label><input type="text" className="form-control form-control-sm" placeholder="03001234567" value={memberForm.whatsapp_no} onChange={e => setMemberForm({ ...memberForm, whatsapp_no: e.target.value })} /></div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Date of Birth</label>
                <input type="date" className="form-control form-control-sm" value={memberForm.dob} onChange={e => setMemberForm({ ...memberForm, dob: e.target.value })} />
              </div>
              {memberAgeLabel && (
                <div className="col-6 d-flex align-items-end">
                  <div>
                    <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '4px' }}>Age Group</div>
                    <span className="badge" style={{ backgroundColor: ageColors[memberAgeLabel] + '22', color: ageColors[memberAgeLabel], border: `1px solid ${ageColors[memberAgeLabel]}44`, fontSize: '12px', fontWeight: 600, padding: '5px 12px', textTransform: 'capitalize' }}>
                      {memberAgeLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveMember} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}