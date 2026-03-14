'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  gregorianToHijri, hijriToGregorian, formatHijri,
  HIJRI_MONTHS, HIJRI_MONTHS_SHORT,
  daysInHijriMonth, todayHijri, hijriMonthStart
} from '@/lib/hijri'

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
type ModalTab = 'thaali' | 'menu'

const GREG_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CalendarPage() {
  const today = new Date()
  const todayStr = localDateStr(today)
  const todayH = todayHijri()

  const [viewMode, setViewMode] = useState<ViewMode>('gregorian')
  const [gYear, setGYear] = useState(today.getFullYear())
  const [gMonth, setGMonth] = useState(today.getMonth())
  const [hYear, setHYear] = useState(todayH.year)
  const [hMonth, setHMonth] = useState(todayH.month)

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
  const [menuForm, setMenuForm] = useState({ mithas: '', tarkari: '', soup: '', chawal: '', roti: '', salad: '', extra: '', notes: '' })
  const [editMenu, setEditMenu] = useState<DailyMenu | null>(null)

  // Thaali schedule form
  const [scheduleForm, setScheduleForm] = useState({
    event_name: '',
    thaali_enabled: true,
    niyyat_status_ids: [1],
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
      startDate = localDateStr(firstDay)
      endDate = localDateStr(lastDay)
    }

    const [{ data: mnData }, { data: schData }] = await Promise.all([
      supabase.from('daily_menu').select('*').gte('menu_date', startDate).lte('menu_date', endDate),
      supabase.from('thaali_schedule').select('*').gte('event_date', startDate).lte('event_date', endDate),
    ])

    setMenus(mnData || [])
    setSchedules(schData || [])

    if (schData && schData.length > 0) await fetchThaaliCounts(schData)
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

      if (sch.niyyat_status_ids?.length) {
        const { data: muminIds } = await supabase
          .from('mumineen').select('id')
          .in('niyyat_status_id', sch.niyyat_status_ids)
          .eq('is_hof', true).eq('status', 'active')
        const ids = (muminIds || []).map(m => m.id)
        if (ids.length === 0) { counts[sch.event_date] = { approved: 0, byCategory: {}, total: 0 }; continue }
        query = query.in('mumin_id', ids)
      }

      if (sch.thaali_category_ids?.length) query = query.in('thaali_category_id', sch.thaali_category_ids)

      const { data: regs, count } = await query
      const byCategory: Record<number, number> = {}
      if (regs) { for (const r of regs) byCategory[r.thaali_category_id] = (byCategory[r.thaali_category_id] || 0) + 1 }
      counts[sch.event_date] = { approved: count ?? 0, byCategory, total: (count ?? 0) + (sch.extra_thaali_count || 0) }
    }
    setThaaliCounts(counts)
  }

  // Get the next thaali day number (count of all thaali-enabled days before this date + 1)
  const getNextThaaliDayNumber = async (dateStr: string): Promise<number> => {
    const { count } = await supabase
      .from('thaali_schedule')
      .select('*', { count: 'exact', head: true })
      .eq('thaali_enabled', true)
      .lt('event_date', dateStr)
    return (count ?? 0) + 1
  }

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 3000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 2000) }
  }

  const openDay = async (dateStr: string) => {
    setSelectedDate(dateStr)

    const existingMenu = menus.find(m => m.menu_date === dateStr)
    setEditMenu(existingMenu || null)
    setMenuForm(existingMenu
      ? { mithas: existingMenu.mithas||'', tarkari: existingMenu.tarkari||'', soup: existingMenu.soup||'', chawal: existingMenu.chawal||'', roti: existingMenu.roti||'', salad: existingMenu.salad||'', extra: (existingMenu as any).extra||'', notes: existingMenu.notes||'' }
      : { mithas: '', tarkari: '', soup: '', chawal: '', roti: '', salad: '', extra: '', notes: '' }
    )

    const existingSchedule = schedules.find(s => s.event_date === dateStr)
    setEditSchedule(existingSchedule || null)

    if (existingSchedule) {
      setScheduleForm({
        event_name: existingSchedule.event_name || '',
        thaali_enabled: existingSchedule.thaali_enabled,
        niyyat_status_ids: existingSchedule.niyyat_status_ids || [1],
        extra_thaali_count: existingSchedule.extra_thaali_count || 0,
        thaali_category_ids: existingSchedule.thaali_category_ids || [],
        notes: existingSchedule.notes || '',
      })
    } else {
      // Auto-fill thaali day number for new schedule
      const dayNum = await getNextThaaliDayNumber(dateStr)
      setScheduleForm({
        event_name: `Day ${dayNum}`,
        thaali_enabled: true,
        niyyat_status_ids: [1],
        extra_thaali_count: 0,
        thaali_category_ids: [],
        notes: '',
      })
    }

    setModalTab('thaali')
    setShowModal(true)
  }

  // When toggling thaali_enabled, update the label accordingly
  const handleThaaliToggle = async (enabled: boolean) => {
    if (enabled && !editSchedule) {
      // Switching to thaali day on a new entry → re-compute day number
      const dayNum = selectedDate ? await getNextThaaliDayNumber(selectedDate) : 1
      setScheduleForm(p => ({ ...p, thaali_enabled: true, event_name: `Day ${dayNum}` }))
    } else if (!enabled) {
      // Switching to no-thaali → clear label so user can type reason
      setScheduleForm(p => ({ ...p, thaali_enabled: false, event_name: '' }))
    } else {
      setScheduleForm(p => ({ ...p, thaali_enabled: enabled }))
    }
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
    showMsg('Saved'); setShowModal(false); fetchData()
  }

  const deleteMenu = async () => {
    if (!editMenu || !confirm('Delete menu for this day?')) return
    await supabase.from('daily_menu').delete().eq('id', editMenu.id)
    showMsg('Deleted'); setShowModal(false); fetchData()
  }

  const deleteSchedule = async () => {
    if (!editSchedule || !confirm('Remove thaali schedule for this day?')) return
    await supabase.from('thaali_schedule').delete().eq('id', editSchedule.id)
    showMsg('Deleted'); setShowModal(false); fetchData()
  }

  const toggleNiyyat = (id: number) => setScheduleForm(prev => ({
    ...prev,
    niyyat_status_ids: prev.niyyat_status_ids.includes(id)
      ? prev.niyyat_status_ids.filter(x => x !== id)
      : [...prev.niyyat_status_ids, id]
  }))

  const toggleCategory = (id: number) => setScheduleForm(prev => ({
    ...prev,
    thaali_category_ids: prev.thaali_category_ids.includes(id)
      ? prev.thaali_category_ids.filter(x => x !== id)
      : [...prev.thaali_category_ids, id]
  }))

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

  const isToday = (dateStr: string) => dateStr === todayStr
  const hasMenu = (dateStr: string) => menus.some(m => m.menu_date === dateStr)
  const getSchedule = (dateStr: string) => schedules.find(s => s.event_date === dateStr)

  // Lock editing if date is past, or today after 6:00 AM local
  const isLocked = (dateStr: string): boolean => {
    if (dateStr < todayStr) return true
    if (dateStr > todayStr) return false
    return today.getHours() >= 6
  }

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
    return { day: h.day, month: h.month, isFirst: h.day === 1 }
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
    const sch = getSchedule(dateStr)
    const count = thaaliCounts[dateStr]

    return (
      <div
        onClick={() => openDay(dateStr)}
        style={{
          minHeight: '88px', padding: '6px 8px', cursor: 'pointer',
          borderRight: '1px solid var(--bs-border-color)',
          borderBottom: '1px solid var(--bs-border-color)',
          background: isTod ? '#364574' : 'var(--bs-body-bg)',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isTod) (e.currentTarget as HTMLElement).style.background = 'var(--bs-tertiary-bg)' }}
        onMouseLeave={e => { if (!isTod) (e.currentTarget as HTMLElement).style.background = 'var(--bs-body-bg)' }}
      >
        <div style={{ fontSize: '14px', fontWeight: 700, color: isTod ? '#fff' : 'var(--bs-body-color)', marginBottom: '1px' }}>{label}</div>

        {hijriOverlay && (
          <div style={{ fontSize: '10px', color: isTod ? 'rgba(255,255,255,0.7)' : hijriOverlay.isFirst ? '#364574' : 'var(--bs-secondary-color)', fontWeight: hijriOverlay.isFirst ? 700 : 400, marginBottom: '3px' }}>
            {hijriOverlay.isFirst ? `1 ${HIJRI_MONTHS_SHORT[hijriOverlay.month - 1]}` : hijriOverlay.day}
          </div>
        )}

        {gregOverlay && (
          <div style={{ fontSize: '10px', color: isTod ? 'rgba(255,255,255,0.7)' : 'var(--bs-secondary-color)', marginBottom: '3px' }}>{gregOverlay}</div>
        )}

        {/* Indicators */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '2px' }}>
          {hasM && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isTod ? '#ffbf69' : '#0ab39c' }} title="Menu set" />}
          {sch && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sch.thaali_enabled ? (isTod ? '#90ee90' : '#28a745') : (isTod ? '#ffaaaa' : '#e63946') }} title={sch.thaali_enabled ? 'Thaali day' : 'No thaali'} />}
        </div>

        {/* Thaali count or label */}
        {sch?.thaali_enabled && count && (
          <div style={{ fontSize: '9px', fontWeight: 700, color: isTod ? '#90ee90' : '#28a745' }}>
            {sch.event_name && <span style={{ marginRight: '3px', opacity: 0.8 }}>{sch.event_name} · </span>}
            {count.total} thaalis
          </div>
        )}
        {sch && !sch.thaali_enabled && (
          <div style={{ fontSize: '9px', color: isTod ? '#ffaaaa' : '#e63946', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sch.event_name || 'No thaali'}
          </div>
        )}
      </div>
    )
  }

  const selectedCount = selectedDate ? thaaliCounts[selectedDate] : null

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>Calendar</h4>
          <p className="mb-0" style={{ fontSize: '13px', color: 'var(--bs-secondary-color)' }}>{getSubtitle()}</p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <div style={{ display: 'flex', background: 'var(--bs-secondary-bg)', borderRadius: '8px', padding: '3px' }}>
            {(['gregorian', 'hijri'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none', fontSize: '12px',
                fontWeight: 600, cursor: 'pointer',
                background: viewMode === mode ? '#364574' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--bs-secondary-color)',
              }}>
                {mode === 'gregorian' ? 'Gregorian' : 'Hijri (Misri)'}
              </button>
            ))}
          </div>
          <button onClick={goToday} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: '8px', fontSize: '12px' }}>Today</button>
          <div className="d-flex gap-1">
            <button onClick={navPrev} className="btn btn-sm" style={{ background: 'var(--bs-secondary-bg)', border: 'none', borderRadius: '8px', color: '#364574' }}><i className="bi bi-chevron-left" /></button>
            <button onClick={navNext} className="btn btn-sm" style={{ background: 'var(--bs-secondary-bg)', border: 'none', borderRadius: '8px', color: '#364574' }}><i className="bi bi-chevron-right" /></button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '13px' }}>{error}</div>}
      {success && <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: '13px' }}>{success}</div>}

      {/* Calendar */}
      <div className="card" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bs-border-color)' }}>
          <h5 className="mb-0 fw-bold" style={{ color: '#364574' }}>{getTitle()}</h5>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--bs-border-color)' }}>
            {DOW.map(d => (
              <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--bs-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-5"><div className="spinner-border spinner-border-sm" style={{ color: '#364574' }} /></div>
          ) : viewMode === 'gregorian' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {gregCells.map((cell, i) => {
                if (!cell) return <div key={i} style={{ minHeight: '88px', background: 'var(--bs-secondary-bg)', borderRight: '1px solid var(--bs-border-color)', borderBottom: '1px solid var(--bs-border-color)' }} />
                const dateStr = localDateStr(cell)
                return <div key={i}>{renderCell(dateStr, cell.getDate(), getHijriOverlay(cell))}</div>
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {hijriCells.map((cell, i) => {
                if (!cell) return <div key={i} style={{ minHeight: '88px', background: 'var(--bs-secondary-bg)', borderRight: '1px solid var(--bs-border-color)', borderBottom: '1px solid var(--bs-border-color)' }} />
                const gDate = hijriToGregorian(hYear, hMonth, cell)
                const dateStr = localDateStr(gDate)
                const gregLabel = gDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                return <div key={i}>{renderCell(dateStr, cell, undefined, gregLabel)}</div>
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bs-border-color)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { color: '#0ab39c', label: 'Menu set' },
            { color: '#28a745', label: 'Thaali day' },
            { color: '#e63946', label: 'No thaali' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--bs-secondary-color)' }}>
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
                  <div key={i} style={{ background: 'var(--bs-secondary-bg)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px' }}>
                    <span style={{ fontWeight: 700, color: '#364574' }}>{HIJRI_MONTHS[mo.m - 1]}</span>
                    <span style={{ color: 'var(--bs-secondary-color)', marginLeft: '6px' }}>
                      {mo.start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – {mo.end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </span>
                    <span style={{ color: 'var(--bs-secondary-color)', marginLeft: '6px' }}>({mo.days}d)</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Day Modal ── */}
      {showModal && selectedDate && (() => { const locked = isLocked(selectedDate); return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--bs-body-bg)', borderRadius: '14px', width: '100%', maxWidth: '560px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bs-border-color)' }}>
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <h6 className="mb-0 fw-bold" style={{ color: 'var(--bs-body-color)' }}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h6>
                  <p className="mb-0" style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>
                    {(() => { const h = gregorianToHijri(new Date(selectedDate + 'T00:00:00')); return formatHijri(h.year, h.month, h.day) })()}
                  </p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--bs-secondary-color)' }}>×</button>
              </div>

              {/* 2 tabs only */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '12px', background: 'var(--bs-secondary-bg)', borderRadius: '8px', padding: '3px' }}>
                {([
                  { key: 'thaali', label: 'Thaali Schedule', icon: 'bi-cup-hot' },
                  { key: 'menu',   label: 'Daily Menu',       icon: 'bi-list-ul' },
                ] as { key: ModalTab; label: string; icon: string }[]).map(tab => (
                  <button key={tab.key} onClick={() => setModalTab(tab.key)} style={{
                    flex: 1, padding: '7px 4px', borderRadius: '6px', border: 'none', fontSize: '13px',
                    fontWeight: 600, cursor: 'pointer',
                    background: modalTab === tab.key ? '#364574' : 'transparent',
                    color: modalTab === tab.key ? '#fff' : 'var(--bs-secondary-color)',
                  }}>
                    <i className={`bi ${tab.icon} me-1`} />{tab.label}
                  </button>
                ))}
              </div>
            </div>


            {/* Lock banner */}
            {locked && (
              <div style={{ margin: '12px 20px 0', padding: '9px 14px', background: '#f8f9fa', border: '1px solid var(--bs-border-color)', borderRadius: '9px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bi bi-lock-fill" style={{ color: '#6c757d', fontSize: '13px' }} />
                <span style={{ fontSize: '12px', color: 'var(--bs-secondary-color)', fontWeight: 600 }}>
                  {selectedDate < todayStr ? 'Past date — read only' : 'Day has started (after 6 AM) — read only'}
                </span>
              </div>
            )}
            {/* ── THAALI SCHEDULE TAB ── */}
            {modalTab === 'thaali' && (
              <div style={{ padding: '20px' }}>

                {/* Toggle */}
                <div
                  onClick={() => !locked && handleThaaliToggle(!scheduleForm.thaali_enabled)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '16px', padding: '12px 14px', cursor: locked ? 'default' : 'pointer',
                    opacity: locked ? 0.65 : 1, pointerEvents: locked ? 'none' : 'auto',
                    background: scheduleForm.thaali_enabled ? '#28a74510' : '#e6394610',
                    borderRadius: '10px', border: `1px solid ${scheduleForm.thaali_enabled ? '#28a74530' : '#e6394630'}`,
                    userSelect: 'none',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: scheduleForm.thaali_enabled ? '#28a745' : '#e63946' }}>
                      {scheduleForm.thaali_enabled ? '✓ Thaali day' : '✕ No thaali today'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>
                      {scheduleForm.thaali_enabled ? 'Thaali will be distributed' : 'No distribution today'}
                    </div>
                  </div>
                  <div style={{
                    width: '44px', height: '24px', borderRadius: '12px', position: 'relative', flexShrink: 0,
                    background: scheduleForm.thaali_enabled ? '#28a745' : '#dee2e6', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: '3px',
                      left: scheduleForm.thaali_enabled ? '22px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>

                {/* Day label — shown for both states, different purpose */}
                <div className="mb-3">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: '4px' }}>
                    {scheduleForm.thaali_enabled
                      ? <>Day Label <span style={{ color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(auto-numbered, can edit)</span></>
                      : <>Reason <span style={{ color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(why no thaali — shown in app)</span></>
                    }
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={scheduleForm.event_name}
                    onChange={e => setScheduleForm(p => ({ ...p, event_name: e.target.value }))}
                    disabled={locked}
                    placeholder={scheduleForm.thaali_enabled ? 'e.g. Day 25, Friday Special...' : 'e.g. Urs Niyaaz, Sunday Off, Majlis...'}
                    style={{ borderRadius: '8px', fontSize: '13px' }}
                    autoFocus={!scheduleForm.thaali_enabled}
                  />
                </div>

                {/* Thaali-only fields */}
                {scheduleForm.thaali_enabled && (
                  <>
                    <div className="mb-3">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: '6px' }}>
                        Include Niyyat Statuses <span style={{ color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(who gets thaali)</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {NIYYAT_STATUSES.map(ns => {
                          const sel = scheduleForm.niyyat_status_ids.includes(ns.id)
                          return (
                            <button key={ns.id} onClick={() => !locked && toggleNiyyat(ns.id)} disabled={locked} style={{
                              padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                              background: sel ? '#364574' : 'var(--bs-secondary-bg)',
                              color: sel ? '#fff' : 'var(--bs-body-color)', transition: 'all 0.15s',
                            }}>
                              {ns.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="mb-3">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: '6px' }}>
                        Category Filter <span style={{ color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(empty = all)</span>
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {THAALI_CATEGORIES.map(cat => {
                          const sel = scheduleForm.thaali_category_ids.includes(cat.id)
                          return (
                            <button key={cat.id} onClick={() => !locked && toggleCategory(cat.id)} disabled={locked} style={{
                              padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                              background: sel ? '#0ab39c' : 'var(--bs-secondary-bg)',
                              color: sel ? '#fff' : 'var(--bs-body-color)',
                            }}>
                              {cat.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="mb-3">
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: '4px' }}>
                        Extra Thaalis <span style={{ color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(added on top of auto count)</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="number" min={0} className="form-control form-control-sm"
                          value={scheduleForm.extra_thaali_count}
                          onChange={e => setScheduleForm(p => ({ ...p, extra_thaali_count: parseInt(e.target.value) || 0 }))}
                          disabled={locked}
                          style={{ borderRadius: '8px', fontSize: '13px', maxWidth: '120px' }} />
                        {selectedCount && (
                          <div style={{ fontSize: '13px', color: '#364574', fontWeight: 700 }}>
                            {selectedCount.approved} approved + {scheduleForm.extra_thaali_count} extra
                            = <span style={{ color: '#28a745' }}>{selectedCount.approved + scheduleForm.extra_thaali_count} total</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedCount && Object.keys(selectedCount.byCategory).length > 0 && (
                      <div style={{ background: 'var(--bs-tertiary-bg)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--bs-secondary-color)', marginBottom: '6px', textTransform: 'uppercase' }}>Breakdown by Category</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {Object.entries(selectedCount.byCategory).map(([catId, count]) => {
                            const cat = THAALI_CATEGORIES.find(c => c.id === parseInt(catId))
                            return (
                              <div key={catId} style={{ background: 'var(--bs-body-bg)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', border: '1px solid var(--bs-border-color)' }}>
                                <span style={{ color: 'var(--bs-secondary-color)' }}>{cat?.name || catId}:</span>
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
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', display: 'block', marginBottom: '4px' }}>Notes</label>
                  <input type="text" className="form-control form-control-sm"
                    value={scheduleForm.notes}
                    onChange={e => setScheduleForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes..."
                    disabled={locked}
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
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', marginBottom: '4px', display: 'block' }}>{f.icon} {f.label}</label>
                      <input type="text" className="form-control form-control-sm"
                        value={(menuForm as any)[f.key]}
                        onChange={e => setMenuForm(p => ({ ...p, [f.key]: e.target.value }))}
                        disabled={locked}
                        style={{ borderRadius: '7px', fontSize: '13px' }} />
                    </div>
                  ))}
                  <div className="col-12">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', marginBottom: '4px', display: 'block' }}>✨ Extra <span style={{ color: 'var(--bs-secondary-color)', fontWeight: 400 }}>(fruit, cake, anything additional)</span></label>
                    <input type="text" className="form-control form-control-sm" value={menuForm.extra}
                      onChange={e => setMenuForm(p => ({ ...p, extra: e.target.value }))}
                      placeholder="e.g. Fruit, Cake, Kheer..."
                      disabled={locked}
                      style={{ borderRadius: '7px', fontSize: '13px' }} />
                  </div>
                  <div className="col-12">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bs-body-color)', marginBottom: '4px', display: 'block' }}>Notes</label>
                    <input type="text" className="form-control form-control-sm" value={menuForm.notes}
                      onChange={e => setMenuForm(p => ({ ...p, notes: e.target.value }))}
                      disabled={locked}
                      style={{ borderRadius: '7px', fontSize: '13px' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Modal footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bs-border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {!locked && modalTab === 'menu' && editMenu && (
                  <button onClick={deleteMenu} className="btn btn-sm" style={{ background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '7px', fontSize: '12px' }}>
                    <i className="bi bi-trash me-1" />Delete
                  </button>
                )}
                {!locked && modalTab === 'thaali' && editSchedule && (
                  <button onClick={deleteSchedule} className="btn btn-sm" style={{ background: '#e6394615', color: '#e63946', border: 'none', borderRadius: '7px', fontSize: '12px' }}>
                    <i className="bi bi-trash me-1" />Remove Schedule
                  </button>
                )}
              </div>
              <div className="d-flex gap-2">
                <button onClick={() => setShowModal(false)} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: '8px', fontSize: '13px' }}>Cancel</button>
                {!locked && <button
                  onClick={modalTab === 'menu' ? saveMenu : saveSchedule}
                  disabled={saving}
                  className="btn btn-sm"
                  style={{ background: '#364574', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : 'Save'}
                </button>}
              </div>
            </div>
          </div>
        </div>
      )})()}
    </>
  )
}