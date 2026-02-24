'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface MuminCategory {
  id: number
  name: string
  colour: string
  description: string
  status: string
}

export default function MuminCategoriesPage() {
  const [categories, setCategories] = useState<MuminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<MuminCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const emptyForm = { name: '', colour: '#258B37', description: '', status: 'active' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase.from('mumin_categories').select('id, name, colour, description, status').order('name')
    setCategories(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setForm(emptyForm); setSaveError(''); setShowModal(true) }

  const openEdit = (c: MuminCategory) => {
    setEditing(c)
    setForm({ name: c.name, colour: c.colour, description: c.description || '', status: c.status })
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('Name is required.'); return }
    setSaving(true); setSaveError('')
    const payload = {
      name: form.name.trim(),
      colour: form.colour,
      description: form.description.trim() || null,
      status: form.status,
    }
    const res = editing
      ? await supabase.from('mumin_categories').update(payload).eq('id', editing.id)
      : await supabase.from('mumin_categories').insert(payload)
    if (res.error) { setSaveError(res.error.message); setSaving(false); return }
    await fetchAll(); setShowModal(false); setSaving(false)
  }

  const toggleStatus = async (c: MuminCategory) => {
    await supabase.from('mumin_categories').update({ status: c.status === 'active' ? 'inactive' : 'active' }).eq('id', c.id)
    await fetchAll()
  }

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0" style={{ color: '#212529' }}>Mumin Categories</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>{categories.length} categories</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          <i className="bi bi-plus me-1" />Add Category
        </button>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: '10px' }}>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
              <thead style={{ background: '#f8f9fa' }}>
                <tr>
                  {['#', 'Name', 'Colour', 'Description', 'Status', ''].map(h => (
                    <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ color: '#6c757d' }}>{i + 1}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: c.colour + '22', color: c.colour, border: `1px solid ${c.colour}44`, fontWeight: 600, fontSize: '12px', padding: '4px 10px' }}>
                        {c.name}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: c.colour, border: '1px solid #dee2e6', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: '#6c757d', fontFamily: 'monospace' }}>{c.colour}</span>
                      </div>
                    </td>
                    <td style={{ color: '#6c757d', maxWidth: '300px' }}>{c.description || '—'}</td>
                    <td>
                      <span className={`badge bg-opacity-10 ${c.status === 'active' ? 'bg-success text-success' : 'bg-secondary text-secondary'}`} style={{ fontSize: '11px' }}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-end">
                        <button className="btn btn-sm" title="Edit" style={{ padding: '2px 7px', color: '#364574' }} onClick={() => openEdit(c)}>
                          <i className="bi bi-pencil" />
                        </button>
                        <button className="btn btn-sm" title={c.status === 'active' ? 'Deactivate' : 'Activate'} style={{ padding: '2px 7px', color: c.status === 'active' ? '#f06548' : '#0ab39c' }} onClick={() => toggleStatus(c)}>
                          <i className={`bi ${c.status === 'active' ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-4">No categories yet. Click "Add Category" to create one.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Category' : 'Add Category'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {saveError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{saveError}</div>}
                <div className="row g-3">
                  <div className="col-8">
                    <label className="form-label" style={{ fontSize: '13px' }}>Name *</label>
                    <input type="text" className="form-control form-control-sm" placeholder="e.g. Normal, VIP" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="col-4">
                    <label className="form-label" style={{ fontSize: '13px' }}>Colour</label>
                    <div className="d-flex align-items-center gap-2">
                      <input type="color" className="form-control form-control-sm form-control-color" value={form.colour} onChange={e => setForm({ ...form, colour: e.target.value })} style={{ width: '40px', padding: '2px', flexShrink: 0 }} />
                      <input type="text" className="form-control form-control-sm" value={form.colour} onChange={e => setForm({ ...form, colour: e.target.value })} placeholder="#258B37" style={{ fontFamily: 'monospace' }} />
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Description</label>
                    <textarea className="form-control form-control-sm" rows={2} placeholder="Optional description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                  {editing && (
                    <div className="col-12">
                      <label className="form-label" style={{ fontSize: '13px' }}>Status</label>
                      <select className="form-select form-select-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  )}
                  {/* Live preview */}
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Preview</label>
                    <div>
                      <span className="badge" style={{ backgroundColor: form.colour + '22', color: form.colour, border: `1px solid ${form.colour}44`, fontWeight: 600, fontSize: '13px', padding: '5px 14px' }}>
                        {form.name || 'Category Name'}
                      </span>
                    </div>
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
    </>
  )
}