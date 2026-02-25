'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AssignedThaali {
  id: number
  mumin_id: number
  thaali_id: number
  mumineen?: { sf_no: string; full_name: string; house_sectors?: { name: string } }
  thaalis?: { thaali_number: number }
  thaali_types?: { name: string }
  thaali_categories?: { name: string }
  distributors?: { full_name: string }
}

export default function ThaaliStickersPage() {
  const [registrations, setRegistrations] = useState<AssignedThaali[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [filterDistributor, setFilterDistributor] = useState('')
  const [sectors, setSectors] = useState<{ id: number; name: string }[]>([])
  const [distributors, setDistributors] = useState<{ id: number; full_name: string }[]>([])

  useEffect(() => { fetchData(); fetchLookups() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('thaali_registrations')
      .select(`
        id, mumin_id, thaali_id,
        mumineen!fk_tr_mumin(sf_no, full_name, house_sectors(name)),
        thaalis!fk_tr_thaali(thaali_number),
        thaali_types!fk_tr_type(name),
        thaali_categories!fk_tr_category(name),
        distributors!fk_tr_distributor(full_name)
      `)
      .eq('status', 'approved')
      .not('thaali_id', 'is', null)
      .order('thaali_id')
    setRegistrations((data || []) as any[])
    setLoading(false)
  }

  const fetchLookups = async () => {
    const [s, d] = await Promise.all([
      supabase.from('house_sectors').select('id, name').eq('status', 'active').order('name'),
      supabase.from('distributors').select('id, full_name').eq('status', 'active').order('full_name'),
    ])
    setSectors(s.data || [])
    setDistributors(d.data || [])
  }

  const filtered = registrations.filter((r: any) => {
    const matchSearch = !search ||
      r.mumineen?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.mumineen?.sf_no?.toLowerCase().includes(search.toLowerCase()) ||
      r.thaalis?.thaali_number?.toString().includes(search)
    const sectorName = sectors.find(s => s.id.toString() === filterSector)?.name
    const matchSector = !filterSector || r.mumineen?.house_sectors?.name === sectorName
    const distName = distributors.find(d => d.id.toString() === filterDistributor)?.full_name
    const matchDist = !filterDistributor || r.distributors?.full_name === distName
    return matchSearch && matchSector && matchDist
  })

  const toggleSelect = (id: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const toggleSelectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r: any) => r.id)))
  }

  const selectedRegs = registrations.filter((r: any) => selected.has(r.id))

  const generatePDF = async () => {
    if (selected.size === 0) return
    setGenerating(true)
    try {
      const { jsPDF } = await import('jspdf')
      const QRCode = (await import('qrcode')).default

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // Exact dimensions extracted from reference PDF (479.pdf)
      // Layout: 2 columns x 6 rows = 12 stickers per page
      const cols = 2
      const rows = 6
      const stickerW = 92.6   // mm
      const stickerH = 49.4   // mm
      const marginX = 10.9    // left margin mm
      const marginY = 16.0    // top margin mm
      const gapX = 210 - marginX * 2 - stickerW * cols  // ~13.6mm between cols
      const gapY = 0          // no gap between rows

      // Relative positions inside each sticker (from top-left of sticker)
      const nameX = 13.7      // mm from left
      const nameY = 6.7       // mm from top
      const sfY = 13.7        // mm from top
      const thaaliY = 19.5    // mm from top (between SF and QR)
      const qrY = 24.0        // mm from top
      const qrSize = 22.9     // mm x mm
      const qr1X = 9.3        // mm from left
      const qr2X = 9.3 + qrSize + 3.5  // mm from left

      for (let personIdx = 0; personIdx < selectedRegs.length; personIdx++) {
        const reg = selectedRegs[personIdx] as any
        if (personIdx > 0) doc.addPage()

        const name = reg.mumineen?.full_name || ''
        const sf = reg.mumineen?.sf_no || ''
        const thaaliNo = reg.thaalis?.thaali_number?.toString() || ''

        // Generate QR codes
        const qr1Url: string = await QRCode.toDataURL(thaaliNo, {
          width: 128, margin: 0, errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' }
        })
        const qr2Url: string = await QRCode.toDataURL(`${thaaliNo}|SF-${sf}`, {
          width: 128, margin: 0, errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' }
        })

        for (let i = 0; i < 12; i++) {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = marginX + col * (stickerW + gapX)
          const y = marginY + row * (stickerH + gapY)

          // Sticker border — thin dashed line like reference
          doc.setDrawColor(160, 160, 160)
          doc.setLineWidth(0.25)
          doc.setLineDashPattern([1.5, 1.0], 0)
          doc.rect(x, y, stickerW, stickerH)
          doc.setLineDashPattern([], 0)

          // Name — bold, left aligned
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(0, 0, 0)
          const nameLines: string[] = doc.splitTextToSize(name, stickerW - nameX - 4)
          doc.text(nameLines.slice(0, 2), x + nameX, y + nameY)

          // SF#
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(50, 50, 50)
          doc.text(`SF - ${sf}`, x + nameX, y + sfY)

          // Thaali#
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(0, 0, 0)
          doc.text(`Thaali # ${thaaliNo}`, x + nameX, y + thaaliY)

          // QR codes
          doc.addImage(qr1Url, 'PNG', x + qr1X, y + qrY, qrSize, qrSize)
          doc.addImage(qr2Url, 'PNG', x + qr2X, y + qrY, qrSize, qrSize)

          // QR labels below
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.setTextColor(80, 80, 80)
          doc.text('Thaali #', x + qr1X + qrSize / 2, y + qrY + qrSize + 3, { align: 'center' })
          doc.text('Thaali + SF', x + qr2X + qrSize / 2, y + qrY + qrSize + 3, { align: 'center' })
        }
      }

      doc.save(`thaali_stickers_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('PDF error:', err)
      alert('Error generating PDF. Make sure jspdf and qrcode are installed:\nnpm install jspdf qrcode\nnpm install --save-dev @types/qrcode')
    }
    setGenerating(false)
  }


  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Thaali Stickers</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>
            Select mumineen → generates PDF with 12 stickers per person (3×4 grid), 2 QR codes each
          </p>
        </div>
        <button className="btn btn-danger btn-sm" onClick={generatePDF}
          disabled={selected.size === 0 || generating}>
          {generating
            ? <><span className="spinner-border spinner-border-sm me-1" />Generating...</>
            : <><i className="bi bi-file-pdf me-1" />Print Stickers ({selected.size})</>}
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-3" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body py-3">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-4">
              <input type="text" className="form-control form-control-sm"
                placeholder="Search name, SF#, Thaali#..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="col-6 col-md-3">
              <select className="form-select form-select-sm" value={filterSector}
                onChange={e => setFilterSector(e.target.value)}>
                <option value="">All Sectors</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <select className="form-select form-select-sm" value={filterDistributor}
                onChange={e => setFilterDistributor(e.target.value)}>
                <option value="">All Distributors</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-2 d-flex align-items-center gap-2">
              <small className="text-muted">{filtered.length} shown</small>
              {(search || filterSector || filterDistributor) && (
                <button className="btn btn-sm btn-outline-secondary"
                  onClick={() => { setSearch(''); setFilterSector(''); setFilterDistributor('') }}>Clear</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="alert alert-primary py-2 d-flex justify-content-between align-items-center mb-3" style={{ fontSize: '13px' }}>
          <span>
            <strong>{selected.size}</strong> selected — {selected.size * 12} stickers ({selected.size} page{selected.size !== 1 ? 's' : ''})
          </span>
          <button className="btn btn-sm btn-outline-primary" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '13px' }}>
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                    </th>
                    {['SF#', 'Full Name', 'Thaali #', 'Type', 'Category', 'Sector', 'Distributor'].map(h => (
                      <th key={h} style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => (
                    <tr key={r.id} onClick={() => toggleSelect(r.id)}
                      style={{ cursor: 'pointer', background: selected.has(r.id) ? '#eef2ff' : '' }}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                      </td>
                      <td style={{ fontWeight: 600, color: '#364574' }}>{r.mumineen?.sf_no}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.mumineen?.full_name}</td>
                      <td style={{ fontWeight: 700, color: '#364574' }}>#{r.thaalis?.thaali_number}</td>
                      <td>{r.thaali_types?.name || '—'}</td>
                      <td>{r.thaali_categories?.name || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{r.mumineen?.house_sectors?.name || '—'}</td>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{r.distributors?.full_name || '—'}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        {registrations.length === 0
                          ? 'No approved registrations with assigned thaali numbers found'
                          : 'No results match your filters'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2">
            <small className="text-muted">{filtered.length} registrations with assigned thaalis</small>
          </div>
        </div>
      </div>
    </div>
  )
}