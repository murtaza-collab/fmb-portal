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
  address_block_id: number | null
  address_type_id: number | null
  address_number: string
  address_floor: string
  full_address: string
  niyyat_status_id: number | null
  total_adult: number
  total_child: number
  total_infant: number
  remarks: string
}

interface Sector { id: number; name: string }
interface NiyyatStatus { id: number; name: string }

export default function MuminDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [hof, setHof] = useState<Mumin | null>(null)
  const [family, setFamily] = useState<Mumin[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [loading, setLoading] = useState(true)

  // Add family member modal
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editingMember, setEditingMember] = useState<Mumin | null>(null)

  const emptyForm = { sf_no: '', its_no: '', full_name: '', phone_no: '', whatsapp_no: '' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    const [hofRes, familyRes, sectorsRes, niyyatRes] = await Promise.all([
      supabase.from('mumineen').select('*').eq('id', id).single(),
      supabase.from('mumineen').select('*').eq('hof_id', id).order('full_name'),
      supabase.from('house_sectors').select('id, name').order('name'),
      supabase.from('niyyat_statuses').select('id, name').order('name'),
    ])
    setHof(hofRes.data)
    setFamily(familyRes.data || [])
    setSectors(sectorsRes.data || [])
    setNiyyatStatuses(niyyatRes.data || [])
    setLoading(false)
  }

  const getSectorName = (id: number | null) => sectors.find(s => s.id === id)?.name || '—'
  const getNiyyatName = (id: number | null) => niyyatStatuses.find(n => n.id === id)?.name || '—'

  const openAddMember = () => {
    setEditingMember(null)
    setForm(emptyForm)
    setSaveError('')
    setShowModal(true)
  }

  const openEditMember = (m: Mumin) => {
    setEditingMember(m)
    setForm({
      sf_no: m.sf_no || '',
      its_no: m.its_no || '',
      full_name: m.full_name || '',
      phone_no: m.phone_no || '',
      whatsapp_no: m.whatsapp_no || '',
    })
    setSaveError('')
    setShowModal(true)
  }

  const handleSaveMember = async () => {
    if (!form.full_name.trim()) {
      setSaveError('Full Name is required.')
      return
    }
    setSaving(true)
    setSaveError('')

    const payload = {
      sf_no: form.sf_no.trim() || null,
      its_no: form.its_no.trim() || null,
      full_name: form.full_name.trim(),
      phone_no: form.phone_no.trim() || null,
      whatsapp_no: form.whatsapp_no.trim() || null,
      hof_id: Number(id),
      is_hof: false,
      status: 'active',
    }

    let error
    if (editingMember) {
      const res = await supabase.from('mumineen').update(payload).eq('id', editingMember.id)
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

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" />
    </div>
  )

  if (!hof) return (
    <div className="alert alert-danger">Mumin not found.</div>
  )

  return (
    <div>
      {/* Back button + header */}
      <div className="d-flex align-items-center gap-3 mb-4">
        <button className="btn btn-light btn-sm" onClick={() => router.push('/mumineen')}>
          ← Back
        </button>
        <div>
          <h4 className="mb-0">{hof.full_name}</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>SF# {hof.sf_no} · Head of Family</p>
        </div>
        <div className="ms-auto">
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => router.push(`/mumineen/${id}/edit`)}
          >
            Edit HOF
          </button>
        </div>
      </div>

      {/* HOF Info Card */}
      <div className="card mb-4" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <h6 className="text-muted mb-3" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Personal Information
          </h6>
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
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{value || '—'}</div>
              </div>
            ))}
          </div>

          {/* Family counts */}
          <hr className="my-3" />
          <div className="d-flex gap-4">
            <div className="text-center">
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#364574' }}>{hof.total_adult || 0}</div>
              <div style={{ fontSize: '11px', color: '#6c757d' }}>Adults</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#364574' }}>{hof.total_child || 0}</div>
              <div style={{ fontSize: '11px', color: '#6c757d' }}>Children</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#364574' }}>{hof.total_infant || 0}</div>
              <div style={{ fontSize: '11px', color: '#6c757d' }}>Infants</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#364574' }}>{family.length}</div>
              <div style={{ fontSize: '11px', color: '#6c757d' }}>Family Members</div>
            </div>
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

          <table className="table table-hover mb-0">
            <thead style={{ background: '#f8f9fa' }}>
              <tr>
                {['#', 'SF#', 'ITS#', 'Full Name', 'Phone', 'WhatsApp', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {family.map((m, i) => (
                <tr key={m.id}>
                  <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                  <td style={{ fontSize: '13px' }}>{m.sf_no || '—'}</td>
                  <td style={{ fontSize: '13px' }}>{m.its_no || '—'}</td>
                  <td style={{ fontSize: '14px' }}>{m.full_name}</td>
                  <td style={{ fontSize: '13px' }}>{m.phone_no || '—'}</td>
                  <td style={{ fontSize: '13px' }}>{m.whatsapp_no || '—'}</td>
                  <td>
                    <span className={`badge ${m.status === 'active' ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '11px' }}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }} onClick={() => openEditMember(m)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {family.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted py-4">No family members added yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Family Member Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingMember ? 'Edit Member' : 'Add Family Member'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {saveError && (
                  <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{saveError}</div>
                )}
                <div className="row g-3">
                  {[
                    { label: 'SF#', key: 'sf_no', placeholder: 'e.g. 1234' },
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
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveMember} disabled={saving}>
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