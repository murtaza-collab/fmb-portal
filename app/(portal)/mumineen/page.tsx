'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Mumin {
  id: number
  sf_no: string
  its_no: string
  full_name: string
  phone_no: string
  whatsapp_no: string
  status: string
  is_hof: boolean
  hof_id: number | null
  address_sector_id: number | null
  niyyat_status_id: number | null
}

interface Sector {
  id: number
  name: string
}

interface NiyyatStatus {
  id: number
  name: string
}

export default function MumineenPage() {
  const router = useRouter()
  const [mumineen, setMumineen] = useState<Mumin[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Mumin | null>(null)
  const [search, setSearch] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const emptyForm = {
    sf_no: '', its_no: '', full_name: '',
    phone_no: '', whatsapp_no: '',
    address_sector_id: '' as string | number,
    niyyat_status_id: '' as string | number,
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [mumineenRes, sectorsRes, niyyatRes] = await Promise.all([
      supabase
        .from('mumineen')
        .select('id, sf_no, its_no, full_name, phone_no, whatsapp_no, status, is_hof, hof_id, address_sector_id, niyyat_status_id')
        .eq('is_hof', true)
        .order('sf_no'),
      supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name'),
      supabase.from('niyyat_statuses').select('id, name').order('name'),
    ])

    if (mumineenRes.error) console.error('Mumineen fetch error:', mumineenRes.error)
    setMumineen((mumineenRes.data as any[]) || [])
    setSectors(sectorsRes.data || [])
    setNiyyatStatuses(niyyatRes.data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setSaveError('')
    setShowModal(true)
  }

  const openEdit = (m: Mumin) => {
    setEditing(m)
    setForm({
      sf_no: m.sf_no || '',
      its_no: m.its_no || '',
      full_name: m.full_name || '',
      phone_no: m.phone_no || '',
      whatsapp_no: m.whatsapp_no || '',
      address_sector_id: m.address_sector_id || '',
      niyyat_status_id: m.niyyat_status_id || '',
    })
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.sf_no.trim()) {
      setSaveError('SF# and Full Name are required.')
      return
    }
    setSaving(true)
    setSaveError('')

    const payload = {
      sf_no: form.sf_no.trim(),
      its_no: form.its_no.trim() || null,
      full_name: form.full_name.trim(),
      phone_no: form.phone_no.trim() || null,
      whatsapp_no: form.whatsapp_no.trim() || null,
      address_sector_id: form.address_sector_id || null,
      niyyat_status_id: form.niyyat_status_id || null,
      is_hof: true,
      hof_id: null,
      status: 'active',
    }

    let error
    if (editing) {
      const res = await supabase.from('mumineen').update(payload).eq('id', editing.id)
      error = res.error
    } else {
      const res = await supabase.from('mumineen').insert(payload)
      error = res.error
    }

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    await fetchAll()
    setShowModal(false)
    setSaving(false)
  }

  const toggleStatus = async (m: Mumin) => {
    const newStatus = m.status === 'active' ? 'inactive' : 'active'
    await supabase.from('mumineen').update({ status: newStatus }).eq('id', m.id)
    await fetchAll()
  }

  const getSectorName = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getNiyyatName = (id: number | null) => niyyatStatuses.find(n => n.id === id)?.name || '—'

  const filtered = mumineen.filter(m => {
    const matchesSearch =
      search === '' ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.sf_no?.toLowerCase().includes(search.toLowerCase()) ||
      m.its_no?.toLowerCase().includes(search.toLowerCase())
    const matchesSector =
      sectorFilter === '' ||
      String(m.address_sector_id) === sectorFilter
    return matchesSearch && matchesSector
  })

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0">Mumineen</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Heads of Family list</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Mumin</button>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">

          <div className="d-flex gap-2 mb-3 flex-wrap">
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, SF# or ITS#..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
            <select
              className="form-select"
              value={sectorFilter}
              onChange={e => setSectorFilter(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="">All Sectors</option>
              {sectors.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-4">
              <div className="spinner-border spinner-border-sm text-primary" />
            </div>
          ) : (
            <table className="table table-hover mb-0">
              <thead style={{ background: '#f8f9fa' }}>
                <tr>
                  {['#', 'SF#', 'ITS#', 'Full Name', 'Sector', 'WhatsApp', 'Niyyat Status', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                    <td style={{ fontSize: '14px', fontWeight: 500 }}>{m.sf_no}</td>
                    <td style={{ fontSize: '13px' }}>{m.its_no || '—'}</td>
                    <td style={{ fontSize: '14px' }}>{m.full_name}</td>
                    <td style={{ fontSize: '13px' }}>{getSectorName(m.address_sector_id)}</td>
                    <td style={{ fontSize: '13px' }}>{m.whatsapp_no || '—'}</td>
                    <td>
                      <span className="badge bg-primary" style={{ fontSize: '11px' }}>
                        {getNiyyatName(m.niyyat_status_id)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${m.status === 'active' ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '11px' }}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-info me-1"
                        style={{ fontSize: '12px' }}
                        onClick={() => router.push(`/mumineen/${m.id}`)}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-sm btn-outline-primary me-1"
                        style={{ fontSize: '12px' }}
                        onClick={() => openEdit(m)}
                      >
                        Edit
                      </button>
                      <button
                        className={`btn btn-sm ${m.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                        style={{ fontSize: '12px' }}
                        onClick={() => toggleStatus(m)}
                      >
                        {m.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted py-4">No mumineen found</td></tr>
                )}
              </tbody>
            </table>
          )}
          <div className="mt-2"><small className="text-muted">{filtered.length} records</small></div>
        </div>
      </div>

      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Mumin' : 'Add Mumin (HOF)'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {saveError && (
                  <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{saveError}</div>
                )}
                <div className="row g-3">
                  {[
                    { label: 'SF# *', key: 'sf_no', placeholder: 'e.g. 1234' },
                    { label: 'ITS#', key: 'its_no', placeholder: 'e.g. 30000001' },
                    { label: 'Full Name *', key: 'full_name', placeholder: 'Enter full name' },
                    { label: 'Phone No', key: 'phone_no', placeholder: 'e.g. 03001234567' },
                    { label: 'WhatsApp No', key: 'whatsapp_no', placeholder: 'e.g. 03001234567' },
                  ].map(field => (
                    <div key={field.key} className="col-6">
                      <label className="form-label" style={{ fontSize: '13px' }}>{field.label}</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder={field.placeholder}
                        value={(form as any)[field.key]}
                        onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      />
                    </div>
                  ))}

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Sector</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.address_sector_id}
                      onChange={e => setForm({ ...form, address_sector_id: e.target.value })}
                    >
                      <option value="">— Select Sector —</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Niyyat Status</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.niyyat_status_id}
                      onChange={e => setForm({ ...form, niyyat_status_id: e.target.value })}
                    >
                      <option value="">— Select Status —</option>
                      {niyyatStatuses.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
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