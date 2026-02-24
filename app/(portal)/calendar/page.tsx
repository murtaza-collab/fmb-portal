'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface CalendarEvent {
  id: number
  event_date: string
  menu: string
  notes: string
  fiscal_year_id: number
  status: string
  calendar_event_statuses?: EventStatus[]
}

interface EventStatus {
  id: number
  event_id: number
  niyyat_status_id: number
  thaali_count: number
  niyyat_statuses?: { name: string }
}

interface NiyyatStatus { id: number; name: string }
interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarPage() {
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [activeFY, setActiveFY] = useState<FiscalYear | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const selectedEventRef = useRef<CalendarEvent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [form, setForm] = useState({ menu: '', notes: '' })
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<number, number>>({})

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchEvents() }, [currentYear, currentMonth])

  const fetchLookups = async () => {
    const [ns, fy] = await Promise.all([
      supabase.from('niyyat_statuses').select('id, name').eq('status', 'active').order('name'),
      supabase.from('fiscal_years').select('*').order('id', { ascending: false }),
    ])
    setNiyyatStatuses(ns.data || [])
    setFiscalYears(fy.data || [])
    const active = (fy.data || []).find((f: FiscalYear) => f.is_active)
    if (active) setActiveFY(active)
  }

  const fetchEvents = async () => {
    const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
    const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-31`
    const { data } = await supabase
      .from('calendar_events')
      .select('*, calendar_event_statuses(*, niyyat_statuses(name))')
      .gte('event_date', startDate)
      .lte('event_date', endDate)
    setEvents(data || [])
  }

  const openDayModal = async (dateStr: string) => {
    setSelectedDate(dateStr)

    const { data: freshEvent } = await supabase
      .from('calendar_events')
      .select('*, calendar_event_statuses(*, niyyat_statuses(name))')
      .eq('event_date', dateStr)
      .maybeSingle()

    setSelectedEvent(freshEvent || null)
    selectedEventRef.current = freshEvent || null

    if (freshEvent) {
      setForm({ menu: freshEvent.menu || '', notes: freshEvent.notes || '' })
      const sel = (freshEvent.calendar_event_statuses || []).map((s: EventStatus) => s.niyyat_status_id)
      setSelectedStatuses(sel)
      const counts: Record<number, number> = {}
      ;(freshEvent.calendar_event_statuses || []).forEach((s: EventStatus) => {
        counts[s.niyyat_status_id] = s.thaali_count
      })
      setStatusCounts(counts)
    } else {
      setForm({ menu: '', notes: '' })
      const approvedStatus = niyyatStatuses.find(s => s.name === 'Approved')
      if (approvedStatus) {
        setSelectedStatuses([approvedStatus.id])
        const { count } = await supabase.from('mumineen')
          .select('*', { count: 'exact', head: true })
          .eq('is_hof', true).eq('niyyat_status_id', approvedStatus.id)
        setStatusCounts({ [approvedStatus.id]: count || 0 })
      } else {
        setSelectedStatuses([])
        setStatusCounts({})
      }
    }
    setShowModal(true)
  }

  const toggleStatus = async (statusId: number) => {
    const isSelected = selectedStatuses.includes(statusId)
    if (isSelected) {
      setSelectedStatuses(prev => prev.filter(s => s !== statusId))
      setStatusCounts(prev => { const n = { ...prev }; delete n[statusId]; return n })
    } else {
      setSelectedStatuses(prev => [...prev, statusId])
      const { count } = await supabase.from('mumineen')
        .select('*', { count: 'exact', head: true })
        .eq('is_hof', true).eq('niyyat_status_id', statusId)
      setStatusCounts(prev => ({ ...prev, [statusId]: count || 0 }))
    }
  }

  const handleSave = async () => {
    if (!selectedDate) return
    setSaving(true)

    const currentEvent = selectedEventRef.current
    let eventId: number

    if (currentEvent) {
      await supabase.from('calendar_events').update({
        menu: form.menu, notes: form.notes, updated_at: new Date().toISOString()
      }).eq('id', currentEvent.id)
      eventId = currentEvent.id
      await supabase.from('calendar_event_statuses').delete().eq('event_id', eventId)
    } else {
      const { data, error } = await supabase.from('calendar_events').insert({
        event_date: selectedDate,
        menu: form.menu,
        notes: form.notes,
        fiscal_year_id: activeFY?.id || null,
        status: 'active'
      }).select('id').single()

      if (error || !data) {
        console.error('Insert error:', error)
        setSaving(false)
        return
      }
      eventId = data.id
    }

    const statusRows = selectedStatuses.map(statusId => ({
      event_id: eventId,
      niyyat_status_id: statusId,
      thaali_count: statusCounts[statusId] || 0
    }))
    if (statusRows.length > 0) {
      await supabase.from('calendar_event_statuses').insert(statusRows)
    }

    await fetchEvents()
    setShowModal(false)
    setSaving(false)
  }

  const exportDistributorReport = async () => {
    if (!selectedDate) return
    setExporting(true)

    const { data: registrations } = await supabase
      .from('thaali_registrations')
      .select(`
        *,
        mumineen!fk_tr_mumin(sf_no, full_name, its_no, whatsapp_no, full_address, niyyat_status_id, house_sectors(name)),
        thaalis!fk_tr_thaali(thaali_number),
        thaali_types!fk_tr_type(name),
        thaali_categories!fk_tr_category(name),
        distributors!fk_tr_distributor(full_name)
      `)
      .eq('status', 'approved')
      .in('mumin_id',
        (await supabase.from('mumineen').select('id').eq('is_hof', true)
          .in('niyyat_status_id', selectedStatuses)).data?.map((m: any) => m.id) || []
      )

    if (!registrations || registrations.length === 0) {
      alert('No registrations found for selected statuses.')
      setExporting(false)
      return
    }

    const sorted = [...registrations].sort((a: any, b: any) =>
      (a.distributors?.full_name || '').localeCompare(b.distributors?.full_name || '')
    )

    const headers = ['Distributor', 'Thaali No', 'SF#', 'ITS#', 'Name', 'Sector', 'Address', 'WhatsApp', 'Size', 'Type']
    const rows = sorted.map((r: any) => [
      r.distributors?.full_name || '',
      r.thaalis?.thaali_number || '',
      r.mumineen?.sf_no || '',
      r.mumineen?.its_no || '',
      r.mumineen?.full_name || '',
      r.mumineen?.house_sectors?.name || '',
      r.mumineen?.full_address || '',
      r.mumineen?.whatsapp_no || '',
      r.thaali_types?.name || '',
      r.thaali_categories?.name || '',
    ])

    const csv = [headers, ...rows].map(row =>
      row.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `distribution_report_${selectedDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const totalThaalis = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-0">Calendar</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Daily menu planning and thaali distribution</p>
        </div>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <button className="btn btn-sm btn-outline-secondary" onClick={prevMonth}>‹ Prev</button>
            <h5 className="mb-0 fw-semibold">{MONTHS[currentMonth]} {currentYear}</h5>
            <button className="btn btn-sm btn-outline-secondary" onClick={nextMonth}>Next ›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6c757d', padding: '4px' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} style={{ minHeight: '80px' }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const event = events.find(e => e.event_date === dateStr)
              const isToday = dateStr === todayStr
              const totalCount = (event?.calendar_event_statuses || []).reduce((a, s) => a + (s.thaali_count || 0), 0)

              return (
                <div key={day}
                  onClick={() => openDayModal(dateStr)}
                  style={{
                    minHeight: '80px', padding: '6px', borderRadius: '8px', cursor: 'pointer',
                    border: isToday ? '2px solid #364574' : '1px solid #e9ecef',
                    background: event ? '#f0f4ff' : '#fff',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#e8eeff')}
                  onMouseLeave={e => (e.currentTarget.style.background = event ? '#f0f4ff' : '#fff')}
                >
                  <div style={{ fontSize: '13px', fontWeight: isToday ? 700 : 500, color: isToday ? '#364574' : '#333', marginBottom: '4px' }}>
                    {day}
                  </div>
                  {event && (
                    <>
                      {event.menu && (
                        <div style={{ fontSize: '10px', color: '#364574', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🍽 {event.menu}
                        </div>
                      )}
                      {totalCount > 0 && (
                        <div style={{ fontSize: '10px', color: '#0ab39c', fontWeight: 600, marginTop: '2px' }}>
                          {totalCount} thaalis
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showModal && selectedDate && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Menu</label>
                    <input type="text" className="form-control form-control-sm"
                      placeholder="e.g. Biryani, Dal Chawal..."
                      value={form.menu} onChange={(e) => setForm(p => ({ ...p, menu: e.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Notes</label>
                    <textarea className="form-control form-control-sm" rows={2}
                      placeholder="Any special notes for this day..."
                      value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Include Mumineen by Status</label>
                    <p className="text-muted mb-2" style={{ fontSize: '12px' }}>Select which statuses receive thaali today. Count is auto-calculated.</p>
                    <div className="row g-2">
                      {niyyatStatuses.map(s => {
                        const isSelected = selectedStatuses.includes(s.id)
                        return (
                          <div key={s.id} className="col-md-4">
                            <div
                              onClick={() => toggleStatus(s.id)}
                              style={{
                                border: `2px solid ${isSelected ? '#364574' : '#dee2e6'}`,
                                borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
                                background: isSelected ? '#f0f4ff' : '#fff',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}>
                              <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400 }}>{s.name}</span>
                              {isSelected && (
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#364574' }}>
                                  {statusCounts[s.id] || 0}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {selectedStatuses.length > 0 && (
                    <div className="col-12">
                      <div className="alert alert-primary py-2 mb-0" style={{ fontSize: '13px' }}>
                        <strong>Total Thaalis: {totalThaalis}</strong>
                        {' — '}
                        {selectedStatuses.map(id => {
                          const s = niyyatStatuses.find(n => n.id === id)
                          return `${s?.name}: ${statusCounts[id] || 0}`
                        }).join(' | ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer d-flex justify-content-between">
                <button className="btn btn-outline-success btn-sm" onClick={exportDistributorReport}
                  disabled={exporting || selectedStatuses.length === 0}>
                  {exporting ? 'Exporting...' : '↓ Distributor Report (CSV)'}
                </button>
                <div className="d-flex gap-2">
                  <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}