// app/(portal)/thaali/numbers/page.tsx
// Re-export: the NumbersTab logic is in thaali/page.tsx
// This is a standalone page that renders just the Numbers tab
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Thaali { id: number; thaali_number: number; status: string }

export default function ThaaliNumbersPage() {
  const [thaalis, setThaalis] = useState<Thaali[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Thaali | null>(null)
  const [numberInput, setNumberInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchThaalis() }, [])

  const fetchThaalis = async () => {
    setLoading(true)
    const { data } = await supabase.from('thaalis').select('*').order('thaali_number')
    setThaalis(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setNumberInput(''); setError(''); setShowModal(true) }
  const openEdit = (t: Thaali) => { setEditing(t); setNumberInput(t.thaali_number.toString()); setError(''); setShowModal(true) }

  const handleSave = async () => {
    setError('')
    const num = parseInt(numberInput)
    if (!num || num < 1 || num > 9999) { setError('Enter a valid number (1–9999)'); return }
    const existing = thaalis.find(t => t.thaali_number === num && t.id !== editing?.id)
    if (existing) { setError(`Thaali #${num} already exists`); return }
    setSaving(true)
    if (editing) {
      await supabase.from('thaalis').update({ thaali_number: num }).eq('id', editing.id)
    } else {
      await supabase.from('thaalis').insert({ thaali_number: num, status: 'active' })
    }
    await fetchThaalis()
    setShowModal(false)
    setSaving(false)
  }

  const filtered = thaalis.filter(t => t.thaali_number.toString().includes(search))

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Thaali Numbers</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>{thaalis.length} numbers registered</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Thaali Number</button>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <div className="mb-3">
            <input type="text" className="form-control form-control-sm" placeholder="Search thaali number..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '240px', width: '100%' }} />
          </div>
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    {['#', 'Thaali Number', 'Actions'].map(h => (
                      <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => (
                    <tr key={t.id}>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                      <td style={{ fontWeight: 700, fontSize: '15px', color: '#364574' }}>#{t.thaali_number}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }} onClick={() => openEdit(t)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={3} className="text-center text-muted py-4">No thaali numbers found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2"><small className="text-muted">{filtered.length} thaali numbers</small></div>
        </div>
      </div>

      {showModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? 'Edit Thaali Number' : 'Add Thaali Number'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {error && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{error}</div>}
                <label className="form-label" style={{ fontSize: '13px' }}>Thaali Number *</label>
                <input type="number" className="form-control" min={1} max={9999}
                  placeholder="e.g. 42" value={numberInput} onChange={e => setNumberInput(e.target.value)} autoFocus />
                <div className="mt-2" style={{ fontSize: '12px', color: '#6c757d' }}>Numbers between 1–9999. Each number is unique.</div>
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