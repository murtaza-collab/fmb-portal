'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { todayHijri, getFMBFiscalYear, formatHijri } from '@/lib/hijri'

interface ExtraItem { name: string; value: string }
interface TodayMenu {
  mithas?: string; tarkari?: string; chawal?: string
  soup?: string; roti?: string; notes?: string
  extra_items?: ExtraItem[]
}

interface TodaySchedule {
  thaali_enabled: boolean
  event_name: string | null
  extra_thaali_count: number
  total_thaalis: number
}

interface KitchenStats {
  yetToArrive: number; arrived: number; inProgress: number
  counterBDone: number; counterCDone: number; dispatched: number
  totalDistributors: number; totalThaalisInProcess: number
  totalThaalisReady: number; totalThaalisDispatched: number
}

const NO_SHOW_ID = 3

export default function DashboardPage() {
  const [loading, setLoading]       = useState(true)
  const [stats, setStats]           = useState({
    activeHOFs: 0, totalMumineen: 0,
    thaaliRegistrations: 0, stoppedThaalis: 0,
    activeSectors: 0, activeDistributors: 0,
    pendingAddressRequests: 0, pendingTakhmeem: 0,
  })
  const [todayMenu, setTodayMenu]         = useState<TodayMenu | null>(null)
  const [todaySchedule, setTodaySchedule] = useState<TodaySchedule | null>(null)
  const [kitchenStats, setKitchenStats]   = useState<KitchenStats>({
    yetToArrive:0, arrived:0, inProgress:0, counterBDone:0,
    counterCDone:0, dispatched:0, totalDistributors:0,
    totalThaalisInProcess:0, totalThaalisReady:0, totalThaalisDispatched:0,
  })
  const [currentTime, setCurrentTime]         = useState(new Date())
  const [rolloverLoading, setRolloverLoading] = useState(false)
  const [rolloverDone, setRolloverDone]       = useState(false)
  const [showRolloverConfirm, setShowRolloverConfirm] = useState(false)
  const [rolloverResult, setRolloverResult]   = useState<{ count: number } | null>(null)

  const router        = useRouter()
  const today         = new Date()
  const todayH        = todayHijri()
  const currentFY     = getFMBFiscalYear(todayH.month >= 9 ? todayH.year : todayH.year - 1)
  const nextFY        = getFMBFiscalYear(currentFY.hijriYear + 1)
  const daysToRamadan = Math.ceil((nextFY.startGregorian.getTime() - new Date().setHours(0,0,0,0)) / 86400000)
  const isRamadanToday  = todayH.month === 9 && todayH.day === 1
  const rolloverOverdue = isRamadanToday && !rolloverDone
  const rolloverUrgent  = daysToRamadan <= 7 && daysToRamadan > 0

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setLoading(false)
      fetchStats()
      checkRolloverStatus()
    })
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [router])

  const checkRolloverStatus = async () => {
    const { data } = await supabase.from('fiscal_year_rollovers')
      .select('id').eq('hijri_year', currentFY.hijriYear).maybeSingle()
    if (data) setRolloverDone(true)
  }

  const fetchStats = async () => {
    const d = new Date()
const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    const [
      { count: activeHOFs },
      { count: totalMumineen },
      { count: thaaliRegs },
      { count: stoppedToday },
      { count: activeSectors },
      { count: activeDistributors },
      { count: pendingAddr },
      { count: pendingTakh },
    ] = await Promise.all([
      supabase.from('mumineen').select('*', { count:'exact', head:true }).eq('is_hof', true).eq('status', 'active'),
      supabase.from('mumineen').select('*', { count:'exact', head:true }),
      // ── FIXED: count registrations with thaali assigned (not stale status column) ──
      supabase.from('thaali_registrations').select('*', { count:'exact', head:true }).not('thaali_id', 'is', null),
      // ── FIXED: count active stops from stop_thaalis covering today ──
      supabase.from('stop_thaalis').select('*', { count:'exact', head:true })
        .lte('from_date', todayStr).gte('to_date', todayStr).in('status', ['active', 'approved']),
      supabase.from('house_sectors').select('*', { count:'exact', head:true }).eq('status', 'active'),
      supabase.from('distributors').select('*', { count:'exact', head:true }).eq('status', 'active'),
      supabase.from('mumineen').select('*', { count:'exact', head:true }).eq('change_address', true),
      supabase.from('takhmeen').select('*', { count:'exact', head:true }).eq('status', 'pending_approval'),
    ])

    setStats({
      activeHOFs:             activeHOFs ?? 0,
      totalMumineen:          totalMumineen ?? 0,
      thaaliRegistrations:    thaaliRegs ?? 0,
      stoppedThaalis:         stoppedToday ?? 0,
      activeSectors:          activeSectors ?? 0,
      activeDistributors:     activeDistributors ?? 0,
      pendingAddressRequests: pendingAddr ?? 0,
      pendingTakhmeem:        pendingTakh ?? 0,
    })

    // Today's menu
    const { data: menu } = await supabase.from('daily_menu')
      .select('*').eq('menu_date', todayStr).maybeSingle()
    setTodayMenu(menu ? { ...menu, extra_items: Array.isArray((menu as any).extra_items) ? (menu as any).extra_items : [] } as TodayMenu : null)

    // Today's thaali schedule
    const { data: sched } = await supabase.from('thaali_schedule')
      .select('thaali_enabled, event_name, extra_thaali_count')
      .eq('event_date', todayStr).maybeSingle()

    if (sched) {
      const { count: approvedCount } = await supabase.from('thaali_registrations')
        .select('*', { count:'exact', head:true }).not('thaali_id', 'is', null)
      const total = (approvedCount ?? 0) + (sched.extra_thaali_count ?? 0)
      setTodaySchedule({ ...sched, total_thaalis: sched.thaali_enabled ? total : 0 })
    } else {
      setTodaySchedule(null)
    }

    // Kitchen stats
    const { data: sessions } = await supabase
      .from('distribution_sessions').select('status, total_thaalis').eq('session_date', todayStr)
    const totalDist  = activeDistributors ?? 0
    const arrived    = sessions?.filter(s => s.status === 'arrived').length ?? 0
    const inProgress = sessions?.filter(s => s.status === 'in_progress').length ?? 0
    const bDone      = sessions?.filter(s => s.status === 'counter_b_done').length ?? 0
    const cDone      = sessions?.filter(s => s.status === 'counter_c_done').length ?? 0
    const dispatched = sessions?.filter(s => s.status === 'dispatched').length ?? 0
    const yetToArrive = Math.max(0, totalDist - (arrived + inProgress + bDone + cDone + dispatched))
    setKitchenStats({
      yetToArrive, arrived, inProgress, counterBDone: bDone, counterCDone: cDone, dispatched,
      totalDistributors: totalDist,
      totalThaalisInProcess: sessions?.filter(s => ['in_progress','counter_b_done','counter_c_done'].includes(s.status)).reduce((a,s) => a+(s.total_thaalis??0), 0) ?? 0,
      totalThaalisReady:     sessions?.filter(s => ['counter_b_done','counter_c_done'].includes(s.status)).reduce((a,s) => a+(s.total_thaalis??0), 0) ?? 0,
      totalThaalisDispatched:sessions?.filter(s => s.status === 'dispatched').reduce((a,s) => a+(s.total_thaalis??0), 0) ?? 0,
    })
  }

  const handleRollover = async () => {
    setRolloverLoading(true); setShowRolloverConfirm(false)
    try {
      const { data, error } = await supabase.from('mumineen')
        .update({ niyyat_status_id: NO_SHOW_ID, niyyat_done: false, niyyat_done_on: null })
        .eq('is_hof', true).eq('status', 'active').select('id')
      if (error) throw error
      const count = data?.length ?? 0
      await supabase.from('fiscal_year_rollovers').insert({
        hijri_year: currentFY.hijriYear, rolled_at: new Date().toISOString(), mumineen_reset_count: count,
      })
      setRolloverResult({ count }); setRolloverDone(true); fetchStats()
    } catch (err: any) { alert('Rollover failed: ' + err.message) }
    setRolloverLoading(false)
  }

  const greeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }
  const fmtDate      = (d: Date) => d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const fmtDateShort = (d: Date) => d.toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight:'60vh' }}>
      <div className="spinner-border" style={{ color:'#364574' }} />
    </div>
  )

  const menuItems = todayMenu ? [
    { label:'Mithas',  value:todayMenu.mithas,  icon:'🍮' },
    { label:'Tarkari', value:todayMenu.tarkari, icon:'🥘' },
    { label:'Soup',    value:todayMenu.soup,    icon:'🍲' },
    { label:'Chawal',  value:todayMenu.chawal,  icon:'🍚' },
    { label:'Roti',    value:todayMenu.roti,    icon:'🫓' },
    ...(todayMenu.extra_items || []).filter(e => e.name && e.value).map(e => ({
      label: e.name, value: e.value, icon: '✨'
    })),
  ].filter(i => i.value) : []

  const kitchenFlow = [
    { label:'Yet to Arrive', value:kitchenStats.yetToArrive,  color:'#6c757d', bg:'#6c757d18', icon:'bi-hourglass' },
    { label:'Arrived',       value:kitchenStats.arrived,      color:'#299cdb', bg:'#299cdb18', icon:'bi-person-check' },
    { label:'Filling',       value:kitchenStats.inProgress + kitchenStats.counterBDone + kitchenStats.counterCDone,
                                                              color:'#ffbf69', bg:'#ffbf6918', icon:'bi-cup-hot',
                                                              sub:`${kitchenStats.totalThaalisInProcess} thaalis` },
    { label:'Ready',         value:kitchenStats.counterBDone + kitchenStats.counterCDone,
                                                              color:'#0ab39c', bg:'#0ab39c18', icon:'bi-check2-circle',
                                                              sub:`${kitchenStats.totalThaalisReady} thaalis` },
    { label:'Dispatched',    value:kitchenStats.dispatched,   color:'#364574', bg:'#36457418', icon:'bi-truck',
                                                              sub:`${kitchenStats.totalThaalisDispatched} thaalis` },
  ]

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color:'var(--bs-body-color)' }}>{greeting()} 👋</h4>
          <p className="mb-0" style={{ fontSize:13, color:'var(--bs-secondary-color)' }}>{fmtDate(currentTime)}</p>
        </div>
        <div className="d-flex gap-2">
          <button onClick={() => router.push('/kitchen')} className="btn btn-sm"
            style={{ background:'#364574', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600 }}>
            <i className="bi bi-grid-3x3-gap me-1" />Kitchen Portal
          </button>
          <button onClick={fetchStats} className="btn btn-sm btn-outline-secondary" style={{ borderRadius:8, fontSize:13 }}>
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>

      {/* ── Main Stats (4 cards) ── */}
      <div className="row g-3 mb-3">

        {/* 1. Active HOFs */}
        <div className="col-xl-3 col-md-6">
          <div className="card h-100" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:600, color:'var(--bs-secondary-color)', marginBottom:4 }}>Active HOFs</p>
                  <h3 className="mb-0 fw-bold" style={{ color:'#364574', fontSize:28 }}>{stats.activeHOFs}</h3>
                  <p style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4, marginBottom:0 }}>
                    {stats.totalMumineen} total mumineen (incl. members)
                  </p>
                </div>
                <div style={{ width:44, height:44, borderRadius:10, background:'#36457418', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="bi bi-house-fill" style={{ fontSize:20, color:'#364574' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Thaali Registrations — FIXED */}
        <div className="col-xl-3 col-md-6">
          <div className="card h-100" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:600, color:'var(--bs-secondary-color)', marginBottom:4 }}>Thaali Registrations</p>
                  <h3 className="mb-0 fw-bold" style={{ color:'#0ab39c', fontSize:28 }}>{stats.thaaliRegistrations}</h3>
                  <p style={{ fontSize:12, marginTop:4, marginBottom:0 }}>
                    {stats.stoppedThaalis > 0
                      ? <span style={{ color:'#f06548' }}>{stats.stoppedThaalis} stopped today</span>
                      : <span style={{ color:'#0ab39c' }}>0 stopped today</span>}
                  </p>
                </div>
                <div style={{ width:44, height:44, borderRadius:10, background:'#0ab39c18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="bi bi-cup-hot" style={{ fontSize:20, color:'#0ab39c' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Today's Thaali */}
        <div className="col-xl-3 col-md-6">
          <div className="card h-100" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:600, color:'var(--bs-secondary-color)', marginBottom:4 }}>Today's Thaali</p>
                  {todaySchedule === null ? (
                    <>
                      <h3 className="mb-0 fw-bold" style={{ color:'#6c757d', fontSize:28 }}>—</h3>
                      <p style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4, marginBottom:0 }}>Not scheduled yet</p>
                    </>
                  ) : todaySchedule.thaali_enabled ? (
                    <>
                      <h3 className="mb-0 fw-bold" style={{ color:'#ffbf69', fontSize:28 }}>{todaySchedule.total_thaalis}</h3>
                      <p style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4, marginBottom:0 }} className="text-truncate">
                        {todaySchedule.event_name || 'Regular day'}
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="mb-0 fw-bold" style={{ color:'#f06548', fontSize:28 }}>Off</h3>
                      <p style={{ fontSize:12, color:'#f06548', marginTop:4, marginBottom:0 }} className="text-truncate">
                        {todaySchedule.event_name || 'No thaali today'}
                      </p>
                    </>
                  )}
                </div>
                <div style={{ width:44, height:44, borderRadius:10, background:'#ffbf6918', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`bi ${todaySchedule?.thaali_enabled === false ? 'bi-x-circle' : 'bi-calendar-check'}`} style={{ fontSize:20, color:'#ffbf69' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Pending Actions */}
        <div className="col-xl-3 col-md-6">
          <div className="card h-100" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', cursor:'pointer' }}
            onClick={() => router.push(stats.pendingAddressRequests > 0 ? '/address-requests' : '/takhmeen')}>
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:600, color:'var(--bs-secondary-color)', marginBottom:4 }}>Pending Actions</p>
                  <h3 className="mb-0 fw-bold" style={{ color:'#299cdb', fontSize:28 }}>
                    {stats.pendingAddressRequests + stats.pendingTakhmeem}
                  </h3>
                  <div style={{ marginTop:4 }}>
                    {stats.pendingAddressRequests > 0 && (
                      <span className="badge me-1" style={{ background:'#299cdb22', color:'#299cdb', fontSize:10 }}>
                        {stats.pendingAddressRequests} address
                      </span>
                    )}
                    {stats.pendingTakhmeem > 0 && (
                      <span className="badge" style={{ background:'#36457422', color:'#364574', fontSize:10 }}>
                        {stats.pendingTakhmeem} niyyat
                      </span>
                    )}
                    {stats.pendingAddressRequests === 0 && stats.pendingTakhmeem === 0 && (
                      <span style={{ fontSize:12, color:'#0ab39c' }}>All clear ✓</span>
                    )}
                  </div>
                </div>
                <div style={{ width:44, height:44, borderRadius:10, background:'#299cdb18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="bi bi-bell-fill" style={{ fontSize:20, color:'#299cdb' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info strip */}
      <div className="d-flex gap-3 mb-4 flex-wrap">
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'var(--bs-tertiary-bg)', borderRadius:20, border:'1px solid var(--bs-border-color)', fontSize:12 }}>
          <i className="bi bi-map-fill" style={{ color:'#ffbf69', fontSize:14 }} />
          <span style={{ color:'var(--bs-secondary-color)' }}>Sectors:</span>
          <strong style={{ color:'var(--bs-body-color)' }}>{stats.activeSectors} active</strong>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'var(--bs-tertiary-bg)', borderRadius:20, border:'1px solid var(--bs-border-color)', fontSize:12 }}>
          <i className="bi bi-truck" style={{ color:'#299cdb', fontSize:14 }} />
          <span style={{ color:'var(--bs-secondary-color)' }}>Distributors:</span>
          <strong style={{ color:'var(--bs-body-color)' }}>{stats.activeDistributors} active</strong>
        </div>
      </div>

      {/* Rollover urgent banner */}
      {(rolloverOverdue || rolloverUrgent) && !rolloverDone && (
        <div className="mb-4" style={{
          background: rolloverOverdue ? '#e6394610' : '#ffbf6915',
          border:`1px solid ${rolloverOverdue ? '#e63946' : '#ffbf69'}`,
          borderRadius:12, padding:'14px 18px',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'
        }}>
          <div className="d-flex align-items-center gap-3">
            <i className={`bi ${rolloverOverdue ? 'bi-exclamation-circle-fill' : 'bi-bell-fill'}`}
              style={{ fontSize:22, color: rolloverOverdue ? '#e63946' : '#ffbf69' }} />
            <div>
              <div style={{ fontWeight:700, fontSize:14, color: rolloverOverdue ? '#e63946' : '#856404' }}>
                {rolloverOverdue ? 'Rollover Required — Today is 1 Ramadan!' : `Ramadan in ${daysToRamadan} days — Rollover due soon`}
              </div>
              <div style={{ fontSize:12, color:'var(--bs-secondary-color)' }}>
                New fiscal year {nextFY.hijriYear}H starts {fmtDateShort(nextFY.startGregorian)}. Reset all mumineen niyyat to No-Show.
              </div>
            </div>
          </div>
          <button onClick={() => setShowRolloverConfirm(true)} className="btn btn-sm"
            style={{ background: rolloverOverdue ? '#e63946' : '#ffbf69', color: rolloverOverdue ? '#fff' : '#212529', borderRadius:8, fontWeight:600, fontSize:13, whiteSpace:'nowrap' }}>
            <i className="bi bi-arrow-repeat me-1" />Rollover Now
          </button>
        </div>
      )}

      {/* ── Kitchen + Menu ── */}
      <div className="row g-3 mb-4">
        <div className="col-xl-8">
          <div className="card h-100" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 mb-3">
                <div style={{ width:32, height:32, borderRadius:8, background:'#36457418', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="bi bi-grid-3x3-gap" style={{ color:'#364574', fontSize:16 }} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Kitchen Operations</h6>
                  <p className="mb-0" style={{ fontSize:11, color:'var(--bs-secondary-color)' }}>Today's distribution status</p>
                </div>
              </div>
              <div className="row g-2 mb-3">
                {kitchenFlow.map((item, i) => (
                  <div key={i} className="col">
                    <div style={{ background:item.bg, borderRadius:10, padding:'12px 10px', textAlign:'center', border:`1px solid ${item.color}22` }}>
                      <i className={`bi ${item.icon}`} style={{ fontSize:18, color:item.color, display:'block', marginBottom:4 }} />
                      <div style={{ fontSize:22, fontWeight:700, color:item.color, lineHeight:1 }}>{item.value}</div>
                      <div style={{ fontSize:10, color:'var(--bs-secondary-color)', marginTop:3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px' }}>{item.label}</div>
                      {item.sub && <div style={{ fontSize:10, color:item.color, marginTop:2 }}>{item.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <span style={{ fontSize:11, color:'var(--bs-secondary-color)', fontWeight:600, display:'flex', alignItems:'center' }}>Quick access:</span>
                {[
                  { label:'Arrival',   href:'/kitchen',           icon:'bi-qr-code-scan',  color:'#299cdb' },
                  { label:'Counter B', href:'/kitchen/counter-b', icon:'bi-upc-scan',       color:'#ffbf69' },
                  { label:'Counter C', href:'/kitchen/counter-c', icon:'bi-check2-square',  color:'#0ab39c' },
                  { label:'Dispatch',  href:'/kitchen/dispatch',  icon:'bi-truck',           color:'#364574' },
                ].map((link, i) => (
                  <button key={i} onClick={() => router.push(link.href)} className="btn btn-sm"
                    style={{ background:link.color+'15', color:link.color, border:`1px solid ${link.color}33`, borderRadius:7, fontSize:12, fontWeight:600, padding:'4px 10px' }}>
                    <i className={`bi ${link.icon} me-1`} />{link.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Today's Menu */}
        <div className="col-xl-4">
          <div className="card h-100" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <div style={{ width:32, height:32, borderRadius:8, background:'#ffbf6918', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="bi bi-calendar3" style={{ color:'#ffbf69', fontSize:16 }} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Today's Menu</h6>
                  <p className="mb-0" style={{ fontSize:11, color:'var(--bs-secondary-color)' }}>
                    {new Date().toLocaleDateString('en-US', { day:'numeric', month:'short' })}
                  </p>
                </div>
                <button onClick={() => router.push('/calendar')} className="btn btn-sm ms-auto"
                  style={{ background:'#ffbf6918', color:'#ffbf69', border:'none', borderRadius:7, fontSize:11, fontWeight:600 }}>
                  Edit
                </button>
              </div>

              {todaySchedule ? (
                <div className="mb-2 px-2 py-2 rounded d-flex align-items-center gap-2"
                  style={{ background: todaySchedule.thaali_enabled ? '#0ab39c15' : '#f0654815', border:`1px solid ${todaySchedule.thaali_enabled ? '#0ab39c30' : '#f0654830'}` }}>
                  <i className={`bi ${todaySchedule.thaali_enabled ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}
                    style={{ color: todaySchedule.thaali_enabled ? '#0ab39c' : '#f06548', fontSize:16, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: todaySchedule.thaali_enabled ? '#0ab39c' : '#f06548' }}>
                      {todaySchedule.thaali_enabled ? `Thaali Day — ${todaySchedule.total_thaalis} thaalis` : 'No Thaali Today'}
                    </div>
                    {todaySchedule.event_name && (
                      <div style={{ fontSize:11, color:'var(--bs-secondary-color)' }} className="text-truncate">{todaySchedule.event_name}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-2 px-2 py-2 rounded d-flex align-items-center gap-2"
                  style={{ background:'var(--bs-tertiary-bg)', border:'1px solid var(--bs-border-color)' }}>
                  <i className="bi bi-dash-circle" style={{ color:'var(--bs-secondary-color)', fontSize:16 }} />
                  <div style={{ fontSize:12, color:'var(--bs-secondary-color)' }}>
                    Not scheduled — <button onClick={() => router.push('/calendar')} className="btn btn-link p-0" style={{ fontSize:12 }}>Add</button>
                  </div>
                </div>
              )}

              {todayMenu && menuItems.length > 0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  {menuItems.map((item, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:'var(--bs-tertiary-bg)', borderRadius:7 }}>
                      <span style={{ fontSize:13 }}>{item.icon}</span>
                      <span style={{ fontSize:12, color:'var(--bs-secondary-color)', fontWeight:600, minWidth:55 }}>{item.label}</span>
                      <span style={{ fontSize:12, color:'var(--bs-body-color)', flex:1 }}>{item.value}</span>
                    </div>
                  ))}
                  {todayMenu.notes && (
                    <div style={{ padding:'5px 8px', background:'#fff3cd', borderRadius:7, fontSize:11, color:'#856404' }}>
                      <i className="bi bi-info-circle me-1" />{todayMenu.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign:'center', padding:'16px 0', color:'var(--bs-secondary-color)' }}>
                  <i className="bi bi-calendar-x" style={{ fontSize:24, display:'block', marginBottom:6, opacity:0.4 }} />
                  <p style={{ fontSize:12, margin:0 }}>No menu published</p>
                  <button onClick={() => router.push('/calendar')} className="btn btn-sm mt-2"
                    style={{ background:'#ffbf6918', color:'#ffbf69', border:'none', fontSize:11, borderRadius:7 }}>
                    Add menu
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Fiscal Year Panel ── */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="card" style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 mb-3">
                <div style={{ width:32, height:32, borderRadius:8, background:'#36457418', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="bi bi-moon-stars" style={{ color:'#364574', fontSize:16 }} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Fiscal Year (Hijri)</h6>
                  <p className="mb-0" style={{ fontSize:11, color:'var(--bs-secondary-color)' }}>FMB year runs 1 Ramadan → 29 Shaban</p>
                </div>
              </div>
              <div className="row g-3">
                <div className="col-md-4">
                  <div style={{ background:'#36457410', borderRadius:10, padding:14, border:'1px solid #36457425' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#364574', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Current FY</div>
                    <div style={{ fontSize:18, fontWeight:800, color:'#364574' }}>{currentFY.hijriYear}H</div>
                    <div style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4 }}>{fmtDateShort(currentFY.startGregorian)} → {fmtDateShort(currentFY.endGregorian)}</div>
                    <div style={{ fontSize:11, color:'#0ab39c', marginTop:4, fontWeight:600 }}>1 Ramadan {currentFY.hijriYear}H</div>
                    {rolloverDone && <div style={{ marginTop:8, fontSize:11, color:'#0ab39c', fontWeight:600 }}><i className="bi bi-check-circle-fill me-1" />Rollover done</div>}
                  </div>
                </div>
                <div className="col-md-4">
                  <div style={{ background:'#ffbf6910', borderRadius:10, padding:14, border:'1px solid #ffbf6930' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#856404', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Next FY</div>
                    <div style={{ fontSize:18, fontWeight:800, color:'#856404' }}>{nextFY.hijriYear}H</div>
                    <div style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4 }}>{fmtDateShort(nextFY.startGregorian)} → {fmtDateShort(nextFY.endGregorian)}</div>
                    <div style={{ fontSize:11, color:'#ffbf69', marginTop:4, fontWeight:600 }}>1 Ramadan {nextFY.hijriYear}H</div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div style={{
                    background: rolloverDone ? '#0ab39c10' : rolloverOverdue ? '#e6394610' : 'var(--bs-tertiary-bg)',
                    borderRadius:10, padding:14,
                    border:`1px solid ${rolloverDone ? '#0ab39c30' : rolloverOverdue ? '#e6394630' : 'var(--bs-border-color)'}`,
                    height:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--bs-secondary-color)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Year Rollover</div>
                      {rolloverDone ? (
                        <>
                          <div style={{ fontSize:14, fontWeight:700, color:'#0ab39c' }}><i className="bi bi-check-circle-fill me-2" />Completed</div>
                          {rolloverResult && <div style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4 }}>{rolloverResult.count} mumineen reset</div>}
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize:14, fontWeight:700, color: daysToRamadan <= 0 ? '#e63946' : 'var(--bs-body-color)' }}>
                            {daysToRamadan > 0 ? `${daysToRamadan} days to Ramadan` : 'Ramadan started!'}
                          </div>
                          <div style={{ fontSize:12, color:'var(--bs-secondary-color)', marginTop:4 }}>Resets all HOF niyyat to No-Show for {nextFY.hijriYear}H</div>
                        </>
                      )}
                    </div>
                    {!rolloverDone && (
                      <button onClick={() => setShowRolloverConfirm(true)} disabled={rolloverLoading} className="btn btn-sm mt-3 w-100"
                        style={{ background: rolloverOverdue ? '#e63946' : '#364574', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600 }}>
                        {rolloverLoading
                          ? <><span className="spinner-border spinner-border-sm me-1" />Rolling over...</>
                          : <><i className="bi bi-arrow-repeat me-1" />Rollover to {nextFY.hijriYear}H</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="row g-3">
        {[
          { label:'Mumineen',         sub:'Manage community members',         icon:'bi-people-fill',      color:'#364574', href:'/mumineen' },
          { label:'Thaali',           sub:'Registrations & stickers',         icon:'bi-cup-hot',          color:'#0ab39c', href:'/thaali' },
          { label:'Address Requests', sub:`${stats.pendingAddressRequests} pending`, icon:'bi-geo-alt-fill', color:'#299cdb', href:'/address-requests' },
          { label:'Takhmeen',         sub:`${stats.pendingTakhmeem} pending niyyat`, icon:'bi-clipboard-check', color:'#ffbf69', href:'/takhmeen' },
          { label:'Distributors',     sub:'Manage distributors',              icon:'bi-truck',            color:'#364574', href:'/distributors' },
          { label:'Calendar',         sub:'Events & daily menu',              icon:'bi-calendar3',        color:'#ffbf69', href:'/calendar' },
        ].map((item, i) => (
          <div key={i} className="col-xl-2 col-md-4 col-6">
            <div className="card h-100" onClick={() => router.push(item.href)}
              style={{ borderRadius:12, border:'none', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow='0 4px 16px rgba(0,0,0,0.12)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform='translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow='0 1px 6px rgba(0,0,0,0.07)' }}>
              <div className="card-body p-3 d-flex flex-column align-items-center text-center gap-2">
                <div style={{ width:40, height:40, borderRadius:10, background:item.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`bi ${item.icon}`} style={{ fontSize:18, color:item.color }} />
                </div>
                <div>
                  <p className="mb-0 fw-bold" style={{ fontSize:13, color:'var(--bs-body-color)' }}>{item.label}</p>
                  <p className="mb-0" style={{ fontSize:11, color:'var(--bs-secondary-color)' }}>{item.sub}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rollover Confirm Modal */}
      {showRolloverConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--bs-body-bg)', borderRadius:14, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ background:'#e6394610', padding:20, borderBottom:'1px solid #e6394620', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'#e6394620', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color:'#e63946', fontSize:18 }} />
              </div>
              <div>
                <h6 className="mb-0 fw-bold" style={{ color:'#e63946' }}>Confirm Fiscal Year Rollover</h6>
                <p className="mb-0" style={{ fontSize:12, color:'var(--bs-secondary-color)' }}>This action cannot be undone</p>
              </div>
            </div>
            <div style={{ padding:20 }}>
              <p style={{ fontSize:14, color:'var(--bs-body-color)', marginBottom:12 }}>
                This will start <strong>FY {nextFY.hijriYear}H</strong> by resetting niyyat for all active HOF mumineen.
              </p>
              <div style={{ background:'var(--bs-tertiary-bg)', borderRadius:8, padding:12, fontSize:13, color:'var(--bs-body-color)' }}>
                <div className="d-flex align-items-center gap-2 mb-2"><i className="bi bi-arrow-right-circle" style={{ color:'#e63946' }} /><span><strong>niyyat_status_id</strong> → No-Show</span></div>
                <div className="d-flex align-items-center gap-2"><i className="bi bi-arrow-right-circle" style={{ color:'#e63946' }} /><span>Takhmeem history and thaali registrations untouched</span></div>
              </div>
            </div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid var(--bs-border-color)', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowRolloverConfirm(false)} className="btn btn-sm btn-outline-secondary" style={{ borderRadius:8, fontSize:13 }}>Cancel</button>
              <button onClick={handleRollover} className="btn btn-sm" style={{ background:'#e63946', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600 }}>
                <i className="bi bi-arrow-repeat me-1" />Yes, Rollover to {nextFY.hijriYear}H
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}