// app/(portal)/thaali/types/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ThaaliType { id: number; name: string; status: string }

export default function ThaaliTypesPage() {
  const [types, setTypes] = useState<ThaaliType[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ThaaliType | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchTypes() }, [])

  const fetchTypes = async () => {
    setLoading(true)
    const { data } = await supabase.from('thaali_types').select('*').order('name')
    setTypes(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setName(''); setShowModal(true) }
  const openEdit = (t: ThaaliType) => { setEditing(t); setName(t.name); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('thaali_types').update({ name: name.trim() }).eq('id', editing.id)
    } else {
      await supabase.from('thaali_types').insert({ name: name.trim(), status: 'active' })
    }
    await fetchTypes(); setShowModal(false); setSaving(false)
  }

  const toggleStatus = async (t: ThaaliType) => {
    await supabase.from('thaali_types').update({ status: t.status === 'active' ? 'inactive' : 'active' }).eq('id', t.id)
    await fetchTypes()
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Thaali Types</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>e.g. Normal, Spicy, Chronic</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Type</button>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    {['#', 'Type Name', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {types.map((t, i) => (
                    <tr key={t.id}>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                      <td style={{ fontSize: '14px', fontWeight: 500 }}>{t.name}</td>
                      <td><span className={`badge ${t.status === 'active' ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '11px' }}>{t.status}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-outline-primary me-1" style={{ fontSize: '12px' }} onClick={() => openEdit(t)}>Edit</button>
                        <button className={`btn btn-sm ${t.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                          style={{ fontSize: '12px' }} onClick={() => toggleStatus(t)}>
                          {t.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {types.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-4">No types found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Type' : 'Add Thaali Type'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <label className="form-label" style={{ fontSize: '13px' }}>Type Name *</label>
                <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Normal, Spicy, Chronic" autoFocus />
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}