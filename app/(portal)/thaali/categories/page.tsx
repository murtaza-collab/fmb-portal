// app/(portal)/thaali/categories/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ThaaliCategory { id: number; name: string; description?: string }

export default function ThaaliCategoriesPage() {
  const [categories, setCategories] = useState<ThaaliCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ThaaliCategory | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    setLoading(true)
    const { data } = await supabase.from('thaali_categories').select('*').order('name')
    setCategories(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setName(''); setDescription(''); setShowModal(true) }
  const openEdit = (c: ThaaliCategory) => { setEditing(c); setName(c.name); setDescription(c.description || ''); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('thaali_categories').update({ name: name.trim(), description: description.trim() }).eq('id', editing.id)
    } else {
      await supabase.from('thaali_categories').insert({ name: name.trim(), description: description.trim() })
    }
    await fetchCategories(); setShowModal(false); setSaving(false)
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Thaali Categories</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>e.g. Large, Medium, Mini, One Day</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Category</button>
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
                    {['#', 'Category Name', 'Description', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c, i) => (
                    <tr key={c.id}>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                      <td style={{ fontSize: '14px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{c.description || '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }} onClick={() => openEdit(c)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-4">No categories found</td></tr>}
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
                <h5 className="modal-title">{editing ? 'Edit Category' : 'Add Thaali Category'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label" style={{ fontSize: '13px' }}>Category Name *</label>
                  <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Large, Mini, One Day" autoFocus />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '13px' }}>Description</label>
                  <input type="text" className="form-control" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
                </div>
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