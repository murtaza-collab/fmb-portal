'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Distributor {
  id: number
  full_name: string
  username: string
  phone_no: string
  status: string
}

interface Sector { id: number; name: string }

export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [sectors, setSectors]           = useState<Sector[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [showSectorModal, setShowSectorModal] = useState(false)
  const [editing, setEditing]           = useState<Distributor | null>(null)
  const [selectedDist, setSelectedDist] = useState<Distributor | null>(null)
  const [assignedSectors, setAssignedSectors] = useState<number[]>([])
  const [search, setSearch]             = useState('')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')

  // Form — only required fields + sector assignment inline on add
  const [form, setForm] = useState({ full_name: '', phone_no: '' })
  const [formSectors, setFormSectors] = useState<number[]>([])

  useEffect(() => { fetchDistributors(); fetchSectors() }, [])

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 2000) }
  }

  const fetchDistributors = async () => {
    setLoading(true)
    const { data } = await supabase.from('distributors').select('id, full_name, username, phone_no, status').order('full_name')
    setDistributors(data || [])
    setLoading(false)
  }

  const fetchSectors = async () => {
    const { data } = await supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name')
    setSectors(data || [])
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ full_name: '', phone_no: '' })
    setFormSectors([])
    setShowModal(true)
  }

  const openEdit = async (d: Distributor) => {
    setEditing(d)
    setForm({ full_name: d.full_name || '', phone_no: d.phone_no || '' })
    // Load existing sector assignments
    const { data } = await supabase.from('distributor_sectors').select('sector_id').eq('distributor_id', d.id)
    setFormSectors((data || []).map((r: any) => r.sector_id))
    setShowModal(true)
  }

  const openSectors = async (d: Distributor) => {
    setSelectedDist(d)
    const { data } = await supabase.from('distributor_sectors').select('sector_id').eq('distributor_id', d.id)
    setAssignedSectors((data || []).map((r: any) => r.sector_id))
    setShowSectorModal(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) return showMsg('Full name is required', true)
    setSaving(true)
    try {
      if (editing) {
        // Update distributor
        const { error: ue } = await supabase.from('distributors')
          .update({ full_name: form.full_name.trim(), phone_no: form.phone_no.trim() || null })
          .eq('id', editing.id)
        if (ue) throw ue
        // Update sectors
        await supabase.from('distributor_sectors').delete().eq('distributor_id', editing.id)
        if (formSectors.length > 0) {
          await supabase.from('distributor_sectors').insert(
            formSectors.map(sector_id => ({ distributor_id: editing.id, sector_id }))
          )
        }
        showMsg('Distributor updated')
      } else {
        // Insert distributor — username defaults to full_name
        const { data: newDist, error: ie } = await supabase.from('distributors')
          .insert({ full_name: form.full_name.trim(), username: form.full_name.trim(), phone_no: form.phone_no.trim() || null, status: 'active' })
          .select('id').single()
        if (ie) throw ie
        // Assign sectors
        if (formSectors.length > 0) {
          await supabase.from('distributor_sectors').insert(
            formSectors.map(sector_id => ({ distributor_id: newDist.id, sector_id }))
          )
        }
        showMsg('Distributor added')
      }
      await fetchDistributors()
      setShowModal(false)
    } catch (err: any) {
      showMsg(err.message || 'Save failed', true)
    } finally {
      setSaving(false)
    }
  }

  const saveSectors = async () => {
    if (!selectedDist) return
    setSaving(true)
    await supabase.from('distributor_sectors').delete().eq('distributor_id', selectedDist.id)
    if (assignedSectors.length > 0) {
      await supabase.from('distributor_sectors').insert(
        assignedSectors.map(sector_id => ({ distributor_id: selectedDist.id, sector_id }))
      )
    }
    showMsg('Sectors updated')
    setShowSectorModal(false)
    setSaving(false)
  }

  const toggleStatus = async (d: Distributor) => {
    const newStatus = d.status === 'active' ? 'inactive' : 'active'
    await supabase.from('distributors').update({ status: newStatus }).eq('id', d.id)
    await fetchDistributors()
  }

  const handleDelete = async (d: Distributor) => {
    // Check if distributor has sector assignments
    const { data: sectorAssignments } = await supabase
      .from('distributor_sectors').select('id').eq('distributor_id', d.id)
    if ((sectorAssignments || []).length > 0) {
      showMsg(`Cannot delete — ${d.full_name} has ${sectorAssignments!.length} sector(s) assigned. Remove sectors first.`, true)
      return
    }
    // Check if distributor has thaali registrations
    const { count: regCount } = await supabase
      .from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('distributor_id', d.id)
    if ((regCount || 0) > 0) {
      showMsg(`Cannot delete — ${d.full_name} has ${regCount} thaali registration(s) assigned.`, true)
      return
    }
    if (!confirm(`Delete ${d.full_name}? This cannot be undone.`)) return
    const { error } = await supabase.from('distributors').delete().eq('id', d.id)
    if (error) return showMsg('Delete failed: ' + error.message, true)
    showMsg('Distributor deleted')
    await fetchDistributors()
  }

  const toggleFormSector = (id: number) =>
    setFormSectors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAssignedSector = (id: number) =>
    setAssignedSectors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const filtered = distributors.filter(d =>
    d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.phone_no?.includes(search)
  )

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Distributors</h4>
          <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>Manage delivery distributors</p>
        </div>
        <button className="btn btn-sm" onClick={openAdd}
          style={{ background: '#364574', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13 }}>
          <i className="bi bi-plus me-1" />Add Distributor
        </button>
      </div>

      {error   && <div className="alert alert-danger  py-2 px-3 mb-3" style={{ fontSize: 13 }}>{error}</div>}
      {success && <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: 13 }}>{success}</div>}

      <div className="card border-0 shadow-sm" style={{ borderRadius: 12, background: 'var(--bs-body-bg)' }}>
        <div className="card-body p-3">
          <div className="mb-3">
            <input type="text" className="form-control form-control-sm" placeholder="Search distributors..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 300, background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)', borderRadius: 8 }} />
          </div>

          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                  <tr>
                    {['#', 'Full Name', 'Phone', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: 11, color: 'var(--bs-secondary-color)', fontWeight: 600, whiteSpace: 'nowrap', padding: '10px 12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d, i) => (
                    <tr key={d.id}>
                      <td style={{ padding: '10px 12px', color: 'var(--bs-secondary-color)' }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--bs-body-color)' }}>{d.full_name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--bs-body-color)' }}>{d.phone_no || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="badge" style={{
                          fontSize: 11, fontWeight: 600,
                          background: d.status === 'active' ? '#0ab39c20' : 'var(--bs-secondary-bg)',
                          color: d.status === 'active' ? '#0ab39c' : 'var(--bs-secondary-color)',
                        }}>{d.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm me-1" onClick={() => openEdit(d)}
                          style={{ fontSize: 11, padding: '3px 10px', background: '#36457415', color: '#364574', border: 'none', borderRadius: 6 }}>
                          <i className="bi bi-pencil me-1" />Edit
                        </button>
                        <button className="btn btn-sm me-1" onClick={() => openSectors(d)}
                          style={{ fontSize: 11, padding: '3px 10px', background: '#299cdb15', color: '#299cdb', border: 'none', borderRadius: 6 }}>
                          <i className="bi bi-map me-1" />Sectors
                        </button>
                        <button className="btn btn-sm me-1" onClick={() => toggleStatus(d)}
                          style={{ fontSize: 11, padding: '3px 10px',
                            background: d.status === 'active' ? '#ffbf6915' : '#0ab39c15',
                            color: d.status === 'active' ? '#856404' : '#0ab39c',
                            border: 'none', borderRadius: 6 }}>
                          {d.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-sm" onClick={() => handleDelete(d)}
                          style={{ fontSize: 11, padding: '3px 10px', background: '#e6394615', color: '#e63946', border: 'none', borderRadius: 6 }}>
                          <i className="bi bi-trash me-1" />Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>No distributors found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2">
            <small style={{ color: 'var(--bs-secondary-color)' }}>{filtered.length} distributors</small>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}
          onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-lg" style={{ marginTop: 60 }} onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                  {editing ? 'Edit Distributor' : 'Add Distributor'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                <div className="row g-3 mb-4">
                  {/* Full Name */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label fw-semibold" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>
                      Full Name *
                    </label>
                    <input type="text" className="form-control" placeholder="Enter full name"
                      value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)', borderRadius: 8 }}
                      autoFocus />
                  </div>
                  {/* Phone */}
                  <div className="col-12 col-sm-6">
                    <label className="form-label fw-semibold" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>
                      Phone Number
                    </label>
                    <input type="text" className="form-control" placeholder="Enter phone number"
                      value={form.phone_no} onChange={e => setForm(f => ({ ...f, phone_no: e.target.value }))}
                      style={{ background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)', border: '1px solid var(--bs-border-color)', borderRadius: 8 }} />
                  </div>
                </div>

                {/* Sector Assignment */}
                <div>
                  <label className="form-label fw-semibold mb-2" style={{ fontSize: 13, color: 'var(--bs-body-color)' }}>
                    Assign Sectors
                    <span className="ms-2 badge" style={{ background: '#36457420', color: '#364574', fontSize: 11 }}>
                      {formSectors.length} selected
                    </span>
                  </label>
                  {sectors.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>No active sectors available</div>
                  ) : (
                    <div className="row g-2">
                      {sectors.map(s => {
                        const active = formSectors.includes(s.id)
                        return (
                          <div key={s.id} className="col-12 col-sm-6 col-md-4">
                            <div onClick={() => toggleFormSector(s.id)} style={{
                              padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                              background: active ? '#364574' : 'var(--bs-tertiary-bg)',
                              color: active ? '#fff' : 'var(--bs-body-color)',
                              border: `1px solid ${active ? '#364574' : 'var(--bs-border-color)'}`,
                              transition: 'all 0.15s',
                            }}>
                              {active ? <i className="bi bi-check-circle-fill me-2" /> : <i className="bi bi-circle me-2" style={{ opacity: 0.4 }} />}
                              {s.name}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)} style={{ borderRadius: 8 }}>Cancel</button>
                <button className="btn btn-sm" onClick={handleSave} disabled={saving || !form.full_name.trim()}
                  style={{ background: '#364574', color: '#fff', borderRadius: 8, fontWeight: 600 }}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving...</> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sectors Modal (from table action) */}
      {showSectorModal && selectedDist && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}
          onClick={() => setShowSectorModal(false)}>
          <div className="modal-dialog modal-lg" style={{ marginTop: 60 }} onClick={e => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12 }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                <h5 className="modal-title fw-bold" style={{ color: 'var(--bs-body-color)', fontSize: 15 }}>
                  Sectors — {selectedDist.full_name}
                </h5>
                <button className="btn-close" onClick={() => setShowSectorModal(false)} />
              </div>
              <div className="modal-body" style={{ background: 'var(--bs-body-bg)' }}>
                <p style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }} className="mb-3">
                  {assignedSectors.length} sector(s) selected
                </p>
                <div className="row g-2">
                  {sectors.map(s => {
                    const active = assignedSectors.includes(s.id)
                    return (
                      <div key={s.id} className="col-12 col-sm-6">
                        <div onClick={() => toggleAssignedSector(s.id)} style={{
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                          background: active ? '#364574' : 'var(--bs-tertiary-bg)',
                          color: active ? '#fff' : 'var(--bs-body-color)',
                          border: `1px solid ${active ? '#364574' : 'var(--bs-border-color)'}`,
                          transition: 'all 0.15s',
                        }}>
                          {active ? <i className="bi bi-check-circle-fill me-2" /> : <i className="bi bi-circle me-2" style={{ opacity: 0.4 }} />}
                          {s.name}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bs-border-color)' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowSectorModal(false)} style={{ borderRadius: 8 }}>Cancel</button>
                <button className="btn btn-sm" onClick={saveSectors} disabled={saving}
                  style={{ background: '#364574', color: '#fff', borderRadius: 8, fontWeight: 600 }}>
                  {saving ? 'Saving...' : 'Save Sectors'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}