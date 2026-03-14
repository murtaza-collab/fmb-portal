'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Mumin {
  id: number; sf_no: string; its_no: string; full_name: string
  phone_no: string; whatsapp_no: string; email: string; dob: string
  full_address: string; status: string; is_hof: boolean; hof_id: number | null
  address_sector_id: number | null; address_block_id: number | null
  address_type_id: number | null; address_category: string; address_number: string
  address_floor: string; niyyat_status_id: number | null
  mumin_category_id: number | null; remarks: string
  total_adult: number; total_child: number; total_infant: number
}

interface FamilyMember {
  id: number; sf_no: string; its_no: string; full_name: string
  phone_no: string; whatsapp_no: string; dob: string; hof_id: number | null; is_hof: boolean
}

interface Sector        { id: number; name: string }
interface HouseBlock    { id: number; name: string }
interface HouseType     { id: number; name: string }
interface NiyyatStatus  { id: number; name: string }
interface MuminCategory { id: number; name: string; colour: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: '+92',  label: '🇵🇰 +92'  }, { code: '+971', label: '🇦🇪 +971' },
  { code: '+966', label: '🇸🇦 +966' }, { code: '+1',   label: '🇺🇸 +1'   },
  { code: '+44',  label: '🇬🇧 +44'  }, { code: '+61',  label: '🇦🇺 +61'  },
  { code: '+91',  label: '🇮🇳 +91'  }, { code: '+974', label: '🇶🇦 +974' },
]
const PAGE_SIZE = 100

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

const parsePhone = (val: string) => {
  if (!val) return { cc: '+92', num: '' }
  for (const c of COUNTRY_CODES) {
    if (val.startsWith(c.code)) return { cc: c.code, num: val.slice(c.code.length) }
  }
  return { cc: '+92', num: val.replace(/^\+/, '') }
}

const calcAge = (dob: string): string => {
  if (!dob) return '—'
  const d = new Date(dob), now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
  if (age < 0) return '—'
  if (age < 7)  return `${age}y (Infant)`
  if (age < 15) return `${age}y (Child)`
  return `${age}y (Adult)`
}

const buildAddress = (typeName: string, number: string, cat: string, floor: string, blockName: string, sectorName: string) => {
  const parts: string[] = []
  const unit = `${typeName ? typeName + ' ' : ''}${number}${cat}`.trim()
  if (unit) parts.push(unit)
  if (floor) {
    const lbl = FLOOR_OPTIONS.find(f => f.value === floor)?.label || `${floor} Floor`
    parts.push(lbl)
  }
  if (blockName) parts.push(`Block ${blockName}`)
  if (sectorName) parts.push(sectorName)
  return parts.join(', ')
}

const Modal = ({ children, onClose, size = '' }: { children: React.ReactNode; onClose: () => void; size?: string }) => (
  <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }} onClick={onClose}>
    <div className={`modal-dialog ${size}`} style={{ marginTop: 60 }} onClick={e => e.stopPropagation()}>
      <div className="modal-content" style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: 'none', borderRadius: 12 }}>{children}</div>
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function MumineenPage() {
  const router = useRouter()

  // FIX: Added 'all' tab
  const [tab, setTab]                     = useState<'hofs' | 'members' | 'all'>('hofs')
  const [hofSubTab, setHofSubTab]         = useState<'active' | 'transferred'>('active')
  const [memberSubTab, setMemberSubTab]   = useState<'active' | 'transferred'>('active')
  const [mumineen, setMumineen]           = useState<Mumin[]>([])
  const [sectors, setSectors]             = useState<Sector[]>([])
  const [blocks, setBlocks]               = useState<HouseBlock[]>([])
  const [houseTypes, setHouseTypes]       = useState<HouseType[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [categories, setCategories]       = useState<MuminCategory[]>([])
  const [isAdmin, setIsAdmin]             = useState(false)
  const [noShowId, setNoShowId]           = useState<number | null>(null)
  const [loading, setLoading]             = useState(true)

  const [showModal, setShowModal]         = useState(false)
  const [editing, setEditing]             = useState<Mumin | null>(null)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState('')

  const [showTransfer, setShowTransfer]   = useState<Mumin | null>(null)
  const [transferReason, setTransferReason] = useState('')
  const [transferring, setTransferring]   = useState(false)

  const [showDelete, setShowDelete]       = useState<Mumin | null>(null)
  const [deleting, setDeleting]           = useState(false)

  const [showFamilyModal, setShowFamilyModal]   = useState(false)
  const [familyModalHof, setFamilyModalHof]     = useState<Mumin | null>(null)
  const [editingMember, setEditingMember]       = useState<FamilyMember | null>(null)
  const [savingMember, setSavingMember]         = useState(false)
  const [memberError, setMemberError]           = useState('')

  const [search, setSearch]               = useState('')
  const [sectorFilter, setSectorFilter]   = useState('')
  const [niyyatFilter, setNiyyatFilter]   = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage]                   = useState(1)

  const [importing, setImporting]         = useState(false)
  const [importMsg, setImportMsg]         = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    sf_no: '', its_no: '', full_name: '', dob: '',
    phone_cc: '+92', phone_num: '', wa_cc: '+92', wa_num: '',
    email: '', remarks: '',
    address_type_id: '' as string|number, address_block_id: '' as string|number,
    address_sector_id: '' as string|number, address_number: '', address_category: '',
    address_floor: '', mumin_category_id: '' as string|number,
  }
  const [form, setForm] = useState(emptyForm)
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const emptyMemberForm = { its_no: '', full_name: '', dob: '', phone_cc: '+92', phone_num: '', wa_cc: '+92', wa_num: '' }
  const [memberForm, setMemberForm] = useState(emptyMemberForm)
  const mf = (k: string, v: any) => setMemberForm(p => ({ ...p, [k]: v }))

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [search, sectorFilter, niyyatFilter, categoryFilter, tab, hofSubTab, memberSubTab])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: adminData } = await supabase.from('admin_users').select('user_groups(name)').eq('auth_id', user.id).single()
      const gn = (adminData?.user_groups as any)?.name?.toLowerCase() || ''
      setIsAdmin(gn === 'super admin' || gn === 'admin' || gn === 'super_admin')
    }
    const [mRes, sRes, bRes, tRes, nRes, cRes] = await Promise.all([
      supabase.from('mumineen').select('id,sf_no,its_no,full_name,phone_no,whatsapp_no,email,dob,full_address,status,is_hof,hof_id,address_sector_id,address_block_id,address_type_id,address_category,address_number,address_floor,niyyat_status_id,mumin_category_id,remarks,total_adult,total_child,total_infant').order('full_name'),
      supabase.from('house_sectors').select('id,name').order('name'),
      supabase.from('house_blocks').select('id,name').order('name'),
      supabase.from('house_types').select('id,name').order('name'),
      supabase.from('niyyat_statuses').select('id,name').order('name'),
      supabase.from('mumin_categories').select('id,name,colour').order('name'),
    ])
    setMumineen((mRes.data as any[]) || [])
    setSectors(sRes.data || [])
    setBlocks(bRes.data || [])
    setHouseTypes(tRes.data || [])
    setNiyyatStatuses(nRes.data || [])
    setCategories(cRes.data || [])
    const ns = (nRes.data || []).find((n: NiyyatStatus) => n.name.toLowerCase().includes('no-show') || n.name.toLowerCase().includes('no show'))
    setNoShowId(ns?.id || null)
    setLoading(false)
  }

  const getSector  = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getBlock   = (id: number | null) => blocks.find(b => b.id === id)?.name || ''
  const getType    = (id: number | null) => houseTypes.find(t => t.id === id)?.name || ''
  const getNiyyat  = (id: number | null) => niyyatStatuses.find(n => n.id === id)?.name || '—'
  const getCat     = (id: number | null) => categories.find(c => c.id === id)
  const getNiyyatColor = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('approved'))                         return { bg: '#0ab39c20', color: '#0ab39c' }
    if (n.includes('no-show') || n.includes('no show')) return { bg: '#e6394620', color: '#e63946' }
    if (n.includes('pending'))                          return { bg: '#ffbf6920', color: '#856404' }
    return { bg: '#36457420', color: '#364574' }
  }

  const addressPreview = buildAddress(
    getType(Number(form.address_type_id) || null),
    form.address_number, form.address_category, form.address_floor,
    getBlock(Number(form.address_block_id) || null),
    getSector(Number(form.address_sector_id) || null) === '—' ? '' : getSector(Number(form.address_sector_id) || null)
  )

  // ── HOF modal ─────────────────────────────────────────────────────────────

  const openAdd = () => { setEditing(null); setForm(emptyForm); setSaveError(''); setShowModal(true) }

  const openEdit = (m: Mumin) => {
    setEditing(m)
    const ph = parsePhone(m.phone_no || '')
    const wa = parsePhone(m.whatsapp_no || '')
    setForm({
      sf_no: m.sf_no || '', its_no: m.its_no || '', full_name: m.full_name || '',
      dob: m.dob || '', email: m.email || '', remarks: m.remarks || '',
      phone_cc: ph.cc, phone_num: ph.num, wa_cc: wa.cc, wa_num: wa.num,
      address_type_id: m.address_type_id || '', address_block_id: m.address_block_id || '',
      address_sector_id: m.address_sector_id || '', address_number: m.address_number || '',
      address_category: m.address_category || '', address_floor: m.address_floor || '',
      mumin_category_id: m.mumin_category_id || '',
    })
    setSaveError(''); setShowModal(true)
  }

  const validateEmail = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  const handleSave = async () => {
    if (!form.full_name.trim()) { setSaveError('Full Name is required.'); return }
    if (!form.sf_no.trim())     { setSaveError('SF# is required.'); return }
    if (!form.its_no.trim())    { setSaveError('ITS# is required for HOF.'); return }
    if (!validateEmail(form.email)) { setSaveError('Enter a valid email address.'); return }
    setSaving(true); setSaveError('')

    if (!editing) {
      const { data: sfCheck } = await supabase.from('mumineen').select('id,full_name').eq('sf_no', form.sf_no.trim()).eq('is_hof', true).maybeSingle()
      if (sfCheck) { setSaveError(`SF# ${form.sf_no.trim()} already used by HOF: ${sfCheck.full_name}.`); setSaving(false); return }
    }

    const itsQuery = supabase.from('mumineen').select('id,full_name').eq('its_no', form.its_no.trim())
    if (editing) itsQuery.neq('id', editing.id)
    const { data: itsCheck } = await itsQuery.maybeSingle()
    if (itsCheck) { setSaveError(`ITS# ${form.its_no.trim()} already used by: ${itsCheck.full_name}.`); setSaving(false); return }

    const payload: any = {
      sf_no: form.sf_no.trim(), its_no: form.its_no.trim(), full_name: form.full_name.trim(),
      dob: form.dob || null, email: form.email.trim() || null, remarks: form.remarks.trim() || null,
      phone_no: form.phone_num ? form.phone_cc + form.phone_num : null,
      whatsapp_no: form.wa_num ? form.wa_cc + form.wa_num : null,
      address_type_id: form.address_type_id || null, address_block_id: form.address_block_id || null,
      address_sector_id: form.address_sector_id || null, address_number: form.address_number || null,
      address_category: form.address_category || null, address_floor: form.address_floor || null,
      full_address: addressPreview || null, is_hof: true, hof_id: null,
    }
    if (isAdmin) payload.mumin_category_id = form.mumin_category_id || null
    if (!editing) { payload.status = 'active'; payload.niyyat_status_id = noShowId || null }

    const res = editing
      ? await supabase.from('mumineen').update(payload).eq('id', editing.id)
      : await supabase.from('mumineen').insert(payload).select('id,sf_no,its_no').single()

    if (res.error) { setSaveError(res.error.message); setSaving(false); return }

    if (!editing && (res as any).data) {
      const { id, sf_no, its_no } = (res as any).data
      if (its_no) {
        try {
          await fetch('/api/admin/create-mumin-user', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mumin_id: id, sf_no, its_no })
          })
        } catch (e) { console.warn('Auth user creation failed:', e) }
      }
    }
    await fetchAll(); setShowModal(false); setSaving(false)
  }

  // ── Transfer ───────────────────────────────────────────────────────────────

  const handleTransfer = async () => {
    if (!showTransfer) return
    setTransferring(true)
    const remarksVal = transferReason ? `[Transferred] ${transferReason}` : '[Transferred]'
    await supabase.from('mumineen').update({ status: 'transferred', remarks: remarksVal }).eq('id', showTransfer.id)
    await supabase.from('mumineen').update({ status: 'transferred' }).eq('hof_id', showTransfer.id)
    await fetchAll(); setShowTransfer(null); setTransferReason(''); setTransferring(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!showDelete) return
    setDeleting(true)
    await supabase.from('mumineen').delete().eq('id', showDelete.id)
    await fetchAll(); setShowDelete(null); setDeleting(false)
  }

  // ── Family member modal ────────────────────────────────────────────────────

  const openAddMember = (hof: Mumin) => {
    setFamilyModalHof(hof); setEditingMember(null)
    setMemberForm(emptyMemberForm); setMemberError(''); setShowFamilyModal(true)
  }

  const openEditMember = (m: FamilyMember, hof: Mumin) => {
    setFamilyModalHof(hof); setEditingMember(m)
    const ph = parsePhone(m.phone_no || '')
    const wa = parsePhone(m.whatsapp_no || '')
    setMemberForm({ its_no: m.its_no || '', full_name: m.full_name || '', dob: m.dob || '', phone_cc: ph.cc, phone_num: ph.num, wa_cc: wa.cc, wa_num: wa.num })
    setMemberError(''); setShowFamilyModal(true)
  }

  const handleSaveMember = async () => {
    if (!memberForm.full_name.trim()) { setMemberError('Full Name is required.'); return }
    if (!memberForm.its_no.trim())    { setMemberError('ITS# is required.'); return }
    if (!familyModalHof)              { setMemberError('HOF not set.'); return }
    setSavingMember(true); setMemberError('')

    const itsQuery = supabase.from('mumineen').select('id,full_name').eq('its_no', memberForm.its_no.trim())
    if (editingMember) itsQuery.neq('id', editingMember.id)
    const { data: itsCheck } = await itsQuery.maybeSingle()
    if (itsCheck) { setMemberError(`ITS# ${memberForm.its_no.trim()} already used by: ${itsCheck.full_name}.`); setSavingMember(false); return }

    const payload: any = {
      full_name: memberForm.full_name.trim(), its_no: memberForm.its_no.trim() || null,
      sf_no: familyModalHof.sf_no, dob: memberForm.dob || null,
      phone_no: memberForm.phone_num ? memberForm.phone_cc + memberForm.phone_num : null,
      whatsapp_no: memberForm.wa_num ? memberForm.wa_cc + memberForm.wa_num : null,
      hof_id: familyModalHof.id, is_hof: false, status: 'active',
    }
    const res = editingMember
      ? await supabase.from('mumineen').update(payload).eq('id', editingMember.id)
      : await supabase.from('mumineen').insert(payload)
    if (res.error) { setMemberError(res.error.message); setSavingMember(false); return }
    await fetchAll(); setShowFamilyModal(false); setSavingMember(false)
  }

  // ── Import / Export ────────────────────────────────────────────────────────

  // FIX: Export supports 'all' tab — includes Type column, HOF name for members
  const handleExport = () => {
    const headers = ['Type', 'SF#', 'ITS#', 'Full Name', 'Phone', 'WhatsApp', 'Address', 'Sector', 'HOF Name', 'Niyyat Status', ...(isAdmin ? ['Category'] : []), 'Status']
    const exportList = tab === 'all'
      ? mumineen
      : tab === 'hofs' ? mumineen.filter(m => m.is_hof) : mumineen.filter(m => !m.is_hof)
    const rows = exportList.map(m => {
      const hof = m.is_hof ? null : hofMap.get(m.hof_id!)
      return [
        m.is_hof ? 'HOF' : 'Member',
        m.sf_no || '', m.its_no || '', m.full_name,
        m.phone_no || '', m.whatsapp_no || '',
        m.full_address || '', getSector(m.address_sector_id),
        m.is_hof ? '' : (hof?.full_name || ''),
        getNiyyat(m.niyyat_status_id),
        ...(isAdmin ? [getCat(m.mumin_category_id)?.name || ''] : []),
        m.status,
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = tab === 'all' ? 'mumineen_all.csv' : tab === 'hofs' ? 'mumineen_hofs.csv' : 'mumineen_members.csv'
    a.click()
  }

  const handleSample = () => {
    const headers = ['SF#','ITS#','Full Name','Date of Birth','Phone','WhatsApp','Email','Mumin Category','Remarks','House Type','Number','Category (A-Z)','Floor','Block','Sector Name']
    const example = ['1001','40000001','Husain bhai Ali bhai','1980-01-15','+923001234567','+923001234567','husain@example.com','Normal','','Flat','4','A','2','B','MSB - TTC LANE']
    const csv = [headers, example].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'mumineen_sample.csv'; a.click()
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportMsg('')
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].replace(/"/g,'').split(',').map(h => h.trim().toLowerCase())
    const rows = lines.slice(1).map(line => {
      const vals = line.replace(/"/g,'').split(',').map(v => v.trim())
      const obj: any = {}; headers.forEach((h,i) => { obj[h] = vals[i] || null }); return obj
    }).filter(r => r['sf#'] || r['full name'])
    if (!rows.length) { setImportMsg('No valid rows found.'); setImporting(false); return }
    const payload = rows.map((r: any) => {
      const sectorMatch = sectors.find(s => s.name.toLowerCase() === (r['sector name']||'').toLowerCase())
      const blockMatch  = blocks.find(b => b.name.toLowerCase() === (r['block']||'').toLowerCase())
      const typeMatch   = houseTypes.find(t => t.name.toLowerCase() === (r['house type']||'').toLowerCase())
      const catMatch    = categories.find(c => c.name.toLowerCase() === (r['mumin category']||'').toLowerCase())
      const fullAddress = buildAddress(r['house type']||'', r['number']||'', r['category (a-z)']||'', r['floor']||'', r['block']||'', r['sector name']||'')
      return {
        sf_no: r['sf#']||null, its_no: r['its#']||null, full_name: r['full name']||'',
        dob: r['date of birth']||null, phone_no: r['phone']||null, whatsapp_no: r['whatsapp']||null,
        email: r['email']||null, remarks: r['remarks']||null,
        address_type_id: typeMatch?.id||null, address_block_id: blockMatch?.id||null,
        address_sector_id: sectorMatch?.id||null, address_number: r['number']||null,
        address_category: r['category (a-z)']||null, address_floor: r['floor']||null,
        full_address: fullAddress||null,
        mumin_category_id: isAdmin ? (catMatch?.id||null) : null,
        is_hof: true, hof_id: null, status: 'active', niyyat_status_id: noShowId||null,
      }
    })
    const { error } = await supabase.from('mumineen').insert(payload)
    setImportMsg(error ? error.message : `✓ Imported ${payload.length} HOFs`)
    if (!error) await fetchAll()
    setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const hofs    = mumineen.filter(m => m.is_hof)
  const members = mumineen.filter(m => !m.is_hof)
  const hofMap  = new Map(hofs.map(h => [h.id, h]))

  const activeMembers = members.filter(m => {
    const hof = hofs.find(h => h.id === m.hof_id)
    return m.status !== 'transferred' && hof?.status !== 'transferred'
  })

  const filteredHofs = hofs.filter(m => {
    const q = search.toLowerCase()
    return (
      (!search || m.full_name?.toLowerCase().includes(q) || m.sf_no?.toLowerCase().includes(q) || m.its_no?.toLowerCase().includes(q)) &&
      (!sectorFilter   || String(m.address_sector_id) === sectorFilter) &&
      (!niyyatFilter   || String(m.niyyat_status_id)  === niyyatFilter) &&
      (!categoryFilter || String(m.mumin_category_id) === categoryFilter) &&
      m.status === hofSubTab
    )
  })

  const filteredMembers = members.filter(m => {
    const q = search.toLowerCase()
    const hof = hofs.find(h => h.id === m.hof_id)
    const isTransferred = m.status === 'transferred' || hof?.status === 'transferred'
    return (
      (!search || m.full_name?.toLowerCase().includes(q) || m.sf_no?.toLowerCase().includes(q) || m.its_no?.toLowerCase().includes(q)) &&
      (memberSubTab === 'transferred' ? isTransferred : !isTransferred)
    )
  })

  // FIX: filteredAll for 'all' tab — every mumin
  const filteredAll = mumineen.filter(m => {
    const q = search.toLowerCase()
    return !search || m.full_name?.toLowerCase().includes(q) || m.sf_no?.toLowerCase().includes(q) || m.its_no?.toLowerCase().includes(q)
  })

  // FIX: currentList handles 'all' tab
  const currentList = tab === 'hofs' ? filteredHofs : tab === 'members' ? filteredMembers : filteredAll
  const totalPages  = Math.ceil(currentList.length / PAGE_SIZE)
  const paginated   = currentList.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Mumineen</h4>
          {/* FIX: Show total entries + HOFs + Members separately */}
          <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
            <strong>{mumineen.length}</strong> Total Entries ·{' '}
            <span style={{ color: '#364574', fontWeight: 600 }}>{hofs.filter(h => h.status === 'active').length}</span> Active HOFs ·{' '}
            <span style={{ color: '#0ab39c', fontWeight: 600 }}>{activeMembers.length}</span> Members
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-secondary btn-sm" onClick={handleSample}><i className="bi bi-file-earmark-arrow-down me-1" />Sample</button>
          <button className="btn btn-outline-success btn-sm" onClick={() => fileInputRef.current?.click()} disabled={importing}><i className="bi bi-upload me-1" />{importing ? 'Importing...' : 'Import'}</button>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-outline-primary btn-sm" onClick={handleExport}>
            <i className="bi bi-download me-1" />
            {tab === 'all' ? 'Export All' : tab === 'hofs' ? 'Export HOFs' : 'Export Members'}
          </button>
          {!(tab === 'hofs' && hofSubTab === 'transferred') && tab !== 'all' && (
            <button className="btn btn-sm" style={{ background: '#364574', color: '#fff' }} onClick={openAdd}><i className="bi bi-plus me-1" />Add HOF</button>
          )}
        </div>
      </div>

      {importMsg && <div className={`alert py-2 mb-3 ${importMsg.startsWith('✓') ? 'alert-success' : 'alert-danger'}`} style={{ fontSize: 13 }}>{importMsg}</div>}

      {/* Main tabs — FIX: Added 'all' tab */}
      <div style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
        <div className="d-flex">
          {([
            ['hofs',    `HOFs (${hofs.length})`],
            ['members', `Members (${members.length})`],
            ['all',     `All (${mumineen.length})`],
          ] as [string, string][]).map(([key, label]) => (
            <button key={key}
              onClick={() => { setTab(key as any); setPage(1); setSearch('') }}
              style={{
                border: 'none', background: 'none', padding: '12px 20px', fontSize: 14, cursor: 'pointer',
                color: tab === key ? '#364574' : 'var(--bs-secondary-color)',
                fontWeight: tab === key ? 700 : 400,
                borderBottom: tab === key ? '2px solid #364574' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs — FIX: hidden for 'all' tab */}
      {tab !== 'all' && (() => {
        const subItems: [string, string][] = tab === 'hofs'
          ? [
              ['active',      `Active (${hofs.filter(h => h.status === 'active').length})`],
              ['transferred', `Transferred (${hofs.filter(h => h.status === 'transferred').length})`],
            ]
          : [
              ['active',      `Active (${activeMembers.length})`],
              ['transferred', `Transferred (${members.length - activeMembers.length})`],
            ]
        const curSubTab = tab === 'hofs' ? hofSubTab : memberSubTab
        const setSubTab = tab === 'hofs'
          ? (k: string) => { setHofSubTab(k as any); setPage(1) }
          : (k: string) => { setMemberSubTab(k as any); setPage(1) }
        return (
          <div className="d-flex" style={{ borderBottom: '1px solid var(--bs-border-color)', background: 'var(--bs-tertiary-bg)', paddingLeft: 8 }}>
            {subItems.map(([key, label]) => (
              <button key={key} onClick={() => setSubTab(key)}
                style={{
                  border: 'none', background: 'none', padding: '7px 16px', fontSize: 12.5, cursor: 'pointer',
                  color: curSubTab === key ? '#364574' : 'var(--bs-secondary-color)',
                  fontWeight: curSubTab === key ? 600 : 400,
                  borderBottom: curSubTab === key ? '2px solid #364574' : '2px solid transparent',
                  marginBottom: -1,
                }}>
                {label}
              </button>
            ))}
          </div>
        )
      })()}

      <div className="card border-0 shadow-sm" style={{ borderRadius: '0 0 10px 10px', marginTop: 0 }}>
        <div className="card-body">

          {/* Filters */}
          <div className="d-flex gap-2 mb-3 flex-wrap">
            <input type="text" className="form-control form-control-sm"
              placeholder={tab === 'hofs' ? 'Search name, SF#, ITS#...' : tab === 'members' ? 'Search member...' : 'Search all mumineen...'}
              value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 220 }} />
            {tab === 'hofs' && (
              <>
                <select className="form-select form-select-sm" value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} style={{ maxWidth: 180 }}>
                  <option value="">All Sectors</option>
                  {sectors.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                <select className="form-select form-select-sm" value={niyyatFilter} onChange={e => setNiyyatFilter(e.target.value)} style={{ maxWidth: 180 }}>
                  <option value="">All Niyyat Status</option>
                  {niyyatStatuses.map(n => <option key={n.id} value={String(n.id)}>{n.name}</option>)}
                </select>
                {isAdmin && (
                  <select className="form-select form-select-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ maxWidth: 160 }}>
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                )}
              </>
            )}
          </div>

          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                    <tr>
                      {/* FIX: 'all' tab columns */}
                      {tab === 'all' ? (
                        <>
                          <th style={thStyle}>Type</th>
                          <th style={thStyle}>SF#</th>
                          <th style={thStyle}>ITS#</th>
                          <th style={thStyle}>Full Name</th>
                          <th style={thStyle}>Age</th>
                          <th style={thStyle}>Phone</th>
                          <th style={thStyle}>HOF / Members</th>
                          <th style={thStyle}>Address</th>
                          <th style={thStyle}>Status</th>
                        </>
                      ) : tab === 'hofs' ? (
                        <>
                          <th style={thStyle}>SF#</th>
                          <th style={thStyle}>ITS#</th>
                          <th style={thStyle}>Full Name</th>
                          <th style={thStyle}>Age</th>
                          <th style={thStyle}>Phone</th>
                          <th style={thStyle}>Address</th>
                          <th style={thStyle}>Sector</th>
                          <th style={thStyle}>Niyyat Status</th>
                          {isAdmin && <th style={thStyle}>Category</th>}
                          {hofSubTab === 'active' && <th style={thStyle}>Status</th>}
                          <th style={{ width: 90 }}></th>
                        </>
                      ) : (
                        <>
                          <th style={thStyle}>ITS#</th>
                          <th style={thStyle}>Full Name</th>
                          <th style={thStyle}>SF# (Family)</th>
                          <th style={thStyle}>HOF</th>
                          <th style={thStyle}>Age</th>
                          <th style={thStyle}>Phone</th>
                          <th style={{ width: 90 }}></th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>No records found</td></tr>
                    ) : tab === 'all' ? (
                      /* FIX: 'all' tab rows — HOFs and members together */
                      (paginated as Mumin[]).map(m => {
                        const hof = m.is_hof ? null : hofMap.get(m.hof_id!)
                        const memberCount = m.is_hof ? members.filter(x => x.hof_id === m.id).length : 0
                        return (
                          <tr key={m.id} style={{ opacity: m.status === 'transferred' ? 0.6 : 1 }}>
                            <td>
                              {m.is_hof
                                ? <span className="badge" style={{ background: '#364574', color: '#fff', fontSize: 11 }}>HOF</span>
                                : <span className="badge" style={{ background: '#0ab39c22', color: '#0ab39c', border: '1px solid #0ab39c44', fontSize: 11 }}>Member</span>
                              }
                            </td>
                            <td style={{ fontWeight: 600, color: '#364574' }}>{m.sf_no || '—'}</td>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{m.its_no || '—'}</td>
                            <td style={{ fontWeight: 500, color: 'var(--bs-body-color)' }}>
                              {m.full_name}
                              {m.is_hof && <i className="bi bi-star-fill ms-1" style={{ fontSize: 9, color: '#ffbf69' }} />}
                            </td>
                            <td style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>{calcAge(m.dob)}</td>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{m.phone_no || '—'}</td>
                            <td style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>
                              {m.is_hof
                                ? `${memberCount} member${memberCount !== 1 ? 's' : ''}`
                                : (hof?.full_name || '—')
                              }
                            </td>
                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--bs-secondary-color)' }}
                              title={m.full_address || ''}>
                              {m.full_address || '—'}
                            </td>
                            <td>
                              <span className={`badge ${m.status === 'active' ? 'bg-success bg-opacity-10' : 'bg-secondary bg-opacity-10'}`}
                                style={{ color: m.status === 'active' ? '#0ab39c' : '#6c757d', fontSize: 11 }}>
                                {m.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    ) : tab === 'hofs' ? (
                      (paginated as Mumin[]).map(m => {
                        const cat = getCat(m.mumin_category_id)
                        const niyyatName = getNiyyat(m.niyyat_status_id)
                        const nc = getNiyyatColor(niyyatName)
                        return (
                          <tr key={m.id} style={{ opacity: m.status === 'transferred' ? 0.65 : 1 }}>
                            <td style={{ fontWeight: 600, color: '#364574' }}>{m.sf_no || '—'}</td>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{m.its_no || '—'}</td>
                            <td style={{ fontWeight: 500, color: 'var(--bs-body-color)' }}>{m.full_name}</td>
                            <td style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>{calcAge(m.dob)}</td>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{m.phone_no || '—'}</td>
                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--bs-secondary-color)' }} title={m.full_address || ''}>{m.full_address || '—'}</td>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{getSector(m.address_sector_id)}</td>
                            <td><span className="badge" style={{ background: nc.bg, color: nc.color, fontWeight: 600, fontSize: 11 }}>{niyyatName}</span></td>
                            {isAdmin && <td>{cat ? <span className="badge" style={{ background: cat.colour+'22', color: cat.colour, border: `1px solid ${cat.colour}44`, fontSize: 11 }}>{cat.name}</span> : '—'}</td>}
                            {hofSubTab === 'active' && <td><span className="badge bg-success bg-opacity-10" style={{ color: '#0ab39c', fontSize: 11 }}>active</span></td>}
                            <td>
                              <div className="d-flex gap-1 justify-content-end">
                                <button className="btn btn-sm" title="View" style={{ padding: '2px 7px', color: '#299cdb' }} onClick={() => router.push(`/mumineen/${m.id}`)}><i className="bi bi-eye" /></button>
                                <button className="btn btn-sm" title="Edit" style={{ padding: '2px 7px', color: '#364574' }} onClick={() => openEdit(m)}><i className="bi bi-pencil" /></button>
                                {hofSubTab === 'active' && <button className="btn btn-sm" title="Transfer" style={{ padding: '2px 7px', color: '#856404' }} onClick={() => { setShowTransfer(m); setTransferReason('') }}><i className="bi bi-box-arrow-right" /></button>}
                                <button className="btn btn-sm" title="Delete" style={{ padding: '2px 7px', color: '#dc3545' }} onClick={() => setShowDelete(m)}><i className="bi bi-trash" /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      (paginated as Mumin[]).map(m => {
                        const hof = hofMap.get(m.hof_id!)
                        return (
                          <tr key={m.id}>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{m.its_no || '—'}</td>
                            <td style={{ fontWeight: 500, color: 'var(--bs-body-color)' }}>{m.full_name}</td>
                            <td style={{ color: '#364574', fontWeight: 600 }}>{m.sf_no || hof?.sf_no || '—'}</td>
                            <td style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>{hof ? hof.full_name : '—'}</td>
                            <td style={{ color: 'var(--bs-secondary-color)', fontSize: 12 }}>{calcAge(m.dob)}</td>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{m.phone_no || '—'}</td>
                            <td>
                              <div className="d-flex gap-1 justify-content-end">
                                {hof && memberSubTab === 'active' && <button className="btn btn-sm" title="Edit" style={{ padding: '2px 7px', color: '#364574' }} onClick={() => openEditMember(m as any, hof)}><i className="bi bi-pencil" /></button>}
                                <button className="btn btn-sm" title="Delete" style={{ padding: '2px 7px', color: '#dc3545' }} onClick={() => setShowDelete(m as any)}><i className="bi bi-trash" /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-3">
                <small style={{ color: 'var(--bs-secondary-color)' }}>
                  Showing {paginated.length ? (page-1)*PAGE_SIZE+1 : 0}–{Math.min(page*PAGE_SIZE, currentList.length)} of {currentList.length} records
                </small>
                {totalPages > 1 && (
                  <nav><ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${page===1?'disabled':''}`}><button className="page-link" onClick={()=>setPage(1)}>«</button></li>
                    <li className={`page-item ${page===1?'disabled':''}`}><button className="page-link" onClick={()=>setPage(p=>p-1)}>‹</button></li>
                    {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=2)
                      .reduce<(number|string)[]>((acc,p,i,arr)=>{if(i>0&&(p as number)-(arr[i-1] as number)>1)acc.push('...');acc.push(p);return acc},[])
                      .map((p,i)=>p==='...'
                        ?<li key={`e${i}`} className="page-item disabled"><span className="page-link">…</span></li>
                        :<li key={p} className={`page-item ${page===p?'active':''}`}><button className="page-link" onClick={()=>setPage(p as number)}>{p}</button></li>
                      )}
                    <li className={`page-item ${page===totalPages?'disabled':''}`}><button className="page-link" onClick={()=>setPage(p=>p+1)}>›</button></li>
                    <li className={`page-item ${page===totalPages?'disabled':''}`}><button className="page-link" onClick={()=>setPage(totalPages)}>»</button></li>
                  </ul></nav>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Add/Edit HOF Modal ── */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} size="modal-lg">
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
            <h5 className="modal-title fw-bold" style={{ color: 'var(--bs-body-color)' }}>{editing ? 'Edit HOF' : 'Add Mumin (HOF)'}</h5>
            <button className="btn-close" onClick={() => setShowModal(false)} />
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {saveError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{saveError}</div>}
            <p style={sectionLabel}>Personal Information</p>
            <div className="row g-3 mb-4">
              <div className="col-6">
                <label style={labelStyle}>SF# * <span style={{ fontWeight: 400, color: 'var(--bs-secondary-color)', fontSize: 11 }}>(family number)</span></label>
                <input className="form-control form-control-sm" placeholder="e.g. 1234" value={form.sf_no} onChange={e => f('sf_no', e.target.value)} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>ITS# * <span style={{ fontWeight: 400, color: 'var(--bs-secondary-color)', fontSize: 11 }}>(unique per person)</span></label>
                <input className="form-control form-control-sm" placeholder="e.g. 40000001" value={form.its_no} onChange={e => f('its_no', e.target.value)} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Full Name *</label>
                <input className="form-control form-control-sm" placeholder="Enter full name" value={form.full_name} onChange={e => f('full_name', toTitleCase(e.target.value))} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Date of Birth</label>
                <input type="date" className="form-control form-control-sm" value={form.dob} onChange={e => f('dob', e.target.value)} />
                {form.dob && <small style={{ color: 'var(--bs-secondary-color)', fontSize: 11 }}>{calcAge(form.dob)}</small>}
              </div>
              <div className="col-6">
                <label style={labelStyle}>Phone No</label>
                <PhoneInput value={form.phone_cc + form.phone_num} onChange={v => { const p = parsePhone(v); f('phone_cc', p.cc); f('phone_num', p.num) }} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>WhatsApp No</label>
                <PhoneInput value={form.wa_cc + form.wa_num} onChange={v => { const p = parsePhone(v); f('wa_cc', p.cc); f('wa_num', p.num) }} />
              </div>
              <div className="col-6">
                <label style={labelStyle}>Email <span style={{ fontWeight: 400, color: 'var(--bs-secondary-color)', fontSize: 11 }}>(optional)</span></label>
                <input type="email" className="form-control form-control-sm" placeholder="email@example.com" value={form.email} onChange={e => f('email', e.target.value)} />
              </div>
              {isAdmin && (
                <div className="col-6">
                  <label style={labelStyle}>Mumin Category <span className="badge bg-warning text-dark ms-1" style={{ fontSize: 10 }}>Admin</span></label>
                  <select className="form-select form-select-sm" value={form.mumin_category_id} onChange={e => f('mumin_category_id', e.target.value)}>
                    <option value="">— Select Category —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="col-12">
                <label style={labelStyle}>Remarks</label>
                <textarea className="form-control form-control-sm" rows={2} placeholder="Any remarks..." value={form.remarks} onChange={e => f('remarks', e.target.value)} />
              </div>
            </div>

            <p style={sectionLabel}>Address</p>
            <div className="row g-3">
              <div className="col-4">
                <label style={labelStyle}>House Type</label>
                <select className="form-select form-select-sm" value={form.address_type_id} onChange={e => f('address_type_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {houseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label style={labelStyle}>Number</label>
                <input className="form-control form-control-sm" placeholder="e.g. 4" value={form.address_number} onChange={e => f('address_number', e.target.value)} />
              </div>
              <div className="col-4">
                <label style={labelStyle}>Category (A–Z)</label>
                <input className="form-control form-control-sm" placeholder="e.g. A or 2" value={form.address_category} onChange={e => f('address_category', e.target.value)} maxLength={5} />
              </div>
              <div className="col-4">
                <label style={labelStyle}>Floor</label>
                <select className="form-select form-select-sm" value={form.address_floor} onChange={e => f('address_floor', e.target.value)}>
                  <option value="">— Select —</option>
                  {FLOOR_OPTIONS.map(fl => <option key={fl.value} value={fl.value}>{fl.label}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label style={labelStyle}>Block</label>
                <select className="form-select form-select-sm" value={form.address_block_id} onChange={e => f('address_block_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label style={labelStyle}>Sector</label>
                <select className="form-select form-select-sm" value={form.address_sector_id} onChange={e => f('address_sector_id', e.target.value)}>
                  <option value="">— Select Sector —</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label style={labelStyle}>Full Address Preview</label>
                <div style={{ background: 'var(--bs-secondary-bg)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: addressPreview ? '#364574' : 'var(--bs-secondary-color)', borderLeft: `3px solid ${addressPreview ? '#ffbf69' : 'var(--bs-border-color)'}`, minHeight: 36 }}>
                  {addressPreview || 'Fill in fields above to preview…'}
                </div>
              </div>
            </div>
            {!editing && (
              <div className="mt-3">
                <small style={{ color: 'var(--bs-secondary-color)' }}><i className="bi bi-info-circle me-1" />Niyyat status will be set to <strong>No-Show</strong> by default.</small>
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
            <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: '#364574', color: '#fff' }} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* ── Transfer Modal ── */}
      {showTransfer && (
        <Modal onClose={() => setShowTransfer(null)} size="modal-sm">
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
            <h6 className="modal-title fw-bold" style={{ color: '#856404' }}><i className="bi bi-box-arrow-right me-2" />Transfer Mumin</h6>
            <button className="btn-close" onClick={() => setShowTransfer(null)} />
          </div>
          <div className="modal-body" style={{ fontSize: 13 }}>
            <p style={{ color: 'var(--bs-body-color)' }}>Marking <strong>{showTransfer.full_name}</strong> as transferred.</p>
            <label style={labelStyle}>Reason (optional)</label>
            <textarea className="form-control form-control-sm" rows={2} placeholder="e.g. Moved to another mohallah..." value={transferReason} onChange={e => setTransferReason(e.target.value)} />
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
            <button className="btn btn-light btn-sm" onClick={() => setShowTransfer(null)}>Cancel</button>
            <button className="btn btn-warning btn-sm" onClick={handleTransfer} disabled={transferring}>{transferring ? 'Transferring...' : 'Confirm Transfer'}</button>
          </div>
        </Modal>
      )}

      {/* ── Delete Modal ── */}
      {showDelete && (
        <Modal onClose={() => setShowDelete(null)} size="modal-sm">
          <div className="modal-header border-0 pb-0">
            <h6 className="modal-title text-danger fw-bold"><i className="bi bi-exclamation-triangle me-2" />Delete</h6>
            <button className="btn-close" onClick={() => setShowDelete(null)} />
          </div>
          <div className="modal-body" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>
            Permanently delete <strong>{showDelete.full_name}</strong>? This cannot be undone.
          </div>
          <div className="modal-footer border-0 pt-0">
            <button className="btn btn-light btn-sm" onClick={() => setShowDelete(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Family Member Modal ── */}
      {showFamilyModal && familyModalHof && (
        <Modal onClose={() => setShowFamilyModal(false)}>
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
            <div>
              <h5 className="modal-title fw-bold mb-0" style={{ color: 'var(--bs-body-color)' }}>{editingMember ? 'Edit Family Member' : 'Add Family Member'}</h5>
              <small style={{ color: 'var(--bs-secondary-color)' }}>HOF: {familyModalHof.full_name} · SF# {familyModalHof.sf_no}</small>
            </div>
            <button className="btn-close" onClick={() => setShowFamilyModal(false)} />
          </div>
          <div className="modal-body">
            {memberError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{memberError}</div>}
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
                {memberForm.dob && <small style={{ color: 'var(--bs-secondary-color)', fontSize: 11 }}>{calcAge(memberForm.dob)}</small>}
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
                  <i className="bi bi-info-circle me-1" />SF# will be inherited from HOF: <strong>{familyModalHof.sf_no}</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
            <button className="btn btn-light btn-sm" onClick={() => setShowFamilyModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: '#364574', color: '#fff' }} onClick={handleSaveMember} disabled={savingMember}>{savingMember ? 'Saving...' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Style constants ────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties      = { fontSize: 12, color: 'var(--bs-secondary-color)', fontWeight: 700, whiteSpace: 'nowrap' }
const labelStyle: React.CSSProperties   = { fontSize: 13, fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: 4 }
const sectionLabel: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: 'var(--bs-secondary-color)', marginBottom: 8 }