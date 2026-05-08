'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

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

  // Import state
  const fileRef = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<string[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<{ inserted: number; skipped: number } | null>(null)

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

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(''); setImportDone(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        // First row might be a header — skip if it looks like one
        const allValues: string[] = []
        for (const row of rows) {
          for (const cell of row) {
            const val = String(cell).trim()
            if (val && !/^(sector|name|sector.?name)$/i.test(val)) {
              allValues.push(val)
            }
          }
        }

        if (allValues.length === 0) {
          setImportError('No sector names found in the file.')
          setImportRows([])
        } else {
          setImportRows([...new Set(allValues)]) // deduplicate within file
        }
      } catch {
        setImportError('Could not read file. Please use .xlsx, .xls, or .csv.')
        setImportRows([])
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const openImport = () => {
    setImportRows([]); setImportError(''); setImportDone(null)
    setShowImport(true)
  }

  const handleImport = async () => {
    if (!importRows.length) return
    setImporting(true)

    const existing = new Set(sectors.map(s => s.name.toLowerCase()))
    const toInsert = importRows.filter(r => !existing.has(r.toLowerCase()))
    const skipped = importRows.length - toInsert.length

    if (toInsert.length > 0) {
      await supabase.from('house_sectors').insert(toInsert.map(name => ({ name, status: 'active' })))
    }

    await fetchSectors()
    setImportDone({ inserted: toInsert.length, skipped })
    setImporting(false)
    setImportRows([])
  }

  const filtered = sectors.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Sectors</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Manage delivery sectors</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-success btn-sm" onClick={openImport}>
            <i className="bi bi-file-earmark-excel me-1" />Import Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Sector</button>
        </div>
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

      {/* ── Add / Edit Modal ── */}
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

      {/* ── Import Modal ── */}
      {showImport && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => { if (!importing) setShowImport(false) }}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="bi bi-file-earmark-excel me-2 text-success" />Import Sectors from Excel</h5>
                <button className="btn-close" onClick={() => setShowImport(false)} disabled={importing} />
              </div>
              <div className="modal-body">

                {/* Instructions */}
                <div className="alert alert-info py-2 mb-3" style={{ fontSize: '13px' }}>
                  <strong>Format:</strong> One sector name per row (or per column). First row can be a header — it will be skipped automatically. Supports <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong>.
                </div>

                {/* File picker */}
                {!importDone && (
                  <div className="mb-3">
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="d-none" onChange={handleFileChange} />
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                      <i className="bi bi-upload me-1" />Choose File
                    </button>
                    {importRows.length > 0 && (
                      <span className="ms-3 text-muted" style={{ fontSize: '13px' }}>{importRows.length} sectors parsed</span>
                    )}
                  </div>
                )}

                {importError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{importError}</div>}

                {/* Success report */}
                {importDone && (
                  <div className="alert alert-success py-2" style={{ fontSize: '13px' }}>
                    <i className="bi bi-check-circle me-1" />
                    <strong>{importDone.inserted}</strong> sectors imported successfully.
                    {importDone.skipped > 0 && <span className="ms-2 text-muted">({importDone.skipped} already existed — skipped)</span>}
                  </div>
                )}

                {/* Preview table */}
                {importRows.length > 0 && !importDone && (
                  <>
                    <p className="mb-2" style={{ fontSize: '13px', color: '#6c757d' }}>Preview ({importRows.length} rows) — duplicates already in database will be skipped:</p>
                    <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '6px' }}>
                      <table className="table table-sm mb-0">
                        <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ fontSize: '12px', color: '#6c757d', width: '50px' }}>#</th>
                            <th style={{ fontSize: '12px', color: '#6c757d' }}>Sector Name</th>
                            <th style={{ fontSize: '12px', color: '#6c757d', width: '100px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((row, i) => {
                            const exists = sectors.some(s => s.name.toLowerCase() === row.toLowerCase())
                            return (
                              <tr key={i} style={exists ? { opacity: 0.5 } : {}}>
                                <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                                <td style={{ fontSize: '13px' }}>{row}</td>
                                <td>
                                  {exists
                                    ? <span className="badge bg-secondary" style={{ fontSize: '11px' }}>Skip</span>
                                    : <span className="badge bg-success" style={{ fontSize: '11px' }}>New</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn btn-light" onClick={() => setShowImport(false)} disabled={importing}>
                  {importDone ? 'Close' : 'Cancel'}
                </button>
                {!importDone && (
                  <button className="btn btn-success" onClick={handleImport}
                    disabled={importing || importRows.length === 0}>
                    {importing
                      ? <><span className="spinner-border spinner-border-sm me-1" />Importing...</>
                      : <><i className="bi bi-check2 me-1" />Import {importRows.length > 0 ? `${importRows.length} Sectors` : ''}</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
