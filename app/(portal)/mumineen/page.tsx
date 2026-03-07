'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Mumin {
  id: number
  sf_no: string
  its_no: string
  full_name: string
  phone_no: string
  whatsapp_no: string
  full_address: string
  status: string
  is_hof: boolean
  hof_id: number | null
  address_sector_id: number | null
  niyyat_status_id: number | null
  mumin_category_id: number | null
}

interface Sector { id: number; name: string }
interface NiyyatStatus { id: number; name: string }
interface MuminCategory { id: number; name: string; colour: string }

const Modal = ({ children, onClose, size = '' }: { children: React.ReactNode; onClose: () => void; size?: string }) => (
  <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
    <div className={`modal-dialog ${size}`} onClick={e => e.stopPropagation()}>
      <div className="modal-content">{children}</div>
    </div>
  </div>
)

const PAGE_SIZE = 100
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

export default function MumineenPage() {
  const router = useRouter()
  const [mumineen, setMumineen] = useState<Mumin[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [categories, setCategories] = useState<MuminCategory[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [noShowId, setNoShowId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Mumin | null>(null)
  const [search, setSearch] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')
  const [niyyatFilter, setNiyyatFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [page, setPage] = useState(1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Mumin | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    sf_no: '', its_no: '', full_name: '',
    phone_no: '', whatsapp_no: '', email: '', dob: '', remarks: '',
    address_sector_id: '' as string | number,
    mumin_category_id: '' as string | number,
    house_type: '', addr_number: '', addr_cat: '',
    addr_floor: '', addr_block: '',
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [search, sectorFilter, niyyatFilter, categoryFilter])

  const fetchAll = async () => {
    setLoading(true)

    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('user_groups(name)')
        .eq('auth_id', user.id)
        .single()
      const groupName = (adminData?.user_groups as any)?.name?.toLowerCase() || ''
      setIsAdmin(groupName === 'super admin' || groupName === 'admin' || groupName === 'super_admin')
    }

    const [mumineenRes, sectorsRes, niyyatRes, catRes] = await Promise.all([
      supabase.from('mumineen')
        .select('id, sf_no, its_no, full_name, phone_no, whatsapp_no, full_address, status, is_hof, hof_id, address_sector_id, niyyat_status_id, mumin_category_id'),
      supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name'),
      supabase.from('niyyat_statuses').select('id, name').order('name'),
      supabase.from('mumin_categories').select('id, name, colour').eq('status', 'active').order('name'),
    ])

    setMumineen((mumineenRes.data as any[]) || [])
    setSectors(sectorsRes.data || [])
    setNiyyatStatuses(niyyatRes.data || [])
    setCategories(catRes.data || [])

    const noShow = (niyyatRes.data || []).find((n: NiyyatStatus) => n.name.toLowerCase() === 'no-show')
    setNoShowId(noShow?.id || null)
    setLoading(false)
  }

  const getSectorName = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getNiyyatName = (id: number | null) => niyyatStatuses.find(n => n.id === id)?.name || '—'
  const getCategoryById = (id: number | null) => categories.find(c => c.id === id)

  const openAdd = () => { setEditing(null); setForm(emptyForm); setSaveError(''); setShowModal(true) }
  const openEdit = (m: Mumin) => {
    setEditing(m)
    setForm({
      sf_no: m.sf_no || '', its_no: m.its_no || '', full_name: m.full_name || '',
      phone_no: m.phone_no || '', whatsapp_no: m.whatsapp_no || '', email: '', dob: '', remarks: '',
      address_sector_id: m.address_sector_id || '',
      mumin_category_id: m.mumin_category_id || '',
      house_type: '', addr_number: '', addr_cat: '', addr_floor: '', addr_block: '',
    })
    setSaveError('')
    setShowModal(true)
  }

  const getFullAddress = () => {
    const sectorName = sectors.find(s => String(s.id) === String(form.address_sector_id))?.name || ''
    return buildAddress(form.house_type, form.addr_number, form.addr_cat, form.addr_floor, form.addr_block, sectorName)
  }

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.sf_no.trim()) { setSaveError('SF# and Full Name are required.'); return }
    setSaving(true); setSaveError('')
    const addressEntered = form.addr_number || form.house_type || form.addr_block
    const payload: any = {
      sf_no: form.sf_no.trim(),
      its_no: form.its_no.trim() || null,
      full_name: form.full_name.trim(),
      phone_no: form.phone_no.trim() || null,
      whatsapp_no: form.whatsapp_no.trim() || null,
      email: form.email.trim() || null,
      dob: form.dob || null,
      remarks: form.remarks.trim() || null,
      address_sector_id: form.address_sector_id || null,
      is_hof: true, hof_id: null, status: 'active',
    }
    // Only admins can set category
    if (isAdmin) {
      payload.mumin_category_id = form.mumin_category_id || null
    }
    if (!editing) {
      payload.niyyat_status_id = noShowId || null
      payload.full_address = getFullAddress() || null
    } else if (addressEntered) {
      payload.full_address = getFullAddress()
    }

    const res = editing
      ? await supabase.from('mumineen').update(payload).eq('id', editing.id)
      : await supabase.from('mumineen').insert(payload).select('id, sf_no, its_no').single()
    if (res.error) { setSaveError(res.error.message); setSaving(false); return }

    if (!editing && res.data) {
      const { id, sf_no, its_no } = res.data as any
      if (its_no) {
        try {
          await fetch('/api/admin/create-mumin-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mumin_id: id, sf_no, its_no })
          })
        } catch (e) { console.warn('Auth user creation failed:', e) }
      }
    }

    await fetchAll(); setShowModal(false); setSaving(false)
  }

  const handleDelete = async () => {
    if (!showDeleteConfirm) return
    setDeleting(true)
    await supabase.from('mumineen').delete().eq('id', showDeleteConfirm.id)
    await fetchAll(); setShowDeleteConfirm(null); setDeleting(false)
  }

  const handleExport = () => {
    const headers = ['SF#', 'ITS#', 'Full Name', 'Phone', 'WhatsApp', 'Address', 'Sector', ...(isAdmin ? ['Category'] : []), 'Niyyat Status']
    const rows = filtered.map(m => [
      m.sf_no, m.its_no || '', m.full_name, m.phone_no || '', m.whatsapp_no || '',
      m.full_address || '', getSectorName(m.address_sector_id),
      ...(isAdmin ? [getCategoryById(m.mumin_category_id)?.name || ''] : []),
      getNiyyatName(m.niyyat_status_id)
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'mumineen.csv'; a.click()
  }

  const handleSample = () => {
    const headers = [
      'SF#', 'ITS#', 'Full Name', 'Date of Birth', 'Phone', 'WhatsApp', 'Email',
      'Mumin Category', 'Remarks', 'House Type', 'Number', 'Category (A-Z)', 'Floor', 'Block', 'Sector Name'
    ]
    const example = [
      '1001', '40000001', 'Husain bhai Ali bhai Examplewala', '1980-01-15',
      '+923001234567', '+923001234567', 'husain@example.com',
      'Normal', '', 'Flat', '4', 'A', '2', 'B', 'AHMED MARKET SF-13'
    ]
    const note = [
      '', '', '', 'YYYY-MM-DD format', '', '', '',
      'Must match category name exactly', 'Optional notes',
      'Flat / Bungalow / Portion', 'e.g. 4', 'e.g. A or 2', '1-20', 'A-Z', 'Must match sector name exactly'
    ]
    const csv = [headers, example, note].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'mumineen_sample.csv'; a.click()
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportError(''); setImportSuccess('')
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase())
    const rows = lines.slice(1).map(line => {
      const values = line.replace(/"/g, '').split(',').map(v => v.trim())
      const obj: any = {}; headers.forEach((h, i) => { obj[h] = values[i] || null }); return obj
    }).filter(r => (r['sf#'] || r['full name']) && !r['sf#']?.startsWith('e.g') && !r['full name']?.startsWith('YYYY'))
    if (rows.length === 0) { setImportError('No valid rows found.'); setImporting(false); return }
    const payload = rows.map(r => {
      const houseType = r['house type'] || ''; const num = r['number'] || ''
      const cat = r['category (a-z)'] || ''; const floor = r['floor'] || ''
      const block = r['block'] || ''; const sectorName = r['sector name'] || ''
      const sectorMatch = sectors.find(s => s.name.toLowerCase() === sectorName.toLowerCase())
      const fullAddress = buildAddress(houseType, num, cat, floor, block, sectorName)
      const catMatch = categories.find(c => c.name.toLowerCase() === (r['mumin category'] || '').toLowerCase())
      return {
        sf_no: r['sf#'] || null, its_no: r['its#'] || null, full_name: r['full name'] || '',
        phone_no: r['phone'] || null, whatsapp_no: r['whatsapp'] || null,
        email: r['email'] || null, dob: r['date of birth'] || null, remarks: r['remarks'] || null,
        full_address: fullAddress || null, address_sector_id: sectorMatch?.id || null,
        mumin_category_id: isAdmin ? (catMatch?.id || null) : null,
        is_hof: true, hof_id: null, status: 'active', niyyat_status_id: noShowId || null,
      }
    })
    const { error } = await supabase.from('mumineen').insert(payload)
    if (error) { setImportError(error.message) } else { setImportSuccess(`Imported ${payload.length} records.`); await fetchAll() }
    setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const filtered = mumineen.filter(m => {
    const matchesSearch = search === '' || m.full_name?.toLowerCase().includes(search.toLowerCase()) || m.sf_no?.toLowerCase().includes(search.toLowerCase()) || m.its_no?.toLowerCase().includes(search.toLowerCase())
    const matchesSector = sectorFilter === '' || String(m.address_sector_id) === sectorFilter
    const matchesNiyyat = niyyatFilter === '' || String(m.niyyat_status_id) === niyyatFilter
    const matchesCategory = categoryFilter === '' || String(m.mumin_category_id) === categoryFilter
    return matchesSearch && matchesSector && matchesNiyyat && matchesCategory
  })
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const addressPreview = getFullAddress()

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-3">
        <div>
          <h4 className="mb-0" style={{ color: 'var(--bs-body-color)' }}>Mumineen</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>All Mumineen — {mumineen.length} total</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-secondary btn-sm" onClick={handleSample}><i className="bi bi-file-earmark-arrow-down me-1" />Sample</button>
          <button className="btn btn-outline-success btn-sm" onClick={() => fileInputRef.current?.click()} disabled={importing}><i className="bi bi-upload me-1" />{importing ? 'Importing...' : 'Import'}</button>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-outline-primary btn-sm" onClick={handleExport}><i className="bi bi-download me-1" />Export</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><i className="bi bi-plus me-1" />Add Mumin</button>
        </div>
      </div>

      {importError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: '13px' }}>{importError}</div>}
      {importSuccess && <div className="alert alert-success py-2 mb-3" style={{ fontSize: '13px' }}>{importSuccess}</div>}

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">

          {/* Filters — category filter only for admins */}
          <div className="d-flex gap-2 mb-3 flex-wrap">
            <input type="text" className="form-control form-control-sm" placeholder="Search name, SF#, ITS#..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '220px' }} />
            <select className="form-select form-select-sm" value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} style={{ maxWidth: '180px' }}>
              <option value="">All Sectors</option>
              {sectors.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
            {isAdmin && (
              <select className="form-select form-select-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ maxWidth: '160px' }}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            )}
            <select className="form-select form-select-sm" value={niyyatFilter} onChange={e => setNiyyatFilter(e.target.value)} style={{ maxWidth: '160px' }}>
              <option value="">All Niyyat Status</option>
              {niyyatStatuses.map(n => <option key={n.id} value={String(n.id)}>{n.name}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {/* Category column only for admins */}
                      {['SF#', 'ITS#', 'Full Name', 'Phone', 'WhatsApp', 'Address', 'Sector', 'Niyyat Status', ...(isAdmin ? ['Category'] : []), ''].map(h => (
                        <th key={h} style={{ fontSize: '12px', color: 'var(--bs-secondary-color)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(m => {
                      const cat = getCategoryById(m.mumin_category_id)
                      return (
                        <tr key={m.id}>
                          <td>{m.sf_no}</td>
                          <td>{m.its_no || '—'}</td>
                          <td style={{ fontWeight: 500 }}>{m.full_name}</td>
                          <td>{m.phone_no || '—'}</td>
                          <td>{m.whatsapp_no || '—'}</td>
                          <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.full_address || ''}>{m.full_address || '—'}</td>
                          <td>{getSectorName(m.address_sector_id)}</td>
                          <td><span className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: '11px' }}>{getNiyyatName(m.niyyat_status_id)}</span></td>
                          {/* Category cell — admin only */}
                          {isAdmin && (
                            <td>
                              {cat
                                ? <span className="badge" style={{ backgroundColor: cat.colour + '22', color: cat.colour, border: `1px solid ${cat.colour}44`, fontWeight: 600, fontSize: '11px' }}>{cat.name}</span>
                                : '—'}
                            </td>
                          )}
                          <td>
                            <div className="d-flex gap-1 justify-content-end">
                              <button className="btn btn-sm" title="View" style={{ padding: '2px 7px', color: '#299cdb' }} onClick={() => router.push(`/mumineen/${m.id}`)}><i className="bi bi-eye" /></button>
                              <button className="btn btn-sm" title="Edit" style={{ padding: '2px 7px', color: '#364574' }} onClick={() => openEdit(m)}><i className="bi bi-pencil" /></button>
                              <button className="btn btn-sm" title="Delete" style={{ padding: '2px 7px', color: '#dc3545' }} onClick={() => setShowDeleteConfirm(m)}><i className="bi bi-trash" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {paginated.length === 0 && <tr><td colSpan={isAdmin ? 10 : 9} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>No mumineen found</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-3">
                <small style={{ color: 'var(--bs-secondary-color)' }}>Showing {paginated.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} records</small>
                {totalPages > 1 && (
                  <nav>
                    <ul className="pagination pagination-sm mb-0">
                      <li className={`page-item ${page === 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => setPage(1)}>«</button></li>
                      <li className={`page-item ${page === 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => setPage(p => p - 1)}>‹</button></li>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .reduce<(number | string)[]>((acc, p, i, arr) => { if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...'); acc.push(p); return acc }, [])
                        .map((p, i) => p === '...'
                          ? <li key={`e${i}`} className="page-item disabled"><span className="page-link">…</span></li>
                          : <li key={p} className={`page-item ${page === p ? 'active' : ''}`}><button className="page-link" onClick={() => setPage(p as number)}>{p}</button></li>
                        )}
                      <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}><button className="page-link" onClick={() => setPage(p => p + 1)}>›</button></li>
                      <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}><button className="page-link" onClick={() => setPage(totalPages)}>»</button></li>
                    </ul>
                  </nav>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <Modal onClose={() => setShowDeleteConfirm(null)} size="modal-sm">
          <div className="modal-header border-0 pb-0">
            <h6 className="modal-title text-danger"><i className="bi bi-exclamation-triangle me-2" />Delete Mumin</h6>
            <button className="btn-close" onClick={() => setShowDeleteConfirm(null)} />
          </div>
          <div className="modal-body" style={{ fontSize: '13px' }}>
            Permanently delete <strong>{showDeleteConfirm.full_name}</strong> (SF# {showDeleteConfirm.sf_no})? This cannot be undone.
          </div>
          <div className="modal-footer border-0 pt-0">
            <button className="btn btn-light btn-sm" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
          </div>
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} size="modal-lg">
          <div className="modal-header">
            <h5 className="modal-title">{editing ? 'Edit Mumin' : 'Add Mumin (HOF)'}</h5>
            <button className="btn-close" onClick={() => setShowModal(false)} />
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {saveError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{saveError}</div>}

            <p className="mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, color: 'var(--bs-secondary-color)' }}>Personal Information</p>
            <div className="row g-3 mb-4">
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>SF# *</label>
                <input type="text" className="form-control form-control-sm" placeholder="e.g. 1234" value={form.sf_no} onChange={e => setForm({ ...form, sf_no: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>ITS#</label>
                <input type="text" className="form-control form-control-sm" placeholder="e.g. 40000001" value={form.its_no} onChange={e => setForm({ ...form, its_no: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Full Name *</label>
                <input type="text" className="form-control form-control-sm" placeholder="Enter full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Date of Birth</label>
                <input type="date" className="form-control form-control-sm" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Phone No</label>
                <input type="text" className="form-control form-control-sm" placeholder="+923001234567" value={form.phone_no} onChange={e => setForm({ ...form, phone_no: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>WhatsApp No</label>
                <input type="text" className="form-control form-control-sm" placeholder="+923001234567" value={form.whatsapp_no} onChange={e => setForm({ ...form, whatsapp_no: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: '13px' }}>Email</label>
                <input type="email" className="form-control form-control-sm" placeholder="email@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              {/* Mumin Category — admin only */}
              {isAdmin && (
                <div className="col-6">
                  <label className="form-label" style={{ fontSize: '13px' }}>
                    Mumin Category
                    <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '10px', verticalAlign: 'middle' }}>Admin</span>
                  </label>
                  <select className="form-select form-select-sm" value={form.mumin_category_id} onChange={e => setForm({ ...form, mumin_category_id: e.target.value })}>
                    <option value="">— Select Category —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="col-12">
                <label className="form-label" style={{ fontSize: '13px' }}>Remarks</label>
                <textarea className="form-control form-control-sm" rows={2} placeholder="Any remarks..." value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>

            <p className="mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, color: 'var(--bs-secondary-color)' }}>Address</p>
            <div className="row g-3">
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>House Type</label>
                <select className="form-select form-select-sm" value={form.house_type} onChange={e => setForm({ ...form, house_type: e.target.value })}>
                  <option value="">— Select —</option>
                  {HOUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Number</label>
                <input type="text" className="form-control form-control-sm" placeholder="e.g. 4" value={form.addr_number} onChange={e => setForm({ ...form, addr_number: e.target.value })} />
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Category (A–Z)</label>
                <input type="text" className="form-control form-control-sm" placeholder="e.g. A or 2" value={form.addr_cat} onChange={e => setForm({ ...form, addr_cat: e.target.value })} maxLength={5} />
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Floor</label>
                <select className="form-select form-select-sm" value={form.addr_floor} onChange={e => setForm({ ...form, addr_floor: e.target.value })}>
                  <option value="">— Select —</option>
                  {FLOORS.map(f => <option key={f} value={f}>{ordinal(f)}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Block</label>
                <select className="form-select form-select-sm" value={form.addr_block} onChange={e => setForm({ ...form, addr_block: e.target.value })}>
                  <option value="">— Select —</option>
                  {BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label" style={{ fontSize: '13px' }}>Sector</label>
                <select className="form-select form-select-sm" value={form.address_sector_id} onChange={e => setForm({ ...form, address_sector_id: e.target.value })}>
                  <option value="">— Select Sector —</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label" style={{ fontSize: '13px' }}>Full Address</label>
                <div style={{ background: 'var(--bs-secondary-bg)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: addressPreview ? '#364574' : 'var(--bs-secondary-color)', borderLeft: `3px solid ${addressPreview ? '#ffbf69' : 'var(--bs-border-color)'}`, minHeight: '36px', lineHeight: '20px' }}>
                  {addressPreview || 'Fill in the fields above to generate address…'}
                </div>
              </div>
            </div>

            {!editing && (
              <div className="mt-3">
                <small style={{ color: 'var(--bs-secondary-color)' }}><i className="bi bi-info-circle me-1" />Niyyat status will be set to <strong>No-Show</strong> by default.</small>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}