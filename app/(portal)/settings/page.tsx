'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getFMBFiscalYear, gregorianToHijri } from '@/lib/hijri'

// ── Types ────────────────────────────────────────────────────────────────────

interface LookupRow { id: number; name: string; colour?: string; description?: string }
interface ComputedFY { hijriYear: number; label: string; gregorianLabel: string; startGregorian: Date; endGregorian: Date; isCurrentFY: boolean }
interface ThaaliNumber { id: number; thaali_number: string; assigned: boolean }
interface Sector { id: number; name: string; distributors: { id: number; full_name: string }[] }
interface KitchenSettings { cutoff_hours: number }

type TabKey =
  | 'sectors' | 'blocks' | 'types' | 'niyyat'
  | 'mumin_categories' | 'thaali_categories' | 'thaali_types' | 'thaali_numbers' | 'stickers'
  | 'fiscal' | 'kitchen'

const TABS: { key: TabKey; label: string; icon: string; group: string }[] = [
  { key: 'sectors',           label: 'Sectors',           icon: 'bi-map',           group: 'Address'  },
  { key: 'blocks',            label: 'House Blocks',      icon: 'bi-building',      group: 'Address'  },
  { key: 'types',             label: 'House Types',       icon: 'bi-house',         group: 'Address'  },
  { key: 'niyyat',            label: 'Niyyat Statuses',   icon: 'bi-check2-circle', group: 'Mumineen' },
  { key: 'mumin_categories',  label: 'Mumin Categories',  icon: 'bi-tags',          group: 'Mumineen' },
  { key: 'thaali_types',      label: 'Thaali Types',      icon: 'bi-cup-hot',       group: 'Thaali'   },
  { key: 'thaali_categories', label: 'Thaali Categories', icon: 'bi-collection',    group: 'Thaali'   },
  { key: 'thaali_numbers',    label: 'Thaali Numbers',    icon: 'bi-hash',          group: 'Thaali'   },
  { key: 'stickers',          label: 'Stickers',          icon: 'bi-printer',       group: 'Thaali'   },
  { key: 'fiscal',            label: 'Fiscal Years',      icon: 'bi-calendar-range',group: 'System'   },
  { key: 'kitchen',           label: 'Kitchen',           icon: 'bi-cup-straw',     group: 'System'   },
]

const LOOKUP_TABLE: Partial<Record<TabKey, string>> = {
  blocks: 'house_blocks', types: 'house_types',
  niyyat: 'niyyat_statuses', mumin_categories: 'mumin_categories',
  thaali_types: 'thaali_types', thaali_categories: 'thaali_categories',
}

// Preset hour options
const CUTOFF_PRESETS = [24, 36, 48, 60, 72, 96]

export default function SettingsPage() {
  const [activeTab, setActiveTab]       = useState<TabKey>('sectors')
  const [rows, setRows]                 = useState<LookupRow[]>([])
  const [sectors, setSectors]           = useState<Sector[]>([])
  const [computedFYs, setComputedFYs]   = useState<ComputedFY[]>([])
  const [thaaliNumbers, setThaaliNumbers] = useState<ThaaliNumber[]>([])
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>({ cutoff_hours: 72 })
  const [loading, setLoading]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')

  // Generic modal
  const [showModal, setShowModal]       = useState(false)
  const [editRow, setEditRow]           = useState<LookupRow | null>(null)
  const [formName, setFormName]         = useState('')
  const [formColour, setFormColour]     = useState('#198754')
  const [formDescription, setFormDescription] = useState('')

  // Sector expand state
  const [expandedSector, setExpandedSector] = useState<number | null>(null)

  // Thaali number modal
  const [showThaaliModal, setShowThaaliModal] = useState(false)
  const [thaaliInput, setThaaliInput]   = useState('')

  // Sticker state
  const [stickerRegistrations, setStickerRegistrations] = useState<any[]>([])
  const [selectedStickers, setSelectedStickers]         = useState<number[]>([])
  const [stickerSearch, setStickerSearch]               = useState('')
  const [generatingPDF, setGeneratingPDF]               = useState(false)

  useEffect(() => { loadTab(activeTab) }, [activeTab])

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else          { setSuccess(msg); setTimeout(() => setSuccess(''), 2000) }
  }

  // ── Load tab ──────────────────────────────────────────────────────────────

  const loadTab = async (tab: TabKey) => {
    setLoading(true)
    setRows([]); setThaaliNumbers([]); setSectors([])

    if (tab === 'fiscal') {
      const today = new Date()
      const todayH = gregorianToHijri(today)
      const currentFYHijriYear = todayH.month >= 9 ? todayH.year : todayH.year - 1
      const fys: ComputedFY[] = []
      for (let hy = currentFYHijriYear + 2; hy >= 1440; hy--) {
        const fy = getFMBFiscalYear(hy)
        fys.push({ ...fy, isCurrentFY: hy === currentFYHijriYear })
      }
      setComputedFYs(fys)

    } else if (tab === 'kitchen') {
      const { data } = await supabase
        .from('kitchen_settings')
        .select('setting_key, setting_value')
        .eq('setting_key', 'customization_cutoff_hours')
      const row = (data || []).find((d: any) => d.setting_key === 'customization_cutoff_hours')
      if (row) setKitchenSettings({ cutoff_hours: parseInt(row.setting_value) || 72 })

    } else if (tab === 'sectors') {
      // Load sectors with their assigned distributors
      const { data: secData } = await supabase.from('house_sectors').select('id, name').order('id')
      if (!secData) { setLoading(false); return }

      // Load distributor_sectors join + distributor names
      const secIds = secData.map((s: any) => s.id)
      const { data: dsData } = await supabase
        .from('distributor_sectors')
        .select('sector_id, distributor_id, distributors(id, full_name)')
        .in('sector_id', secIds)

      const sectorMap: Record<number, { id: number; full_name: string }[]> = {}
      for (const ds of (dsData || [])) {
        if (!sectorMap[ds.sector_id]) sectorMap[ds.sector_id] = []
        if (ds.distributors) sectorMap[ds.sector_id].push({ id: ds.distributor_id, full_name: (ds.distributors as any).full_name })
      }
      setSectors(secData.map((s: any) => ({ id: s.id, name: s.name, distributors: sectorMap[s.id] || [] })))

    } else if (tab === 'thaali_numbers') {
      // Load thaalis, then check which have an active registration
      const { data: thaalis } = await supabase.from('thaalis').select('id, thaali_number').order('thaali_number')
      if (!thaalis?.length) { setThaaliNumbers([]); setLoading(false); return }

      const { data: regs } = await supabase.from('thaali_registrations').select('thaali_id').eq('status', 'approved')
      const assignedIds = new Set((regs || []).map((r: any) => r.thaali_id))
      setThaaliNumbers(thaalis.map((t: any) => ({ id: t.id, thaali_number: t.thaali_number, assigned: assignedIds.has(t.id) })))

    } else if (tab === 'stickers') {
      const { data } = await supabase
        .from('thaali_registrations')
        .select('id, thaalis(thaali_number), mumineen(full_name, sf_no)')
        .eq('status', 'active').order('id')
      setStickerRegistrations(data || [])

    } else {
      const table = LOOKUP_TABLE[tab]
      if (!table) { setLoading(false); return }
      const { data } = await supabase.from(table).select('*').order('id')
      setRows(data || [])
    }
    setLoading(false)
  }

  // ── Generic CRUD ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditRow(null); setFormName(''); setFormColour('#198754'); setFormDescription('')
    setShowModal(true)
  }
  const openEdit = (row: LookupRow) => {
    setEditRow(row); setFormName(row.name); setFormColour(row.colour || '#198754'); setFormDescription(row.description || '')
    setShowModal(true)
  }

  const saveRow = async () => {
    if (!formName.trim()) return showMsg('Name is required', true)
    setSaving(true)
    const table = activeTab === 'sectors' ? 'house_sectors' : LOOKUP_TABLE[activeTab]!
    const payload: any = { name: formName.trim() }
    if (activeTab === 'mumin_categories') { payload.colour = formColour; payload.description = formDescription }

    const { error } = editRow
      ? await supabase.from(table).update(payload).eq('id', editRow.id)
      : await supabase.from(table).insert(payload)

    setSaving(false)
    if (error) return showMsg(error.message, true)
    setShowModal(false)
    showMsg(editRow ? 'Updated' : 'Added')
    loadTab(activeTab)
  }

  const deleteRow = async (id: number) => {
    if (!confirm('Delete this item? This cannot be undone.')) return
    const table = activeTab === 'sectors' ? 'house_sectors' : LOOKUP_TABLE[activeTab]!
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return showMsg('Cannot delete — it may be in use', true)
    showMsg('Deleted'); loadTab(activeTab)
  }

  // ── Sector: remove distributor assignment ─────────────────────────────────

  const removeDistributorFromSector = async (sectorId: number, distributorId: number) => {
    if (!confirm('Remove this distributor from the sector?')) return
    const { error } = await supabase
      .from('distributor_sectors')
      .delete()
      .eq('sector_id', sectorId)
      .eq('distributor_id', distributorId)
    if (error) return showMsg(error.message, true)
    showMsg('Distributor removed from sector')
    loadTab('sectors')
  }

  // ── Thaali numbers ────────────────────────────────────────────────────────

  const saveThaaliNumber = async () => {
    const nums = thaaliInput.split(',').map(s => s.trim()).filter(Boolean)
    if (!nums.length) return showMsg('Enter at least one number', true)
    setSaving(true)
    const { error } = await supabase.from('thaalis').insert(nums.map(n => ({ thaali_number: n })))
    setSaving(false)
    if (error) return showMsg(error.message, true)
    setShowThaaliModal(false); setThaaliInput('')
    showMsg(`Added ${nums.length} thaali number(s)`); loadTab('thaali_numbers')
  }

  const deleteThaali = async (id: number) => {
    if (!confirm('Delete this thaali number?')) return
    const { error } = await supabase.from('thaalis').delete().eq('id', id)
    if (error) return showMsg('Cannot delete — may be assigned to a mumin', true)
    showMsg('Deleted'); loadTab('thaali_numbers')
  }

  // ── Kitchen settings ──────────────────────────────────────────────────────

  const saveKitchenSettings = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('kitchen_settings')
      .upsert(
        { setting_key: 'customization_cutoff_hours', setting_value: kitchenSettings.cutoff_hours.toString(), updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' }
      )
    setSaving(false)
    if (error) return showMsg(error.message, true)
    showMsg('Kitchen settings saved')
  }

  // ── Stickers ──────────────────────────────────────────────────────────────

  const filteredStickers = stickerRegistrations.filter((r: any) =>
    !stickerSearch ||
    r.mumineen?.full_name?.toLowerCase().includes(stickerSearch.toLowerCase()) ||
    r.mumineen?.sf_no?.includes(stickerSearch) ||
    r.thaalis?.thaali_number?.includes(stickerSearch)
  )
  const toggleSticker = (id: number) =>
    setSelectedStickers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () =>
    setSelectedStickers(prev => prev.length === filteredStickers.length ? [] : filteredStickers.map((r: any) => r.id))

  const generateStickers = async () => {
    if (!selectedStickers.length) return showMsg('Select at least one registration', true)
    setGeneratingPDF(true)
    const selected = stickerRegistrations.filter((r: any) => selectedStickers.includes(r.id))
    const jsPDF = (await import('jspdf')).default
    const QRCode = (await import('qrcode')).default
    const doc = new jsPDF({ unit: 'in', format: 'letter' })
    const pageW = 8.5, margin = 0.5
    const cols = 2, stickerW = (pageW - margin * 2) / cols
    const upperH = 1.75, lowerH = 0.75, gap = 0.15
    let x = margin, y = margin
    for (let i = 0; i < selected.length; i++) {
      const r = selected[i]
      const thaaliNo = r.thaalis?.thaali_number || ''
      const name = r.mumineen?.full_name || ''
      const sfNo = r.mumineen?.sf_no || ''
      if (i > 0 && i % (cols * Math.floor((11 - margin * 2) / (upperH + lowerH + gap))) === 0) {
        doc.addPage(); x = margin; y = margin
      }
      const col = i % cols
      x = margin + col * stickerW
      if (col === 0 && i > 0) y += upperH + lowerH + gap + 0.1
      doc.setDrawColor(200); doc.rect(x, y, stickerW - 0.1, upperH)
      const qr1 = await QRCode.toDataURL(thaaliNo, { width: 80 })
      doc.addImage(qr1, 'PNG', x + 0.1, y + 0.1, 0.8, 0.8)
      doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.text(`#${thaaliNo}`, x + 1.05, y + 0.45)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.text(name, x + 1.05, y + 0.65)
      doc.text(`SF: ${sfNo}`, x + 1.05, y + 0.82)
      const ly = y + upperH + gap
      doc.setDrawColor(200); doc.rect(x, ly, stickerW - 0.1, lowerH)
      const qr2 = await QRCode.toDataURL(`${thaaliNo}|${sfNo}`, { width: 60 })
      doc.addImage(qr2, 'PNG', x + 0.05, ly + 0.05, 0.6, 0.6)
      doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text(`#${thaaliNo}`, x + 0.75, ly + 0.38)
      doc.setFontSize(7); doc.setFont('helvetica', 'normal')
      doc.text(sfNo, x + 0.75, ly + 0.55)
    }
    doc.save('thaali-stickers.pdf')
    setGeneratingPDF(false)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hasColour = activeTab === 'mumin_categories'
  const groups    = [...new Set(TABS.map(t => t.group))]
  const showAddButton = !['fiscal', 'kitchen', 'stickers'].includes(activeTab)
  const currentTab = TABS.find(t => t.key === activeTab)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      {/* Page header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Settings</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>
            Manage lookup tables and system configuration
          </p>
        </div>
      </div>

      {error   && <div className="alert alert-danger  py-2 px-3 mb-3" style={{ fontSize: '13px' }}>{error}</div>}
      {success && <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: '13px' }}>{success}</div>}

      <div className="row g-3">

        {/* ── Sidebar ── */}
        <div className="col-lg-3">
          <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
            <div className="card-body p-2">
              {groups.map(group => (
                <div key={group} className="mb-2">
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '8px 10px 4px' }}>
                    {group}
                  </div>
                  {TABS.filter(t => t.group === group).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="w-100 text-start btn btn-sm"
                      style={{
                        borderRadius: '8px', marginBottom: '2px',
                        background: activeTab === tab.key ? '#364574' : 'transparent',
                        color: activeTab === tab.key ? '#fff' : 'var(--bs-body-color)',
                        fontWeight: activeTab === tab.key ? 600 : 400,
                        fontSize: '13px', padding: '8px 12px', border: 'none',
                      }}
                    >
                      <i className={`bi ${tab.icon} me-2`} style={{ fontSize: '13px' }} />
                      {tab.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="col-lg-9">
          <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
            <div className="card-body p-3">

              {/* Tab header */}
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2">
                  <i className={`bi ${currentTab?.icon}`} style={{ fontSize: '18px', color: '#364574' }} />
                  <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>{currentTab?.label}</h6>
                </div>
                {showAddButton && (
                  <button
                    onClick={() => activeTab === 'thaali_numbers' ? setShowThaaliModal(true) : openAdd()}
                    className="btn btn-sm"
                    style={{ background: '#364574', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
                  >
                    <i className="bi bi-plus me-1" />Add New
                  </button>
                )}
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border spinner-border-sm" style={{ color: '#364574' }} />
                </div>
              ) : (

                // ── FISCAL YEARS ──
                activeTab === 'fiscal' ? (
                  <div>
                    <p style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }} className="mb-3">
                      <i className="bi bi-info-circle me-1" />
                      Auto-generated from Misri Hijri calendar. FMB fiscal year: 1 Ramadan → 29 Shaban.
                    </p>
                    <div className="table-responsive">
                      <table className="table table-hover" style={{ fontSize: '13px' }}>
                        <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                          <tr>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Hijri Year</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Ramadan Start</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Year End</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Gregorian Span</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700, width: 100 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {computedFYs.map(fy => (
                            <tr key={fy.hijriYear} style={{ background: fy.isCurrentFY ? '#36457408' : undefined }}>
                              <td>
                                <span style={{ fontWeight: 700, color: fy.isCurrentFY ? '#364574' : 'var(--bs-body-color)' }}>{fy.hijriYear}H</span>
                                {fy.isCurrentFY && <span className="badge ms-2" style={{ background: '#36457420', color: '#364574', fontSize: '10px' }}>Current</span>}
                              </td>
                              <td style={{ color: '#0ab39c', fontWeight: 600 }}>
                                {fy.startGregorian.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td style={{ color: 'var(--bs-secondary-color)' }}>
                                {fy.endGregorian.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td style={{ color: 'var(--bs-secondary-color)', fontSize: '12px' }}>{fy.gregorianLabel}</td>
                              <td>
                                {fy.isCurrentFY
                                  ? <span className="badge" style={{ background: '#0ab39c20', color: '#0ab39c', fontWeight: 600, fontSize: '11px' }}>Active</span>
                                  : fy.startGregorian > new Date()
                                    ? <span className="badge" style={{ background: '#ffbf6920', color: '#856404', fontWeight: 600, fontSize: '11px' }}>Upcoming</span>
                                    : <span className="badge" style={{ background: 'var(--bs-secondary-bg)', color: 'var(--bs-secondary-color)', fontWeight: 600, fontSize: '11px' }}>Past</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                // ── KITCHEN SETTINGS ──
                ) : activeTab === 'kitchen' ? (
                  <div style={{ maxWidth: 560 }}>
                    <div className="mb-4">
                      <h6 className="fw-bold mb-1" style={{ color: 'var(--bs-body-color)' }}>
                        <i className="bi bi-clock me-2" style={{ color: '#364574' }}></i>
                        Customization Cutoff
                      </h6>
                      <p style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }} className="mb-3">
                        How many hours before delivery can mumineen submit or change customization requests.
                        E.g. 72h means requests must be in 3 days before delivery.
                      </p>

                      {/* Preset pills */}
                      <div className="mb-3">
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                          Quick Select
                        </label>
                        <div className="d-flex flex-wrap gap-2">
                          {CUTOFF_PRESETS.map(h => (
                            <button
                              key={h}
                              onClick={() => setKitchenSettings({ cutoff_hours: h })}
                              className="btn btn-sm"
                              style={{
                                borderRadius: 20, fontSize: 13, fontWeight: 600, padding: '5px 16px',
                                background: kitchenSettings.cutoff_hours === h ? '#364574' : 'var(--bs-tertiary-bg)',
                                color: kitchenSettings.cutoff_hours === h ? '#fff' : 'var(--bs-body-color)',
                                border: kitchenSettings.cutoff_hours === h ? 'none' : '1px solid var(--bs-border-color)',
                              }}
                            >
                              {h}h
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom input */}
                      <div className="mb-3">
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                          Or enter custom hours
                        </label>
                        <div className="input-group" style={{ maxWidth: 200 }}>
                          <input
                            type="number" min={1} max={168}
                            className="form-control"
                            value={kitchenSettings.cutoff_hours}
                            onChange={e => setKitchenSettings({ cutoff_hours: parseInt(e.target.value) || 72 })}
                            style={{ borderRadius: '8px 0 0 8px', fontSize: 14, fontWeight: 600 }}
                          />
                          <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0', fontSize: 13, color: 'var(--bs-secondary-color)' }}>hours</span>
                        </div>
                      </div>

                      {/* Summary box */}
                      <div className="p-3 mb-3" style={{ background: 'var(--bs-info-bg-subtle)', borderRadius: 10, border: '1px solid var(--bs-info-border-subtle)' }}>
                        <div style={{ fontSize: 13, color: 'var(--bs-info-text-emphasis)' }}>
                          <i className="bi bi-info-circle me-2"></i>
                          <strong>Current setting: {kitchenSettings.cutoff_hours} hours</strong> before delivery
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--bs-info-text-emphasis)', marginTop: 6, paddingLeft: 22 }}>
                          Example: for a <strong>Wednesday</strong> delivery, mumineen must submit by{' '}
                          <strong>
                            {(() => {
                              const h = kitchenSettings.cutoff_hours
                              const days = Math.floor(h / 24)
                              const hrs  = h % 24
                              return `${days > 0 ? `${days} day${days > 1 ? 's' : ''}` : ''}${hrs > 0 ? ` ${hrs}h` : ''} before`.trim()
                            })()}
                          </strong>
                        </div>
                      </div>

                      <button
                        onClick={saveKitchenSettings}
                        disabled={saving}
                        className="btn btn-sm"
                        style={{ background: '#364574', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, padding: '8px 20px' }}
                      >
                        {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-check2 me-1" />}
                        Save Settings
                      </button>
                    </div>
                  </div>

                // ── THAALI NUMBERS ──
                ) : activeTab === 'thaali_numbers' ? (
                  <>
                    <p style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }} className="mb-3">
                      {thaaliNumbers.length} thaali numbers registered &nbsp;·&nbsp;
                      <span style={{ color: '#0ab39c' }}>{thaaliNumbers.filter(t => !t.assigned).length} unassigned</span>
                      &nbsp;·&nbsp;
                      <span style={{ color: '#364574' }}>{thaaliNumbers.filter(t => t.assigned).length} assigned</span>
                    </p>
                    <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table className="table table-hover" style={{ fontSize: '13px' }}>
                        <thead style={{ background: 'var(--bs-tertiary-bg)', position: 'sticky', top: 0, borderBottom: '2px solid var(--bs-border-color)' }}>
                          <tr>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Thaali Number</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Assigned</th>
                            <th style={{ width: 80 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {thaaliNumbers.length === 0 ? (
                            <tr><td colSpan={3} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>No thaali numbers added yet</td></tr>
                          ) : thaaliNumbers.map(t => (
                            <tr key={t.id}>
                              <td className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>{t.thaali_number}</td>
                              <td>
                                {t.assigned
                                  ? <span className="badge" style={{ background: '#36457420', color: '#364574', fontWeight: 600, fontSize: '11px' }}>Assigned</span>
                                  : <span className="badge" style={{ background: '#0ab39c20', color: '#0ab39c', fontWeight: 600, fontSize: '11px' }}>Unassigned</span>
                                }
                              </td>
                              <td>
                                <button onClick={() => deleteThaali(t.id)} disabled={t.assigned} title={t.assigned ? 'Cannot delete — assigned to a mumin' : 'Delete'} className="btn btn-sm" style={{ padding: '3px 8px', background: t.assigned ? 'transparent' : '#e6394615', color: t.assigned ? 'var(--bs-secondary-color)' : '#e63946', border: 'none', borderRadius: '6px' }}>
                                  <i className="bi bi-trash" style={{ fontSize: '11px' }} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>

                // ── SECTORS (with distributor list) ──
                ) : activeTab === 'sectors' ? (
                  <div>
                    {sectors.length === 0 ? (
                      <div className="text-center py-5" style={{ color: 'var(--bs-secondary-color)' }}>
                        <i className="bi bi-map fs-2 d-block mb-2"></i>No sectors added yet
                      </div>
                    ) : sectors.map(sec => (
                      <div key={sec.id} className="mb-2" style={{ border: '1px solid var(--bs-border-color)', borderRadius: 10, overflow: 'hidden' }}>
                        {/* Sector row */}
                        <div className="d-flex align-items-center px-3 py-2" style={{ background: 'var(--bs-body-bg)' }}>
                          <span className="fw-semibold me-auto" style={{ color: 'var(--bs-body-color)' }}>{sec.name}</span>

                          {/* Distributor count badge */}
                          <button
                            className="btn btn-sm me-2"
                            style={{
                              background: sec.distributors.length > 0 ? '#36457415' : 'var(--bs-tertiary-bg)',
                              color: sec.distributors.length > 0 ? '#364574' : 'var(--bs-secondary-color)',
                              border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 600, padding: '3px 12px'
                            }}
                            onClick={() => setExpandedSector(expandedSector === sec.id ? null : sec.id)}
                          >
                            <i className="bi bi-person me-1" style={{ fontSize: 11 }}></i>
                            {sec.distributors.length} distributor{sec.distributors.length !== 1 ? 's' : ''}
                            <i className={`bi ms-1 ${expandedSector === sec.id ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 10 }}></i>
                          </button>

                          {/* Edit / Delete */}
                          <div className="d-flex gap-1">
                            <button onClick={() => openEdit(sec)} className="btn btn-sm" style={{ padding: '3px 8px', background: '#36457415', color: '#364574', border: 'none', borderRadius: '6px' }}>
                              <i className="bi bi-pencil" style={{ fontSize: '11px' }} />
                            </button>
                            <button onClick={() => deleteRow(sec.id)} className="btn btn-sm" style={{ padding: '3px 8px', background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '6px' }}>
                              <i className="bi bi-trash" style={{ fontSize: '11px' }} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded distributor list */}
                        {expandedSector === sec.id && (
                          <div style={{ background: 'var(--bs-tertiary-bg)', borderTop: '1px solid var(--bs-border-color)', padding: '8px 12px' }}>
                            {sec.distributors.length === 0 ? (
                              <p className="mb-0" style={{ fontSize: 12, color: 'var(--bs-secondary-color)', fontStyle: 'italic' }}>
                                No distributors assigned to this sector. Assign them from the Distributors page.
                              </p>
                            ) : sec.distributors.map(d => (
                              <div key={d.id} className="d-flex align-items-center py-1">
                                <i className="bi bi-person-fill me-2" style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}></i>
                                <span style={{ fontSize: 13, color: 'var(--bs-body-color)', flex: 1 }}>{d.full_name}</span>
                                <button
                                  onClick={() => removeDistributorFromSector(sec.id, d.id)}
                                  className="btn btn-sm"
                                  style={{ padding: '2px 8px', background: '#e6394615', color: '#e63946', border: 'none', borderRadius: 6, fontSize: 11 }}
                                >
                                  <i className="bi bi-x"></i> Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                // ── STICKERS ──
                ) : activeTab === 'stickers' ? (
                  <>
                    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                      <input type="text" placeholder="Search name, SF#, thaali#..." value={stickerSearch}
                        onChange={e => setStickerSearch(e.target.value)}
                        className="form-control form-control-sm"
                        style={{ maxWidth: '260px', borderRadius: '8px', fontSize: '13px' }}
                      />
                      <div className="d-flex gap-2 align-items-center">
                        <span style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>{selectedStickers.length} selected</span>
                        <button onClick={generateStickers} disabled={generatingPDF || !selectedStickers.length} className="btn btn-sm"
                          style={{ background: '#364574', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                          {generatingPDF ? <><span className="spinner-border spinner-border-sm me-1" />Generating...</> : <><i className="bi bi-printer me-1" />Print Stickers</>}
                        </button>
                      </div>
                    </div>
                    <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table className="table table-hover" style={{ fontSize: '13px' }}>
                        <thead style={{ background: 'var(--bs-tertiary-bg)', position: 'sticky', top: 0, borderBottom: '2px solid var(--bs-border-color)' }}>
                          <tr>
                            <th style={{ width: '40px' }}>
                              <input type="checkbox" checked={selectedStickers.length === filteredStickers.length && filteredStickers.length > 0} onChange={toggleAll} />
                            </th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Thaali #</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Name</th>
                            <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>SF#</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStickers.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>No active registrations found</td></tr>
                          ) : filteredStickers.map((r: any) => (
                            <tr key={r.id} onClick={() => toggleSticker(r.id)} style={{ cursor: 'pointer' }}>
                              <td><input type="checkbox" checked={selectedStickers.includes(r.id)} onChange={() => toggleSticker(r.id)} onClick={e => e.stopPropagation()} /></td>
                              <td className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>{r.thaalis?.thaali_number}</td>
                              <td style={{ color: 'var(--bs-body-color)' }}>{r.mumineen?.full_name}</td>
                              <td style={{ color: 'var(--bs-secondary-color)' }}>{r.mumineen?.sf_no}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>

                // ── GENERIC LOOKUP TABLE (blocks, types, niyyat, mumin_categories, thaali_types, thaali_categories) ──
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover" style={{ fontSize: '13px' }}>
                      <thead style={{ background: 'var(--bs-tertiary-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                        <tr>
                          <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700, width: 40 }}>#</th>
                          <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Name</th>
                          {hasColour && <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Colour</th>}
                          {activeTab === 'mumin_categories' && <th style={{ color: 'var(--bs-secondary-color)', fontWeight: 700 }}>Description</th>}
                          <th style={{ width: 100 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>Nothing added yet</td></tr>
                        ) : rows.map((row, i) => (
                          <tr key={row.id}>
                            <td style={{ color: 'var(--bs-secondary-color)' }}>{i + 1}</td>
                            <td className="fw-semibold" style={{ color: 'var(--bs-body-color)' }}>
                              {hasColour && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: row.colour || '#ccc', marginRight: 8 }} />}
                              {row.name}
                            </td>
                            {hasColour && <td style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>{row.colour}</td>}
                            {activeTab === 'mumin_categories' && <td style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>{row.description || '—'}</td>}
                            <td>
                              <div className="d-flex gap-1">
                                <button onClick={() => openEdit(row)} className="btn btn-sm" style={{ padding: '3px 8px', background: '#36457415', color: '#364574', border: 'none', borderRadius: '6px' }}>
                                  <i className="bi bi-pencil" style={{ fontSize: '11px' }} />
                                </button>
                                <button onClick={() => deleteRow(row.id)} className="btn btn-sm" style={{ padding: '3px 8px', background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '6px' }}>
                                  <i className="bi bi-trash" style={{ fontSize: '11px' }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Generic Add/Edit Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px' }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--bs-body-bg)', borderRadius: '12px', width: '100%', maxWidth: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bs-border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                {editRow ? 'Edit' : 'Add'} {currentTab?.label}
              </h6>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--bs-secondary-color)' }}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="mb-3">
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bs-body-color)' }}>Name *</label>
                <input
                  type="text" className="form-control" value={formName}
                  onChange={e => setFormName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveRow()}
                  placeholder="Enter name..."
                  style={{ borderRadius: '8px', fontSize: '13px' }}
                  autoFocus
                />
              </div>
              {hasColour && (
                <div className="mb-3">
                  <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bs-body-color)' }}>Colour</label>
                  <div className="d-flex align-items-center gap-2">
                    <input type="color" className="form-control form-control-color" value={formColour} onChange={e => setFormColour(e.target.value)} style={{ width: 48, height: 38, borderRadius: 8, padding: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>{formColour}</span>
                  </div>
                </div>
              )}
              {activeTab === 'mumin_categories' && (
                <div className="mb-3">
                  <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bs-body-color)' }}>Description</label>
                  <input type="text" className="form-control" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optional description..." style={{ borderRadius: 8, fontSize: 13 }} />
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bs-border-color)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 8, fontSize: 13 }}>Cancel</button>
              <button onClick={saveRow} disabled={saving} className="btn btn-sm" style={{ background: '#364574', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                {saving ? <span className="spinner-border spinner-border-sm" /> : editRow ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Thaali Number Modal ── */}
      {showThaaliModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px' }}
          onClick={() => setShowThaaliModal(false)}>
          <div style={{ background: 'var(--bs-body-bg)', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bs-border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Add Thaali Numbers</h6>
              <button onClick={() => setShowThaaliModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--bs-secondary-color)' }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600, color: 'var(--bs-body-color)' }}>Thaali Numbers *</label>
              <input type="text" className="form-control" value={thaaliInput}
                onChange={e => setThaaliInput(e.target.value)}
                placeholder="e.g. 1001, 1002, 1003"
                style={{ borderRadius: 8, fontSize: 13 }} autoFocus
              />
              <p className="mt-2 mb-0" style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>Separate multiple numbers with commas</p>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bs-border-color)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowThaaliModal(false)} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 8, fontSize: 13 }}>Cancel</button>
              <button onClick={saveThaaliNumber} disabled={saving} className="btn btn-sm" style={{ background: '#364574', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                {saving ? <span className="spinner-border spinner-border-sm" /> : 'Add Numbers'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}