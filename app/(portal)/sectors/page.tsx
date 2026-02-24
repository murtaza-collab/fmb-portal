'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Sector {
  id: number
  name: string
  status: string
}

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSector, setEditingSector] = useState<Sector | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchSectors() }, [])

  const fetchSectors = async () => {
    setLoading(true)
    const { data } = await supabase.from('house_sectors').select('*').order('name')
    setSectors(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditingSector(null); setName(''); setShowModal(true) }
  const openEdit = (sector: Sector) => { setEditingSector(sector); setName(sector.name); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    if (editingSector) {
      await supabase.from('house_sectors').update({ name: name.trim() }).eq('id', editingSector.id)
    } else {
      await supabase.from('house_sectors').insert({ name: name.trim() })
    }
    await fetchSectors()
    setShowModal(false)
    setSaving(false)
  }

  const toggleStatus = async (sector: Sector) => {
    await supabase.from('house_sectors').update({ status: sector.status === 'active' ? 'inactive' : 'active' }).eq('id', sector.id)
    await fetchSectors()
  }

  const filtered = sectors.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Sectors</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Manage delivery sectors</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Sector</button>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <div className="mb-3">
            <input type="text" className="form-control" placeholder="Search sectors..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: '300px', width: '100%' }} />
          </div>

          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    {['#', 'Sector Name', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sector, i) => (
                    <tr key={sector.id}>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                      <td style={{ fontSize: '14px' }}>{sector.name}</td>
                      <td>
                        <span className={`badge ${sector.status === 'active' ? 'bg-success' : 'bg-secondary'}`}
                          style={{ fontSize: '11px' }}>{sector.status}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-outline-primary me-2"
                          style={{ fontSize: '12px' }} onClick={() => openEdit(sector)}>Edit</button>
                        <button className={`btn btn-sm ${sector.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                          style={{ fontSize: '12px' }} onClick={() => toggleStatus(sector)}>
                          {sector.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-muted py-4">No sectors found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2"><small className="text-muted">{filtered.length} sectors</small></div>
        </div>
      </div>

      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingSector ? 'Edit Sector' : 'Add Sector'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Sector Name</label>
                <input type="text" className="form-control" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. AHMED MARKET SF-12" autoFocus />
              </div>
              <div className="modal-footer">
                <button className="btn btn-light" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
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