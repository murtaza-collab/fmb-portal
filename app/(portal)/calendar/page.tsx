'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  gregorianToHijri, hijriToGregorian, formatHijri,
  HIJRI_MONTHS, HIJRI_MONTHS_SHORT,
  daysInHijriMonth, todayHijri, hijriMonthStart
} from '@/lib/hijri'

// ── Static data ──
const NIYYAT_STATUSES = [
  { id: 1, name: 'Approved' }, { id: 2, name: 'Niyyat Pending' },
  { id: 3, name: 'No-Show' }, { id: 4, name: 'Stopped' },
  { id: 5, name: 'Transferred' }, { id: 6, name: 'Verified' },
  { id: 7, name: 'Change Address' }, { id: 8, name: 'Distributor Required' },
  { id: 9, name: 'Not Required' }, { id: 10, name: 'Pending Thaali' },
  { id: 11, name: 'Pending Approval' },
]

const THAALI_CATEGORIES = [
  { id: 1, name: 'Mini' }, { id: 2, name: 'Small' },
  { id: 3, name: 'Medium' }, { id: 4, name: 'Large' },
]

interface CalendarEvent {
  id: number; event_date: string; menu: string; notes?: string
}

interface DailyMenu {
  id: number; menu_date: string
  roti?: string; tarkari?: string; chawal?: string
  soup?: string; mithas?: string; salad?: string; notes?: string
}

interface ThaaliSchedule {
  id: number; event_date: string; event_name?: string
  thaali_enabled: boolean; niyyat_status_ids: number[]
  extra_thaali_count: number; thaali_category_ids: number[]; notes?: string
}

interface ThaaliCount { approved: number; byCategory: Record<number, number>; total: number }

type ViewMode = 'gregorian' | 'hijri'
type ModalTab = 'menu' | 'event' | 'thaali'

const GREG_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function CalendarPage() {
  const today = new Date()
  const todayH = todayHijri()

  const [viewMode, setViewMode] = useState<ViewMode>('gregorian')
  const [gYear, setGYear] = useState(today.getFullYear())
  const [gMonth, setGMonth] = useState(today.getMonth())
  const [hYear, setHYear] = useState(todayH.year)
  const [hMonth, setHMonth] = useState(todayH.month)

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [menus, setMenus] = useState<DailyMenu[]>([])
  const [schedules, setSchedules] = useState<ThaaliSchedule[]>([])
  const [thaaliCounts, setThaaliCounts] = useState<Record<string, ThaaliCount>>({})

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalTab, setModalTab] = useState<ModalTab>('thaali')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Menu form
  const [menuForm, setMenuForm] = useState({ mithas: '', tarkari: '', soup: '', chawal: '', roti: '', salad: '', notes: '' })
  const [editMenu, setEditMenu] = useState<DailyMenu | null>(null)

  // Event form
  const [eventForm, setEventForm] = useState({ menu: '', notes: '' })
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)

  // Thaali schedule form
  const [scheduleForm, setScheduleForm] = useState({
    event_name: '',
    thaali_enabled: true,
    niyyat_status_ids: [1], // Approved by default
    extra_thaali_count: 0,
    thaali_category_ids: [] as number[],
    notes: '',
  })
  const [editSchedule, setEditSchedule] = useState<ThaaliSchedule | null>(null)

  useEffect(() => { fetchData() }, [gYear, gMonth, hYear, hMonth, viewMode])

  const fetchData = async () => {
    setLoading(true)
    let startDate: string, endDate: string

    if (viewMode === 'gregorian') {
      startDate = `${gYear}-${String(gMonth + 1).padStart(2, '0')}-01`
      const lastDay = new Date(gYear, gMonth + 1, 0).getDate()
      endDate = `${gYear}-${String(gMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else {
      const firstDay = hijriMonthStart(hYear, hMonth)
      const days = daysInHijriMonth(hMonth, hYear)
      const lastDay = new Date(firstDay); lastDay.setDate(lastDay.getDate() + days - 1)
      startDate = firstDay.toISOString().split('T')[0]
      endDate = lastDay.toISOString().split('T')[0]
    }

    const [{ data: evData }, { data: mnData }, { data: schData }] = await Promise.all([
      supabase.from('calendar_events').select('*').gte('event_date', startDate).lte('event_date', endDate),
      supabase.from('daily_menu').select('*').gte('menu_date', startDate).lte('menu_date', endDate),
      supabase.from('thaali_schedule').select('*').gte('event_date', startDate).lte('event_date', endDate),
    ])

    setEvents(evData || [])
    setMenus(mnData || [])
    setSchedules(schData || [])

    // Fetch thaali counts for scheduled days
    if (schData && schData.length > 0) {
      await fetchThaaliCounts(schData)
    }
    setLoading(false)
  }

  const fetchThaaliCounts = async (schData: ThaaliSchedule[]) => {
    const counts: Record<string, ThaaliCount> = {}
    for (const sch of schData) {
      if (!sch.thaali_enabled) { counts[sch.event_date] = { approved: 0, byCategory: {}, total: 0 }; continue }

      let query = supabase
        .from('thaali_registrations')
        .select('id, thaali_category_id', { count: 'exact' })
        .eq('status', 'active')

      // Filter by niyyat statuses via mumineen join
      if (sch.niyyat_status_ids?.length) {
        const { data: muminIds } = await supabase
          .from('mumineen')
          .select('id')
          .in('niyyat_status_id', sch.niyyat_status_ids)
          .eq('is_hof', true)
          .eq('status', 'active')
        const ids = (muminIds || []).map(m => m.id)
        if (ids.length === 0) { counts[sch.event_date] = { approved: 0, byCategory: {}, total: 0 }; continue }
        query = query.in('mumin_id', ids)
      }

      // Filter by category if specified
      if (sch.thaali_category_ids?.length) {
        query = query.in('thaali_category_id', sch.thaali_category_ids)
      }

      const { data: regs, count } = await query
      const byCategory: Record<number, number> = {}
      if (regs) {
        for (const r of regs) {
          byCategory[r.thaali_category_id] = (byCategory[r.thaali_category_id] || 0) + 1
        }
      }
      counts[sch.event_date] = {
        approved: count ?? 0,
        byCategory,
        total: (count ?? 0) + (sch.extra_thaali_count || 0),
      }
    }
    setThaaliCounts(counts)
  }

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 3000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 2000) }
  }

  const openDay = (dateStr: string) => {
    setSelectedDate(dateStr)

    const existingMenu = menus.find(m => m.menu_date === dateStr)
    setEditMenu(existingMenu || null)
    setMenuForm(existingMenu
      ? { mithas: existingMenu.mithas||'', tarkari: existingMenu.tarkari||'', soup: existingMenu.soup||'', chawal: existingMenu.chawal||'', roti: existingMenu.roti||'', salad: existingMenu.salad||'', notes: existingMenu.notes||'' }
      : { mithas: '', tarkari: '', soup: '', chawal: '', roti: '', salad: '', notes: '' }
    )

    const existingEvent = events.find(e => e.event_date === dateStr)
    setEditEvent(existingEvent || null)
    setEventForm(existingEvent ? { menu: existingEvent.menu, notes: existingEvent.notes||'' } : { menu: '', notes: '' })

    const existingSchedule = schedules.find(s => s.event_date === dateStr)
    setEditSchedule(existingSchedule || null)
    setScheduleForm(existingSchedule
      ? {
          event_name: existingSchedule.event_name || '',
          thaali_enabled: existingSchedule.thaali_enabled,
          niyyat_status_ids: existingSchedule.niyyat_status_ids || [1],
          extra_thaali_count: existingSchedule.extra_thaali_count || 0,
          thaali_category_ids: existingSchedule.thaali_category_ids || [],
          notes: existingSchedule.notes || '',
        }
      : { event_name: '', thaali_enabled: true, niyyat_status_ids: [1], extra_thaali_count: 0, thaali_category_ids: [], notes: '' }
    )

    setModalTab('thaali')
    setShowModal(true)
  }

  const saveMenu = async () => {
    if (!selectedDate) return
    setSaving(true)
    const payload = { ...menuForm, menu_date: selectedDate }
    const { error } = editMenu
      ? await supabase.from('daily_menu').update(payload).eq('id', editMenu.id)
      : await supabase.from('daily_menu').insert(payload)
    setSaving(false)
    if (error) return showMsg(error.message, true)
    showMsg('Menu saved'); setShowModal(false); fetchData()
  }

  const saveEvent = async () => {
    if (!selectedDate || !eventForm.menu.trim()) return showMsg('Event name required', true)
    setSaving(true)
    const payload = { ...eventForm, event_date: selectedDate }
    const { error } = editEvent
      ? await supabase.from('calendar_events').update(payload).eq('id', editEvent.id)
      : await supabase.from('calendar_events').insert(payload)
    setSaving(false)
    if (error) return showMsg(error.message, true)
    showMsg('Event saved'); setShowModal(false); fetchData()
  }

  const saveSchedule = async () => {
    if (!selectedDate) return
    setSaving(true)
    const payload = {
      event_date: selectedDate,
      event_name: scheduleForm.event_name || null,
      thaali_enabled: scheduleForm.thaali_enabled,
      niyyat_status_ids: scheduleForm.thaali_enabled ? scheduleForm.niyyat_status_ids : [],
      extra_thaali_count: scheduleForm.thaali_enabled ? (scheduleForm.extra_thaali_count || 0) : 0,
      thaali_category_ids: scheduleForm.thaali_enabled ? scheduleForm.thaali_category_ids : [],
      notes: scheduleForm.notes || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = editSchedule
      ? await supabase.from('thaali_schedule').update(payload).eq('id', editSchedule.id)
      : await supabase.from('thaali_schedule').insert(payload)
    setSaving(false)
    if (error) return showMsg(error.message, true)
    showMsg('Thaali schedule saved'); setShowModal(false); fetchData()
  }

  const deleteMenu = async () => {
    if (!editMenu || !confirm('Delete menu for this day?')) return
    await supabase.from('daily_menu').delete().eq('id', editMenu.id)
    showMsg('Deleted'); setShowModal(false); fetchData()
  }

  const deleteEvent = async () => {
    if (!editEvent || !confirm('Delete event?')) return
    await supabase.from('calendar_events').delete().eq('id', editEvent.id)
    showMsg('Deleted'); setShowModal(false); fetchData()
  }

  const deleteSchedule = async () => {
    if (!editSchedule || !confirm('Remove thaali schedule for this day?')) return
    await supabase.from('thaali_schedule').delete().eq('id', editSchedule.id)
    showMsg('Deleted'); setShowModal(false); fetchData()
  }

  const toggleNiyyat = (id: number) => {
    setScheduleForm(prev => ({
      ...prev,
      niyyat_status_ids: prev.niyyat_status_ids.includes(id)
        ? prev.niyyat_status_ids.filter(x => x !== id)
        : [...prev.niyyat_status_ids, id]
    }))
  }

  const toggleCategory = (id: number) => {
    setScheduleForm(prev => ({
      ...prev,
      thaali_category_ids: prev.thaali_category_ids.includes(id)
        ? prev.thaali_category_ids.filter(x => x !== id)
        : [...prev.thaali_category_ids, id]
    }))
  }

  const navPrev = () => {
    if (viewMode === 'gregorian') {
      if (gMonth === 0) { setGMonth(11); setGYear(y => y - 1) } else setGMonth(m => m - 1)
    } else {
      if (hMonth === 1) { setHMonth(12); setHYear(y => y - 1) } else setHMonth(m => m - 1)
    }
  }

  const navNext = () => {
    if (viewMode === 'gregorian') {
      if (gMonth === 11) { setGMonth(0); setGYear(y => y + 1) } else setGMonth(m => m + 1)
    } else {
      if (hMonth === 12) { setHMonth(1); setHYear(y => y + 1) } else setHMonth(m => m + 1)
    }
  }

  const goToday = () => {
    setGYear(today.getFullYear()); setGMonth(today.getMonth())
    setHYear(todayH.year); setHMonth(todayH.month)
  }

  const getDateStr = (d: Date) => d.toISOString().split('T')[0]
  const isToday = (dateStr: string) => dateStr === getDateStr(today)
  const hasMenu = (dateStr: string) => menus.some(m => m.menu_date === dateStr)
  const hasEvent = (dateStr: string) => events.some(e => e.event_date === dateStr)
  const getSchedule = (dateStr: string) => schedules.find(s => s.event_date === dateStr)

  const buildGregorianGrid = () => {
    const firstDay = new Date(gYear, gMonth, 1).getDay()
    const daysInMonth = new Date(gYear, gMonth + 1, 0).getDate()
    const cells: (Date | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(gYear, gMonth, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  const buildHijriGrid = () => {
    const firstGreg = hijriMonthStart(hYear, hMonth)
    const firstDow = firstGreg.getDay()
    const days = daysInHijriMonth(hMonth, hYear)
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  const getHijriOverlay = (date: Date) => {
    const h = gregorianToHijri(date)
    return { day: h.day, month: h.month, year: h.year, isFirst: h.day === 1 }
  }

  const getTitle = () => viewMode === 'gregorian'
    ? `${GREG_MONTHS[gMonth]} ${gYear}`
    : `${HIJRI_MONTHS[hMonth - 1]} ${hYear}H`

  const getSubtitle = () => {
    if (viewMode === 'hijri') {
      const start = hijriMonthStart(hYear, hMonth)
      const end = new Date(start); end.setDate(end.getDate() + daysInHijriMonth(hMonth, hYear) - 1)
      return `${start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    const h1 = gregorianToHijri(new Date(gYear, gMonth, 1))
    const h2 = gregorianToHijri(new Date(gYear, gMonth + 1, 0))
    return `${formatHijri(h1.year, h1.month, h1.day, true)} – ${formatHijri(h2.year, h2.month, h2.day, true)}`
  }

  const gregCells = viewMode === 'gregorian' ? buildGregorianGrid() : []
  const hijriCells = viewMode === 'hijri' ? buildHijriGrid() : []

  const renderCell = (dateStr: string, label: string | number, hijriOverlay?: { day: number; month: number; isFirst: boolean }, gregOverlay?: string) => {
    const isTod = isToday(dateStr)
    const hasM = hasMenu(dateStr)
    const hasE = hasEvent(dateStr)
    const sch = getSchedule(dateStr)
    const count = thaaliCounts[dateStr]

    return (
      <div
        onClick={() => openDay(dateStr)}
        style={{
          minHeight: '88px', padding: '6px 8px', cursor: 'pointer',
          borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
          background: isTod ? '#364574' : 'white', transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isTod) (e.currentTarget as HTMLElement).style.background = '#f8f9ff' }}
        onMouseLeave={e => { if (!isTod) (e.currentTarget as HTMLElement).style.background = 'white' }}
      >
        {/* Primary date number */}
        <div style={{ fontSize: '14px', fontWeight: 700, color: isTod ? '#fff' : '#212529', marginBottom: '1px' }}>{label}</div>

        {/* Hijri overlay */}
        {hijriOverlay && (
          <div style={{ fontSize: '10px', color: isTod ? 'rgba(255,255,255,0.7)' : hijriOverlay.isFirst ? '#364574' : '#bbb', fontWeight: hijriOverlay.isFirst ? 700 : 400, marginBottom: '3px' }}>
            {hijriOverlay.isFirst ? `1 ${HIJRI_MONTHS_SHORT[hijriOverlay.month - 1]}` : hijriOverlay.day}
          </div>
        )}

        {/* Gregorian overlay (hijri view) */}
        {gregOverlay && (
          <div style={{ fontSize: '10px', color: isTod ? 'rgba(255,255,255,0.7)' : '#bbb', marginBottom: '3px' }}>{gregOverlay}</div>
        )}

        {/* Indicators row */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '2px' }}>
          {hasM && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isTod ? '#ffbf69' : '#0ab39c' }} title="Menu" />}
          {hasE && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isTod ? '#fff' : '#364574' }} title="Event" />}
          {sch && (
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sch.thaali_enabled ? (isTod ? '#90ee90' : '#28a745') : (isTod ? '#ffaaaa' : '#e63946') }} title={sch.thaali_enabled ? 'Thaali day' : 'No thaali'} />
          )}
        </div>

        {/* Thaali count */}
        {sch?.thaali_enabled && count && (
          <div style={{ fontSize: '9px', fontWeight: 700, color: isTod ? '#90ee90' : '#28a745' }}>
            {count.total} thaalis
          </div>
        )}

        {/* No thaali label */}
        {sch && !sch.thaali_enabled && (
          <div style={{ fontSize: '9px', color: isTod ? '#ffaaaa' : '#e63946', fontWeight: 600 }}>No thaali</div>
        )}

        {/* Event name */}
        {hasE && (
          <div style={{ fontSize: '9px', color: isTod ? '#ffbf69' : '#364574', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {events.find(e => e.event_date === dateStr)?.menu}
          </div>
        )}
      </div>
    )
  }

  // Selected day thaali count for modal
  const selectedCount = selectedDate ? thaaliCounts[selectedDate] : null

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: '#212529' }}>Calendar</h4>
          <p className="mb-0 text-muted" style={{ fontSize: '13px' }}>{getSubtitle()}</p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <div style={{ display: 'flex', background: '#f3f3f9', borderRadius: '8px', padding: '3px' }}>
            {(['gregorian', 'hijri'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none', fontSize: '12px',
                fontWeight: 600, cursor: 'pointer',
                background: viewMode === mode ? '#364574' : 'transparent',
                color: viewMode === mode ? '#fff' : '#6c757d',
              }}>
                {mode === 'gregorian' ? 'Gregorian' : 'Hijri (Misri)'}
              </button>
            ))}
          </div>
          <button onClick={goToday} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: '8px', fontSize: '12px' }}>Today</button>
          <div className="d-flex gap-1">
            <button onClick={navPrev} className="btn btn-sm" style={{ background: '#f3f3f9', border: 'none', borderRadius: '8px', color: '#364574' }}><i className="bi bi-chevron-left" /></button>
            <button onClick={navNext} className="btn btn-sm" style={{ background: '#f3f3f9', border: 'none', borderRadius: '8px', color: '#364574' }}><i className="bi bi-chevron-right" /></button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '13px' }}>{error}</div>}
      {success && <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: '13px' }}>{success}</div>}

      {/* Calendar */}
      <div className="card" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e9ebec' }}>
          <h5 className="mb-0 fw-bold" style={{ color: '#364574' }}>{getTitle()}</h5>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e9ebec' }}>
            {DOW.map(d => (
              <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-5"><div className="spinner-border spinner-border-sm" style={{ color: '#364574' }} /></div>
          ) : viewMode === 'gregorian' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {gregCells.map((cell, i) => {
                if (!cell) return <div key={i} style={{ minHeight: '88px', background: '#fafafa', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }} />
                const dateStr = getDateStr(cell)
                const hOverlay = getHijriOverlay(cell)
                return <div key={i}>{renderCell(dateStr, cell.getDate(), hOverlay)}</div>
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {hijriCells.map((cell, i) => {
                if (!cell) return <div key={i} style={{ minHeight: '88px', background: '#fafafa', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }} />
                const gDate = hijriToGregorian(hYear, hMonth, cell)
                const dateStr = getDateStr(gDate)
                const gregLabel = gDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                return <div key={i}>{renderCell(dateStr, cell, undefined, gregLabel)}</div>
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e9ebec', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { color: '#0ab39c', label: 'Menu set' },
            { color: '#364574', label: 'Event' },
            { color: '#28a745', label: 'Thaali day' },
            { color: '#e63946', label: 'No thaali' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6c757d' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color, display: 'inline-block' }} />{l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Hijri month strip */}
      {viewMode === 'gregorian' && (
        <div className="card mt-3" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
          <div className="card-body p-3">
            <p className="mb-2 fw-bold" style={{ fontSize: '13px', color: '#364574' }}>
              <i className="bi bi-moon-stars me-2" />Hijri months in view
            </p>
            <div className="d-flex gap-2 flex-wrap">
              {(() => {
                const first = new Date(gYear, gMonth, 1)
                const last = new Date(gYear, gMonth + 1, 0)
                const h1 = gregorianToHijri(first)
                const h2 = gregorianToHijri(last)
                const months = []
                let y = h1.year, m = h1.month
                while (y < h2.year || (y === h2.year && m <= h2.month)) {
                  const start = hijriMonthStart(y, m)
                  const days = daysInHijriMonth(m, y)
                  const end = new Date(start); end.setDate(end.getDate() + days - 1)
                  months.push({ y, m, start, end, days })
                  m++; if (m > 12) { m = 1; y++ }
                }
                return months.map((mo, i) => (
                  <div key={i} style={{ background: '#f3f3f9', borderRadius: '8px', padding: '6px 12px', fontSize: '12px' }}>
                    <span style={{ fontWeight: 700, color: '#364574' }}>{HIJRI_MONTHS[mo.m - 1]}</span>
                    <span style={{ color: '#6c757d', marginLeft: '6px' }}>
                      {mo.start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – {mo.end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </span>
                    <span style={{ color: '#adb5bd', marginLeft: '6px' }}>({mo.days}d)</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Day Modal ── */}
      {showModal && selectedDate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '560px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e9ebec' }}>
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <h6 className="mb-0 fw-bold">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h6>
                  <p className="mb-0 text-muted" style={{ fontSize: '12px' }}>
                    {(() => { const h = gregorianToHijri(new Date(selectedDate + 'T00:00:00')); return formatHijri(h.year, h.month, h.day) })()}
                  </p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6c757d' }}>×</button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '12px', background: '#f3f3f9', borderRadius: '8px', padding: '3px' }}>
                {([
                  { key: 'thaali', label: 'Thaali Schedule', icon: 'bi-cup-hot' },
                  { key: 'menu', label: 'Daily Menu', icon: 'bi-list-ul' },
                  { key: 'event', label: 'Event', icon: 'bi-calendar-event' },
                ] as { key: ModalTab; label: string; icon: string }[]).map(tab => (
                  <button key={tab.key} onClick={() => setModalTab(tab.key)} style={{
                    flex: 1, padding: '6px 4px', borderRadius: '6px', border: 'none', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer',
                    background: modalTab === tab.key ? '#364574' : 'transparent',
                    color: modalTab === tab.key ? '#fff' : '#6c757d',
                  }}>
                    <i className={`bi ${tab.icon} me-1`} />{tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── THAALI SCHEDULE TAB ── */}
            {modalTab === 'thaali' && (
              <div style={{ padding: '20px' }}>

                {/* Thaali enabled toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '12px 14px', background: scheduleForm.thaali_enabled ? '#28a74510' : '#e6394610', borderRadius: '10px', border: `1px solid ${scheduleForm.thaali_enabled ? '#28a74530' : '#e6394630'}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: scheduleForm.thaali_enabled ? '#28a745' : '#e63946' }}>
                      {scheduleForm.thaali_enabled ? '✓ Thaali day' : '✕ No thaali today'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6c757d' }}>
                      {scheduleForm.thaali_enabled ? 'Thaali will be distributed' : 'No distribution (Urs, off day, etc.)'}
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input type="checkbox" id="thaali_toggle" checked={scheduleForm.thaali_enabled}
                      onChange={e => setScheduleForm(p => ({ ...p, thaali_enabled: e.target.checked }))}
                      style={{ width: '40px', height: '22px', cursor: 'pointer', accentColor: '#364574' }} />
                  </div>
                </div>

                {/* Event name */}
                <div className="mb-3">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '4px' }}>
                    Day Label / Event Name
                  </label>
                  <input type="text" className="form-control form-control-sm"
                    value={scheduleForm.event_name}
                    onChange={e => setScheduleForm(p => ({ ...p, event_name: e.target.value }))}
                    placeholder={scheduleForm.thaali_enabled ? 'e.g. Friday Special, Weekly Thaali...' : 'e.g. Urs Niyaaz, Sunday Off...'}
                    style={{ borderRadius: '8px', fontSize: '13px' }} />
                </div>

                {scheduleForm.thaali_enabled && (
                  <>
                    {/* Niyyat status selection */}
                    <div className="mb-3">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '6px' }}>
                        Include Niyyat Statuses <span style={{ color: '#6c757d', fontWeight: 400 }}>(who gets thaali)</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {NIYYAT_STATUSES.map(ns => {
                          const selected = scheduleForm.niyyat_status_ids.includes(ns.id)
                          return (
                            <button key={ns.id} onClick={() => toggleNiyyat(ns.id)} style={{
                              padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                              background: selected ? '#364574' : '#f3f3f9',
                              color: selected ? '#fff' : '#495057',
                              transition: 'all 0.15s',
                            }}>
                              {ns.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Thaali category filter */}
                    <div className="mb-3">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '6px' }}>
                        Category Filter <span style={{ color: '#6c757d', fontWeight: 400 }}>(leave empty = all categories)</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {THAALI_CATEGORIES.map(cat => {
                          const selected = scheduleForm.thaali_category_ids.includes(cat.id)
                          return (
                            <button key={cat.id} onClick={() => toggleCategory(cat.id)} style={{
                              padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                              background: selected ? '#0ab39c' : '#f3f3f9',
                              color: selected ? '#fff' : '#495057',
                            }}>
                              {cat.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Extra thaalis */}
                    <div className="mb-3">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '4px' }}>
                        Extra Thaalis <span style={{ color: '#6c757d', fontWeight: 400 }}>(added on top of auto count)</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="number" min={0} className="form-control form-control-sm"
                          value={scheduleForm.extra_thaali_count}
                          onChange={e => setScheduleForm(p => ({ ...p, extra_thaali_count: parseInt(e.target.value) || 0 }))}
                          style={{ borderRadius: '8px', fontSize: '13px', maxWidth: '120px' }} />
                        {selectedCount && (
                          <div style={{ fontSize: '13px', color: '#364574', fontWeight: 700 }}>
                            = {selectedCount.approved} approved + {scheduleForm.extra_thaali_count} extra
                            = <span style={{ color: '#28a745' }}>{selectedCount.approved + scheduleForm.extra_thaali_count} total</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Category breakdown */}
                    {selectedCount && Object.keys(selectedCount.byCategory).length > 0 && (
                      <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#6c757d', marginBottom: '6px', textTransform: 'uppercase' }}>Breakdown by Category</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {Object.entries(selectedCount.byCategory).map(([catId, count]) => {
                            const cat = THAALI_CATEGORIES.find(c => c.id === parseInt(catId))
                            return (
                              <div key={catId} style={{ background: '#fff', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', border: '1px solid #e9ebec' }}>
                                <span style={{ color: '#6c757d' }}>{cat?.name || catId}:</span>
                                <span style={{ fontWeight: 700, color: '#364574', marginLeft: '4px' }}>{count}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Notes */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '4px' }}>Notes</label>
                  <input type="text" className="form-control form-control-sm"
                    value={scheduleForm.notes}
                    onChange={e => setScheduleForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes..."
                    style={{ borderRadius: '8px', fontSize: '13px' }} />
                </div>
              </div>
            )}

            {/* ── MENU TAB ── */}
            {modalTab === 'menu' && (
              <div style={{ padding: '20px' }}>
                <div className="row g-2">
                  {[
                    { key: 'mithas', label: 'Mithas', icon: '🍮' },
                    { key: 'tarkari', label: 'Tarkari', icon: '🥘' },
                    { key: 'soup', label: 'Soup / Daal', icon: '🍲' },
                    { key: 'chawal', label: 'Chawal', icon: '🍚' },
                    { key: 'roti', label: 'Roti', icon: '🫓' },
                    { key: 'salad', label: 'Salad', icon: '🥗' },
                  ].map(f => (
                    <div key={f.key} className="col-6">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', marginBottom: '4px', display: 'block' }}>{f.icon} {f.label}</label>
                      <input type="text" className="form-control form-control-sm"
                        value={(menuForm as any)[f.key]}
                        onChange={e => setMenuForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ borderRadius: '7px', fontSize: '13px' }} />
                    </div>
                  ))}
                  <div className="col-12">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', marginBottom: '4px', display: 'block' }}>Notes</label>
                    <input type="text" className="form-control form-control-sm" value={menuForm.notes}
                      onChange={e => setMenuForm(p => ({ ...p, notes: e.target.value }))}
                      style={{ borderRadius: '7px', fontSize: '13px' }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── EVENT TAB ── */}
            {modalTab === 'event' && (
              <div style={{ padding: '20px' }}>
                <div className="row g-2">
                  <div className="col-12">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', marginBottom: '4px', display: 'block' }}>Event Name *</label>
                    <input type="text" className="form-control"
                      value={eventForm.menu}
                      onChange={e => setEventForm(p => ({ ...p, menu: e.target.value }))}
                      placeholder="e.g. 15 mi Ramadan - Naiz, Urs Syedna..."
                      style={{ borderRadius: '8px', fontSize: '13px' }} />
                  </div>
                  <div className="col-12">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#495057', marginBottom: '4px', display: 'block' }}>Notes</label>
                    <input type="text" className="form-control"
                      value={eventForm.notes}
                      onChange={e => setEventForm(p => ({ ...p, notes: e.target.value }))}
                      style={{ borderRadius: '8px', fontSize: '13px' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Modal footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e9ebec', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {modalTab === 'menu' && editMenu && (
                  <button onClick={deleteMenu} className="btn btn-sm" style={{ background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '7px', fontSize: '12px' }}>
                    <i className="bi bi-trash me-1" />Delete
                  </button>
                )}
                {modalTab === 'event' && editEvent && (
                  <button onClick={deleteEvent} className="btn btn-sm" style={{ background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '7px', fontSize: '12px' }}>
                    <i className="bi bi-trash me-1" />Delete
                  </button>
                )}
                {modalTab === 'thaali' && editSchedule && (
                  <button onClick={deleteSchedule} className="btn btn-sm" style={{ background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '7px', fontSize: '12px' }}>
                    <i className="bi bi-trash me-1" />Remove Schedule
                  </button>
                )}
              </div>
              <div className="d-flex gap-2">
                <button onClick={() => setShowModal(false)} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: '8px', fontSize: '13px' }}>Cancel</button>
                <button
                  onClick={modalTab === 'menu' ? saveMenu : modalTab === 'event' ? saveEvent : saveSchedule}
                  disabled={saving}
                  className="btn btn-sm"
                  style={{ background: '#364574', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}