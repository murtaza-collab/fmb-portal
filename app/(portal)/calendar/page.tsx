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

interface DailyMenu {
  id?: number
  menu_date: string
  roti: string
  tarkari: string
  chawal: string
  soup: string
  mithas: string
  salad: string
  extra_items: ExtraItem[]
  notes: string
}

interface ExtraItem {
  name: string
  description: string
}

interface NiyyatStatus { id: number; name: string }
interface FiscalYear { id: number; gregorian_year: number; hijri_year: string; is_active: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const FIXED_ITEMS = [
  { key: 'roti', label: 'Roti', placeholder: 'e.g. Chapati, Tandoori Roti' },
  { key: 'tarkari', label: 'Tarkari', placeholder: 'e.g. Aloo Gobi, Daal' },
  { key: 'chawal', label: 'Chawal', placeholder: 'e.g. Zeera Rice, Biryani' },
  { key: 'soup', label: 'Soup', placeholder: 'e.g. Tomato Soup, Lentil Soup' },
  { key: 'mithas', label: 'Mithas', placeholder: 'e.g. Gulab Jamun, Kheer' },
  { key: 'salad', label: 'Salad', placeholder: 'e.g. Garden Salad, Raita' },
]

const emptyMenu = (): DailyMenu => ({
  menu_date: '',
  roti: '', tarkari: '', chawal: '',
  soup: '', mithas: '', salad: '',
  extra_items: [],
  notes: '',
})

export default function CalendarPage() {
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [dailyMenus, setDailyMenus] = useState<DailyMenu[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [activeFY, setActiveFY] = useState<FiscalYear | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const selectedEventRef = useRef<CalendarEvent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState<'menu' | 'event'>('menu')
  const [isPastDate, setIsPastDate] = useState(false)

  // Event form
  const [form, setForm] = useState({ menu: '', notes: '' })
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<number, number>>({})

  // Daily menu form
  const [menuForm, setMenuForm] = useState<DailyMenu>(emptyMenu())
  const [menuSaving, setMenuSaving] = useState(false)

  useEffect(() => {
    fetchLookups()
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetchEvents()
    fetchMonthMenus()
  }, [currentYear, currentMonth])

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

  const fetchMonthMenus = async () => {
    const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
    const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-31`
    const { data } = await supabase
      .from('daily_menu')
      .select('*')
      .gte('menu_date', startDate)
      .lte('menu_date', endDate)
    setDailyMenus(data || [])
  }

  const openDayModal = async (dateStr: string) => {
    setSelectedDate(dateStr)
    setActiveTab('menu')
    setIsPastDate(dateStr < todayStr)

    // Load event
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

    // Load daily menu
    const { data: existingMenu } = await supabase
      .from('daily_menu')
      .select('*')
      .eq('menu_date', dateStr)
      .maybeSingle()

    if (existingMenu) {
      setMenuForm({
        ...existingMenu,
        extra_items: existingMenu.extra_items || [],
      })
    } else {
      setMenuForm({ ...emptyMenu(), menu_date: dateStr })
    }

    setShowModal(true)
  }

  const handleMenuSave = async () => {
    if (!selectedDate || isPastDate) return
    setMenuSaving(true)
    try {
      const payload = {
        menu_date: selectedDate,
        roti: menuForm.roti,
        tarkari: menuForm.tarkari,
        chawal: menuForm.chawal,
        soup: menuForm.soup,
        mithas: menuForm.mithas,
        salad: menuForm.salad,
        extra_items: menuForm.extra_items,
        notes: menuForm.notes,
      }
      if (menuForm.id) {
        await supabase.from('daily_menu').update(payload).eq('id', menuForm.id)
      } else {
        const { data } = await supabase.from('daily_menu').insert(payload).select('id').single()
        if (data) setMenuForm(prev => ({ ...prev, id: data.id }))
      }
      await fetchMonthMenus()
    } catch (err) {
      console.error('Menu save error:', err)
    } finally {
      setMenuSaving(false)
    }
  }

  const addExtraItem = () => {
    setMenuForm(prev => ({
      ...prev,
      extra_items: [...prev.extra_items, { name: '', description: '' }]
    }))
  }

  const updateExtraItem = (index: number, field: 'name' | 'description', value: string) => {
    setMenuForm(prev => {
      const updated = [...prev.extra_items]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, extra_items: updated }
    })
  }

  const removeExtraItem = (index: number) => {
    setMenuForm(prev => ({
      ...prev,
      extra_items: prev.extra_items.filter((_, i) => i !== index)
    }))
  }

  const toggleStatus = async (statusId: number) => {
    if (isPastDate) return
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
    if (!selectedDate || isPastDate) return
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
        event_date: selectedDate, menu: form.menu, notes: form.notes,
        fiscal_year_id: activeFY?.id || null, status: 'active'
      }).select('id').single()
      if (error || !data) { setSaving(false); return }
      eventId = data.id
    }

    const statusRows = selectedStatuses.map(statusId => ({
      event_id: eventId, niyyat_status_id: statusId, thaali_count: statusCounts[statusId] || 0
    }))
    if (statusRows.length > 0) await supabase.from('calendar_event_statuses').insert(statusRows)

    await fetchEvents()
    setShowModal(false)
    setSaving(false)
  }

  const exportDistributorReport = async () => {
    if (!selectedDate) return
    setExporting(true)
    const { data: registrations } = await supabase
      .from('thaali_registrations')
      .select(`*, mumineen!fk_tr_mumin(sf_no, full_name, its_no, whatsapp_no, full_address, niyyat_status_id, house_sectors(name)), thaalis!fk_tr_thaali(thaali_number), thaali_types!fk_tr_type(name), thaali_categories!fk_tr_category(name), distributors!fk_tr_distributor(full_name)`)
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
      (a.distributors?.full_name || '').localeCompare(b.distributors?.full_name || ''))

    const headers = ['Distributor', 'Thaali No', 'SF#', 'ITS#', 'Name', 'Sector', 'Address', 'WhatsApp', 'Size', 'Type']
    const rows = sorted.map((r: any) => [
      r.distributors?.full_name || '', r.thaalis?.thaali_number || '',
      r.mumineen?.sf_no || '', r.mumineen?.its_no || '', r.mumineen?.full_name || '',
      r.mumineen?.house_sectors?.name || '', r.mumineen?.full_address || '',
      r.mumineen?.whatsapp_no || '', r.thaali_types?.name || '', r.thaali_categories?.name || '',
    ])

    const csv = [headers, ...rows].map(row =>
      row.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `distribution_report_${selectedDate}.csv`
    a.click()
    setExporting(false)
  }

  // helpers
  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const totalThaalis = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const hasMenu = (dateStr: string) => dailyMenus.some(m => m.menu_date === dateStr)

  const daysWithData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const event = events.find(e => e.event_date === dateStr)
    const menu = dailyMenus.find(m => m.menu_date === dateStr)
    const totalCount = (event?.calendar_event_statuses || []).reduce((a, s) => a + (s.thaali_count || 0), 0)
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay()
    return { day, dateStr, event, menu, totalCount, dayOfWeek }
  })

  const menuSummary = (m: DailyMenu) => {
    const items = [m.roti, m.tarkari, m.chawal, m.soup, m.mithas, m.salad].filter(Boolean)
    const extras = (m.extra_items || []).map(e => e.name).filter(Boolean)
    return [...items, ...extras].slice(0, 3).join(', ') + (items.length + extras.length > 3 ? '...' : '')
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Calendar</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Daily menu planning and thaali distribution</p>
        </div>
      </div>

      <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
        <div className="card-body">
          {/* Month navigator */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <button className="btn btn-sm btn-outline-secondary" onClick={prevMonth}>‹ Prev</button>
            <h5 className="mb-0 fw-semibold" style={{ fontSize: isMobile ? '15px' : '18px' }}>
              {MONTHS[currentMonth]} {currentYear}
            </h5>
            <button className="btn btn-sm btn-outline-secondary" onClick={nextMonth}>Next ›</button>
          </div>

          {/* Legend */}
          <div className="d-flex gap-3 mb-3" style={{ fontSize: '11px', color: '#6c757d' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#f0f4ff', border: '1px solid #364574', marginRight: 4 }}></span>Has Event</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#fff8e1', border: '1px solid #f59e0b', marginRight: 4 }}></span>Menu Set</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#e8f5e9', border: '1px solid #0ab39c', marginRight: 4 }}></span>Both</span>
          </div>

          {/* DESKTOP grid */}
          {!isMobile && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6c757d', padding: '4px' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} style={{ minHeight: '90px' }} />
                ))}
                {daysWithData.map(({ day, dateStr, event, menu, totalCount }) => {
                  const isToday = dateStr === todayStr
                  const isPast = dateStr < todayStr
                  const hasEvent = !!event
                  const hasMnu = !!menu
                  const bg = hasEvent && hasMnu ? '#e8f5e9' : hasMnu ? '#fff8e1' : hasEvent ? '#f0f4ff' : isPast ? '#fafafa' : '#fff'
                  const borderColor = isToday ? '#364574' : hasEvent && hasMnu ? '#0ab39c' : hasMnu ? '#f59e0b' : hasEvent ? '#364574' : '#e9ecef'
                  return (
                    <div key={day}
                      onClick={() => openDayModal(dateStr)}
                      style={{
                        minHeight: '90px', padding: '6px', borderRadius: '8px', cursor: 'pointer',
                        border: `${isToday ? '2px' : '1px'} solid ${borderColor}`,
                        background: bg, transition: 'all 0.15s',
                        opacity: isPast ? 0.7 : 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = isPast ? '0.7' : '1')}
                    >
                      <div style={{ fontSize: '13px', fontWeight: isToday ? 700 : 500, color: isToday ? '#364574' : isPast ? '#adb5bd' : '#333', marginBottom: '3px' }}>
                        {day}
                        {isPast && <i className="bi bi-lock ms-1" style={{ fontSize: '9px', color: '#adb5bd' }}></i>}
                      </div>
                      {hasMnu && (
                        <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🍽 {menuSummary(menu!)}
                        </div>
                      )}
                      {totalCount > 0 && (
                        <div style={{ fontSize: '10px', color: '#0ab39c', fontWeight: 600, marginTop: '2px' }}>
                          {totalCount} thaalis
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* MOBILE view */}
          {isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '2px' }}>
                {DAYS_SHORT.map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#6c757d' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '12px' }}>
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} style={{ minHeight: '40px' }} />
                ))}
                {daysWithData.map(({ day, dateStr, event, menu, totalCount }) => {
                  const isToday = dateStr === todayStr
                  const isPast = dateStr < todayStr
                  return (
                    <div key={day}
                      onClick={() => openDayModal(dateStr)}
                      style={{
                        minHeight: '40px', padding: '3px', borderRadius: '6px', cursor: 'pointer',
                        border: isToday ? '2px solid #364574' : '1px solid #e9ecef',
                        background: event && menu ? '#e8f5e9' : menu ? '#fff8e1' : event ? '#f0f4ff' : isPast ? '#fafafa' : '#fff',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        opacity: isPast ? 0.7 : 1,
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: isToday ? 700 : 500, color: isToday ? '#364574' : isPast ? '#adb5bd' : '#333' }}>{day}</div>
                      {(event || menu) && (
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#364574', marginTop: '2px' }} />
                      )}
                      {totalCount > 0 && (
                        <div style={{ fontSize: '9px', color: '#0ab39c', fontWeight: 700 }}>{totalCount}</div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6c757d', marginBottom: '8px' }}>
                  This month ({events.length} events, {dailyMenus.length} menus)
                </div>
                {daysWithData.filter(d => d.event || d.menu).map(({ day, dateStr, event, menu, totalCount, dayOfWeek }) => (
                  <div key={day}
                    onClick={() => openDayModal(dateStr)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                      background: '#f8f9fa', marginBottom: '6px', border: '1px solid #e9ecef',
                    }}
                  >
                    <div style={{ textAlign: 'center', minWidth: '36px' }}>
                      <div style={{ fontSize: '11px', color: '#6c757d' }}>{DAYS[dayOfWeek]}</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: dateStr === todayStr ? '#364574' : '#212529', lineHeight: 1 }}>{day}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {menu && (
                        <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
                          🍽 {menuSummary(menu)}
                        </div>
                      )}
                      {totalCount > 0 && (
                        <div style={{ fontSize: '12px', color: '#0ab39c', fontWeight: 500 }}>{totalCount} thaalis</div>
                      )}
                    </div>
                    <i className="bi bi-chevron-right" style={{ fontSize: '12px', color: '#adb5bd' }} />
                  </div>
                ))}
                <button className="btn btn-outline-primary btn-sm w-100 mt-2"
                  onClick={() => {
                    const d = new Date()
                    const ds = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                    openDayModal(ds)
                  }}>
                  + Add Menu / Event for Today
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Day Modal */}
      {showModal && selectedDate && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ fontSize: isMobile ? '14px' : '16px' }}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  })}
                  {isPastDate && (
                    <span className="badge bg-secondary ms-2" style={{ fontSize: '11px' }}>
                      <i className="bi bi-lock me-1"></i>Past Date — View Only
                    </span>
                  )}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>

              {/* Tabs */}
              <div className="modal-header border-0 pt-0 pb-0">
                <ul className="nav nav-tabs w-100">
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeTab === 'menu' ? 'active fw-bold' : ''}`}
                      onClick={() => setActiveTab('menu')}
                    >
                      🍽 Daily Menu
                      {menuForm.roti && <span className="badge bg-success ms-2" style={{ fontSize: '10px' }}>Set</span>}
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeTab === 'event' ? 'active fw-bold' : ''}`}
                      onClick={() => setActiveTab('event')}
                    >
                      📅 Event / Thaali Count
                      {selectedEvent && <span className="badge bg-primary ms-2" style={{ fontSize: '10px' }}>Set</span>}
                    </button>
                  </li>
                </ul>
              </div>

              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>

                {/* ── MENU TAB ── */}
                {activeTab === 'menu' && (
                  <div>
                    {isPastDate ? (
                      <div className="alert alert-secondary py-2 mb-3" style={{ fontSize: '12px' }}>
                        <i className="bi bi-lock me-2"></i>
                        Past date — view only. Menu and events cannot be edited.
                      </div>
                    ) : (
                      <p className="text-muted mb-3" style={{ fontSize: '12px' }}>
                        Fill in today's menu items. Mumin will see this in the app and can customize their quantities.
                        Cutoff for mumin requests: <strong>4:00 PM the day before</strong>.
                      </p>
                    )}

                    {/* Fixed items */}
                    <div className="row g-3 mb-3">
                      {FIXED_ITEMS.map(item => (
                        <div className="col-12 col-md-6" key={item.key}>
                          <label className="form-label fw-semibold mb-1" style={{ fontSize: '13px' }}>
                            {item.label}
                            {!isPastDate && (
                              <span className="text-muted fw-normal ms-1" style={{ fontSize: '11px' }}>
                                (leave blank if not serving)
                              </span>
                            )}
                          </label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder={item.placeholder}
                            value={(menuForm as any)[item.key] || ''}
                            onChange={e => setMenuForm(prev => ({ ...prev, [item.key]: e.target.value }))}
                            disabled={isPastDate}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Extra items */}
                    <div className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <label className="form-label fw-semibold mb-0" style={{ fontSize: '13px' }}>
                          Extra Items
                          <span className="text-muted fw-normal ms-1" style={{ fontSize: '11px' }}>
                            (Fruit, Kheer, anything additional)
                          </span>
                        </label>
                        {!isPastDate && (
                          <button className="btn btn-outline-primary btn-sm" onClick={addExtraItem}>
                            <i className="bi bi-plus me-1"></i>Add Extra
                          </button>
                        )}
                      </div>

                      {menuForm.extra_items.length === 0 && (
                        <div className="text-muted text-center py-2" style={{ fontSize: '12px', border: '1px dashed #dee2e6', borderRadius: 6 }}>
                          {isPastDate ? 'No extras were added for this day.' : 'No extras added. Click "Add Extra" to add items like Fruit, Kheer, etc.'}
                        </div>
                      )}

                      {menuForm.extra_items.map((item, index) => (
                        <div key={index} className="d-flex gap-2 align-items-center mb-2">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Item name e.g. Fruit"
                            value={item.name}
                            onChange={e => updateExtraItem(index, 'name', e.target.value)}
                            disabled={isPastDate}
                          />
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Description (optional)"
                            value={item.description}
                            onChange={e => updateExtraItem(index, 'description', e.target.value)}
                            disabled={isPastDate}
                          />
                          {!isPastDate && (
                            <button className="btn btn-outline-danger btn-sm" onClick={() => removeExtraItem(index)}>
                              <i className="bi bi-trash"></i>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Menu notes */}
                    <div>
                      <label className="form-label fw-semibold mb-1" style={{ fontSize: '13px' }}>Kitchen Notes</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        placeholder="Any notes for the kitchen team..."
                        value={menuForm.notes}
                        onChange={e => setMenuForm(prev => ({ ...prev, notes: e.target.value }))}
                        disabled={isPastDate}
                      />
                    </div>
                  </div>
                )}

                {/* ── EVENT TAB ── */}
                {activeTab === 'event' && (
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" style={{ fontSize: '13px' }}>Event Note</label>
                      <input type="text" className="form-control form-control-sm"
                        placeholder="e.g. Eid, Ashura, special occasion..."
                        value={form.menu} onChange={(e) => setForm(p => ({ ...p, menu: e.target.value }))}
                        disabled={isPastDate}
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" style={{ fontSize: '13px' }}>Notes</label>
                      <textarea className="form-control form-control-sm" rows={2}
                        placeholder="Any special notes for this day..."
                        value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                        disabled={isPastDate}
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" style={{ fontSize: '13px' }}>Include Mumineen by Status</label>
                      {!isPastDate && (
                        <p className="text-muted mb-2" style={{ fontSize: '12px' }}>Select which statuses receive thaali today.</p>
                      )}
                      <div className="row g-2">
                        {niyyatStatuses.map(s => {
                          const isSelected = selectedStatuses.includes(s.id)
                          return (
                            <div key={s.id} className="col-6 col-md-4">
                              <div
                                onClick={() => toggleStatus(s.id)}
                                style={{
                                  border: `2px solid ${isSelected ? '#364574' : '#dee2e6'}`,
                                  borderRadius: '8px', padding: '8px 10px',
                                  cursor: isPastDate ? 'default' : 'pointer',
                                  background: isSelected ? '#f0f4ff' : '#fff',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  opacity: isPastDate ? 0.8 : 1,
                                }}>
                                <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400 }}>{s.name}</span>
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
                )}
              </div>

              {/* Footer */}
              <div className="modal-footer flex-wrap gap-2">
                {activeTab === 'event' && (
                  <button className="btn btn-outline-success btn-sm" onClick={exportDistributorReport}
                    disabled={exporting || selectedStatuses.length === 0}>
                    {exporting ? 'Exporting...' : '↓ Distributor Report'}
                  </button>
                )}
                <div className="d-flex gap-2 ms-auto">
                  <button className="btn btn-light btn-sm" onClick={() => setShowModal(false)}>
                    {isPastDate ? 'Close' : 'Cancel'}
                  </button>
                  {!isPastDate && (
                    <>
                      {activeTab === 'menu' ? (
                        <button className="btn btn-primary btn-sm" onClick={handleMenuSave} disabled={menuSaving}>
                          {menuSaving ? 'Saving...' : 'Save Menu'}
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                          {saving ? 'Saving...' : 'Save Event'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}