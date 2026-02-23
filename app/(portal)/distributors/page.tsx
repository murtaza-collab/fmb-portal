'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Distributor {
  id: number
  full_name: string
  username: string
  sabeel_no: string
  its_no: string
  phone_no: string
  whatsapp_no: string
  address: string
  status: string
}

interface Sector {
  id: number
  name: string
}

export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showSectorModal, setShowSectorModal] = useState(false)
  const [editing, setEditing] = useState<Distributor | null>(null)
  const [selectedDistributor, setSelectedDistributor] = useState<Distributor | null>(null)
  const [assignedSectors, setAssignedSectors] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    full_name: '', username: '', sabeel_no: '',
    its_no: '', phone_no: '', whatsapp_no: '', address: ''
  })

  useEffect(() => {
    fetchDistributors()
    fetchSectors()
  }, [])

  const fetchDistributors = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('distributors')
      .select('*')
      .order('full_name')
    setDistributors(data || [])
    setLoading(false)
  }

  const fetchSectors = async () => {
    const { data } = await supabase
      .from('house_sectors')
      .select('*')
      .eq('status', 'active')
      .order('name')
    setSectors(data || [])
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ full_name: '', username: '', sabeel_no: '', its_no: '', phone_no: '', whatsapp_no: '', address: '' })
    setShowModal(true)
  }

  const openEdit = (d: Distributor) => {
    setEditing(d)
    setForm({
      full_name: d.full_name || '', username: d.username || '',
      sabeel_no: d.sabeel_no || '', its_no: d.its_no || '',
      phone_no: d.phone_no || '', whatsapp_no: d.whatsapp_no || '',
      address: d.address || ''
    })
    setShowModal(true)
  }

  const openSectors = async (d: Distributor) => {
    setSelectedDistributor(d)
    const { data } = await supabase
      .from('distributor_sectors')
      .select('sector_id')
      .eq('distributor_id', d.id)
    setAssignedSectors((data || []).map((r: any) => r.sector_id))
    setShowSectorModal(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.username.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('distributors').update(form).eq('id', editing.id)
    } else {
      await supabase.from('distributors').insert(form)
    }
    await fetchDistributors()
    setShowModal(false)
    setSaving(false)
  }

  const toggleSector = (sectorId: number) => {
    setAssignedSectors(prev =>
      prev.includes(sectorId) ? prev.filter(id => id !== sectorId) : [...prev, sectorId]
    )
  }

  const saveSectors = async () => {
    if (!selectedDistributor) return
    setSaving(true)
    await supabase.from('distributor_sectors').delete().eq('distributor_id', selectedDistributor.id)
    if (assignedSectors.length > 0) {
      await supabase.from('distributor_sectors').insert(
        assignedSectors.map(sector_id => ({ distributor_id: selectedDistributor.id, sector_id }))
      )
    }
    setShowSectorModal(false)
    setSaving(false)
  }

  const toggleStatus = async (d: Distributor) => {
    const newStatus = d.status === 'active' ? 'inactive' : 'active'
    await supabase.from('distributors').update({ status: newStatus }).eq('id', d.id)
    await fetchDistributors()
  }

  const filtered = distributors.filter(d =>
    d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0">Distributors</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Manage delivery distributors</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Distributor</button>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <div className="mb-3">
            <input type="text" className="form-control" placeholder="Search distributors..."
              value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: '300px' }} />
          </div>

          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <table className="table table-hover mb-0">
              <thead style={{ background: '#f8f9fa' }}>
                <tr>
                  {['#', 'Full Name', 'Username', 'Sabeel No', 'Phone', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                    <td style={{ fontSize: '14px' }}>{d.full_name}</td>
                    <td style={{ fontSize: '13px' }}>{d.username}</td>
                    <td style={{ fontSize: '13px' }}>{d.sabeel_no || '—'}</td>
                    <td style={{ fontSize: '13px' }}>{d.phone_no || '—'}</td>
                    <td>
                      <span className={`badge ${d.status === 'active' ? 'bg-success' : 'bg-secondary'}`}
                        style={{ fontSize: '11px' }}>{d.status}</span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary me-1"
                        style={{ fontSize: '12px' }} onClick={() => openEdit(d)}>Edit</button>
                      <button className="btn btn-sm btn-outline-info me-1"
                        style={{ fontSize: '12px' }} onClick={() => openSectors(d)}>Sectors</button>
                      <button className={`btn btn-sm ${d.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                        style={{ fontSize: '12px' }} onClick={() => toggleStatus(d)}>
                        {d.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted py-4">No distributors found</td></tr>
                )}
              </tbody>
            </table>
          )}
          <div className="mt-2"><small className="text-muted">{filtered.length} distributors</small></div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Distributor' : 'Add Distributor'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  {[
                    { label: 'Full Name *', key: 'full_name', placeholder: 'Enter full name' },
                    { label: 'Username *', key: 'username', placeholder: 'Enter username' },
                    { label: 'Sabeel No', key: 'sabeel_no', placeholder: 'Enter sabeel number' },
                    { label: 'ITS No', key: 'its_no', placeholder: 'Enter ITS number' },
                    { label: 'Phone No', key: 'phone_no', placeholder: 'Enter phone number' },
                    { label: 'WhatsApp No', key: 'whatsapp_no', placeholder: 'Enter WhatsApp number' },
                  ].map(field => (
                    <div key={field.key} className="col-6">
                      <label className="form-label" style={{ fontSize: '13px' }}>{field.label}</label>
                      <input type="text" className="form-control form-control-sm"
                        placeholder={field.placeholder}
                        value={(form as any)[field.key]}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
                    </div>
                  ))}
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Address</label>
                    <input type="text" className="form-control form-control-sm"
                      placeholder="Enter address"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

      {/* Assign Sectors Modal */}
      {showSectorModal && selectedDistributor && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Assign Sectors — {selectedDistributor.full_name}</h5>
                <button className="btn-close" onClick={() => setShowSectorModal(false)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
                  {assignedSectors.length} sector(s) selected
                </p>
                <div className="row g-2">
                  {sectors.map(sector => (
                    <div key={sector.id} className="col-6">
                      <div
                        onClick={() => toggleSector(sector.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          background: assignedSectors.includes(sector.id) ? '#364574' : '#f8f9fa',
                          color: assignedSectors.includes(sector.id) ? '#fff' : '#333',
                          border: `1px solid ${assignedSectors.includes(sector.id) ? '#364574' : '#dee2e6'}`,
                        }}
                      >
                        {assignedSectors.includes(sector.id) ? '✓ ' : ''}{sector.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowSectorModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={saveSectors} disabled={saving}>
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