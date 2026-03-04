'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { todayHijri, getRamadanStart, getFMBFiscalYear, formatHijri, gregorianToHijri, HIJRI_MONTHS } from '@/lib/hijri'

interface TodayMenu {
  mithas?: string; tarkari?: string; chawal?: string
  soup?: string; roti?: string; salad?: string; notes?: string
}

interface KitchenStats {
  yetToArrive: number; arrived: number; inProgress: number
  counterBDone: number; counterCDone: number; dispatched: number
  totalDistributors: number; totalThaalisInProcess: number
  totalThaalisReady: number; totalThaalisDispatched: number
}

const NO_SHOW_ID = 3

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    activeHouseholds: 0, inactiveHouseholds: 0,
    activeThaalis: 0, stoppedThaalis: 0,
    activeSectors: 0, activeDistributors: 0, totalMumineen: 0,
  })
  const [todayMenu, setTodayMenu] = useState<TodayMenu | null>(null)
  const [kitchenStats, setKitchenStats] = useState<KitchenStats>({
    yetToArrive: 0, arrived: 0, inProgress: 0, counterBDone: 0,
    counterCDone: 0, dispatched: 0, totalDistributors: 0,
    totalThaalisInProcess: 0, totalThaalisReady: 0, totalThaalisDispatched: 0,
  })
  const [currentTime, setCurrentTime] = useState(new Date())

  // Fiscal year state
  const [rolloverLoading, setRolloverLoading] = useState(false)
  const [rolloverDone, setRolloverDone] = useState(false)
  const [showRolloverConfirm, setShowRolloverConfirm] = useState(false)
  const [rolloverResult, setRolloverResult] = useState<{ count: number } | null>(null)

  const router = useRouter()
  const today = new Date()
  const todayH = todayHijri()

  // Fiscal year info
  const currentFY = getFMBFiscalYear(todayH.month >= 9 ? todayH.year : todayH.year - 1)
  const nextFY = getFMBFiscalYear(currentFY.hijriYear + 1)
  const daysToRamadan = Math.ceil((nextFY.startGregorian.getTime() - today.setHours(0,0,0,0)) / 86400000)
  const isRamadanToday = todayH.month === 9 && todayH.day === 1
  const ramadanAlreadyThisYear = todayH.month >= 9

  // Check if rollover already done this FY
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
    // Check if any HOF still has No-Show from current FY start
    // Simple proxy: if rollover_at exists in a meta table, use it
    // For now check if there's a record in fiscal_year_rollovers table
    const { data } = await supabase
      .from('fiscal_year_rollovers')
      .select('id, rolled_at')
      .eq('hijri_year', currentFY.hijriYear)
      .maybeSingle()
    if (data) setRolloverDone(true)
  }

  const fetchStats = async () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const [
      { count: activeHOF }, { count: inactiveHOF },
      { count: activeThaali }, { count: stoppedThaali },
      { count: activeSectors }, { count: activeDistributors },
      { count: totalMumineen },
    ] = await Promise.all([
      supabase.from('mumineen').select('*', { count: 'exact', head: true }).eq('is_hof', true).eq('status', 'active'),
      supabase.from('mumineen').select('*', { count: 'exact', head: true }).eq('is_hof', true).eq('status', 'inactive'),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'stopped'),
      supabase.from('house_sectors').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('distributors').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('mumineen').select('*', { count: 'exact', head: true }),
    ])
    setStats({
      activeHouseholds: activeHOF ?? 0, inactiveHouseholds: inactiveHOF ?? 0,
      activeThaalis: activeThaali ?? 0, stoppedThaalis: stoppedThaali ?? 0,
      activeSectors: activeSectors ?? 0, activeDistributors: activeDistributors ?? 0,
      totalMumineen: totalMumineen ?? 0,
    })

    // Today's menu
    const { data: menu } = await supabase.from('daily_menu').select('*').eq('menu_date', todayStr).maybeSingle()
    setTodayMenu(menu)

    // Kitchen stats
    const { data: sessions } = await supabase
      .from('distribution_sessions')
      .select('status, total_thaalis')
      .eq('session_date', todayStr)
    const totalDist = activeDistributors ?? 0
    const arrived = sessions?.filter(s => s.status === 'arrived').length ?? 0
    const inProgress = sessions?.filter(s => s.status === 'in_progress').length ?? 0
    const bDone = sessions?.filter(s => s.status === 'counter_b_done').length ?? 0
    const cDone = sessions?.filter(s => s.status === 'counter_c_done').length ?? 0
    const dispatched = sessions?.filter(s => s.status === 'dispatched').length ?? 0
    const yetToArrive = Math.max(0, totalDist - (arrived + inProgress + bDone + cDone + dispatched))
    const inProcessSessions = sessions?.filter(s => ['in_progress','counter_b_done','counter_c_done'].includes(s.status)) ?? []
    const readySessions = sessions?.filter(s => ['counter_b_done','counter_c_done'].includes(s.status)) ?? []
    const dispatchedSessions = sessions?.filter(s => s.status === 'dispatched') ?? []
    setKitchenStats({
      yetToArrive, arrived, inProgress, counterBDone: bDone, counterCDone: cDone, dispatched,
      totalDistributors: totalDist,
      totalThaalisInProcess: inProcessSessions.reduce((a, s) => a + (s.total_thaalis ?? 0), 0),
      totalThaalisReady: readySessions.reduce((a, s) => a + (s.total_thaalis ?? 0), 0),
      totalThaalisDispatched: dispatchedSessions.reduce((a, s) => a + (s.total_thaalis ?? 0), 0),
    })
  }

  const handleRollover = async () => {
    setRolloverLoading(true)
    setShowRolloverConfirm(false)
    try {
      // Reset all active HOF mumineen niyyat to No-Show
      const { data, error } = await supabase
        .from('mumineen')
        .update({
          niyyat_status_id: NO_SHOW_ID,
          niyyat_done: false,
          niyyat_done_on: null,
        })
        .eq('is_hof', true)
        .eq('status', 'active')
        .select('id')

      if (error) throw error

      const count = data?.length ?? 0

      // Log the rollover
      await supabase.from('fiscal_year_rollovers').insert({
        hijri_year: currentFY.hijriYear,
        rolled_at: new Date().toISOString(),
        mumineen_reset_count: count,
      })

      setRolloverResult({ count })
      setRolloverDone(true)
      fetchStats()
    } catch (err: any) {
      alert('Rollover failed: ' + err.message)
    }
    setRolloverLoading(false)
  }

  const greeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const formatDateShort = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="spinner-border" style={{ color: '#364574' }} />
    </div>
  )

  const menuItems = todayMenu ? [
    { label: 'Mithas', value: todayMenu.mithas, icon: '🍮' },
    { label: 'Tarkari', value: todayMenu.tarkari, icon: '🥘' },
    { label: 'Soup', value: todayMenu.soup, icon: '🍲' },
    { label: 'Chawal', value: todayMenu.chawal, icon: '🍚' },
    { label: 'Roti', value: todayMenu.roti, icon: '🫓' },
    { label: 'Salad', value: todayMenu.salad, icon: '🥗' },
  ].filter(i => i.value) : []

  const kitchenFlow = [
    { label: 'Yet to Arrive', value: kitchenStats.yetToArrive, color: '#6c757d', bg: '#6c757d18', icon: 'bi-hourglass' },
    { label: 'Arrived', value: kitchenStats.arrived, color: '#299cdb', bg: '#299cdb18', icon: 'bi-person-check' },
    { label: 'Filling', value: kitchenStats.inProgress + kitchenStats.counterBDone + kitchenStats.counterCDone, color: '#ffbf69', bg: '#ffbf6918', icon: 'bi-cup-hot', sub: `${kitchenStats.totalThaalisInProcess} thaalis` },
    { label: 'Ready', value: kitchenStats.counterBDone + kitchenStats.counterCDone, color: '#0ab39c', bg: '#0ab39c18', icon: 'bi-check2-circle', sub: `${kitchenStats.totalThaalisReady} thaalis` },
    { label: 'Dispatched', value: kitchenStats.dispatched, color: '#364574', bg: '#36457418', icon: 'bi-truck', sub: `${kitchenStats.totalThaalisDispatched} thaalis` },
  ]

  // Rollover card color/state
  const rolloverUrgent = daysToRamadan <= 7 && daysToRamadan > 0
  const rolloverOverdue = isRamadanToday && !rolloverDone

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: '#212529' }}>{greeting()} 👋</h4>
          <p className="mb-0 text-muted" style={{ fontSize: '13px' }}>{formatDate(currentTime)}</p>
        </div>
        <div className="d-flex gap-2">
          <button onClick={() => router.push('/kitchen')} className="btn btn-sm" style={{ background: '#364574', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
            <i className="bi bi-grid-3x3-gap me-1" />Kitchen Portal
          </button>
          <button onClick={fetchStats} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: '8px', fontSize: '13px' }}>
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>

      {/* Core Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Mumineen', value: stats.totalMumineen, sub: `${stats.activeHouseholds} households`, icon: 'bi-people-fill', color: '#364574' },
          { label: 'Active Thaalis', value: stats.activeThaalis, sub: `${stats.stoppedThaalis} stopped`, icon: 'bi-cup-hot', color: '#0ab39c' },
          { label: 'Active Sectors', value: stats.activeSectors, sub: 'total sectors', icon: 'bi-map-fill', color: '#ffbf69' },
          { label: 'Active Distributors', value: stats.activeDistributors, sub: 'registered', icon: 'bi-truck', color: '#299cdb' },
        ].map((card, i) => (
          <div key={i} className="col-xl-3 col-md-6">
            <div className="card h-100" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <p className="text-muted mb-1" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>{card.label}</p>
                    <h3 className="mb-0 fw-bold" style={{ color: card.color, fontSize: '28px' }}>{card.value}</h3>
                    <p className="text-muted mb-0 mt-1" style={{ fontSize: '12px' }}>{card.sub}</p>
                  </div>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: card.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`bi ${card.icon}`} style={{ fontSize: '20px', color: card.color }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fiscal Year Rollover Banner — shown when overdue or urgent */}
      {(rolloverOverdue || rolloverUrgent) && !rolloverDone && (
        <div className="mb-4" style={{
          background: rolloverOverdue ? '#e6394610' : '#ffbf6915',
          border: `1px solid ${rolloverOverdue ? '#e63946' : '#ffbf69'}`,
          borderRadius: '12px', padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
        }}>
          <div className="d-flex align-items-center gap-3">
            <i className={`bi ${rolloverOverdue ? 'bi-exclamation-circle-fill' : 'bi-bell-fill'}`}
              style={{ fontSize: '22px', color: rolloverOverdue ? '#e63946' : '#ffbf69' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: rolloverOverdue ? '#e63946' : '#856404' }}>
                {rolloverOverdue ? 'Rollover Required — Today is 1 Ramadan!' : `Ramadan in ${daysToRamadan} days — Rollover due soon`}
              </div>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>
                New fiscal year {nextFY.hijriYear}H starts {formatDateShort(nextFY.startGregorian)}. Reset all mumineen niyyat to No-Show.
              </div>
            </div>
          </div>
          <button onClick={() => setShowRolloverConfirm(true)} className="btn btn-sm"
            style={{ background: rolloverOverdue ? '#e63946' : '#ffbf69', color: rolloverOverdue ? '#fff' : '#212529', borderRadius: '8px', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>
            <i className="bi bi-arrow-repeat me-1" />Rollover Now
          </button>
        </div>
      )}

      {/* Kitchen + Menu */}
      <div className="row g-3 mb-4">
        <div className="col-xl-8">
          <div className="card h-100" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2">
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#36457418', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="bi bi-grid-3x3-gap" style={{ color: '#364574', fontSize: '16px' }} />
                  </div>
                  <div>
                    <h6 className="mb-0 fw-bold">Kitchen Operations</h6>
                    <p className="mb-0 text-muted" style={{ fontSize: '11px' }}>Today's distribution status</p>
                  </div>
                </div>
              </div>
              <div className="row g-2 mb-3">
                {kitchenFlow.map((item, i) => (
                  <div key={i} className="col">
                    <div style={{ background: item.bg, borderRadius: '10px', padding: '12px 10px', textAlign: 'center', border: `1px solid ${item.color}22` }}>
                      <i className={`bi ${item.icon}`} style={{ fontSize: '18px', color: item.color, display: 'block', marginBottom: '4px' }} />
                      <div style={{ fontSize: '22px', fontWeight: 700, color: item.color, lineHeight: 1 }}>{item.value}</div>
                      <div style={{ fontSize: '10px', color: '#6c757d', marginTop: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{item.label}</div>
                      {item.sub && <div style={{ fontSize: '10px', color: item.color, marginTop: '2px' }}>{item.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <span style={{ fontSize: '11px', color: '#6c757d', fontWeight: 600, display: 'flex', alignItems: 'center' }}>Quick access:</span>
                {[
                  { label: 'Arrival', href: '/kitchen', icon: 'bi-qr-code-scan', color: '#299cdb' },
                  { label: 'Counter B', href: '/kitchen/counter-b', icon: 'bi-upc-scan', color: '#ffbf69' },
                  { label: 'Counter C', href: '/kitchen/counter-c', icon: 'bi-check2-square', color: '#0ab39c' },
                  { label: 'Dispatch', href: '/kitchen/dispatch', icon: 'bi-truck', color: '#364574' },
                ].map((link, i) => (
                  <button key={i} onClick={() => router.push(link.href)} className="btn btn-sm"
                    style={{ background: link.color + '15', color: link.color, border: `1px solid ${link.color}33`, borderRadius: '7px', fontSize: '12px', fontWeight: 600, padding: '4px 10px' }}>
                    <i className={`bi ${link.icon} me-1`} />{link.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card h-100" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 mb-3">
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ffbf6918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-calendar3" style={{ color: '#ffbf69', fontSize: '16px' }} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Today's Menu</h6>
                  <p className="mb-0 text-muted" style={{ fontSize: '11px' }}>{new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</p>
                </div>
                <button onClick={() => router.push('/calendar')} className="btn btn-sm ms-auto"
                  style={{ background: '#ffbf6918', color: '#ffbf69', border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: 600 }}>
                  Edit
                </button>
              </div>
              {todayMenu && menuItems.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {menuItems.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: '#f8f9fa', borderRadius: '7px' }}>
                      <span style={{ fontSize: '14px' }}>{item.icon}</span>
                      <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 600, minWidth: '60px' }}>{item.label}</span>
                      <span style={{ fontSize: '12px', color: '#212529', flex: 1 }}>{item.value}</span>
                    </div>
                  ))}
                  {todayMenu.notes && (
                    <div style={{ padding: '6px 8px', background: '#fff3cd', borderRadius: '7px', fontSize: '11px', color: '#856404' }}>
                      <i className="bi bi-info-circle me-1" />{todayMenu.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#6c757d' }}>
                  <i className="bi bi-calendar-x" style={{ fontSize: '28px', display: 'block', marginBottom: '8px', opacity: 0.4 }} />
                  <p style={{ fontSize: '13px', margin: 0 }}>No menu published today</p>
                  <button onClick={() => router.push('/calendar')} className="btn btn-sm mt-2"
                    style={{ background: '#ffbf6918', color: '#ffbf69', border: 'none', fontSize: '12px', borderRadius: '7px' }}>
                    Add menu
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fiscal Year Panel */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="card" style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 mb-3">
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#36457418', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-moon-stars" style={{ color: '#364574', fontSize: '16px' }} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Fiscal Year (Hijri)</h6>
                  <p className="mb-0 text-muted" style={{ fontSize: '11px' }}>FMB year runs 1 Ramadan → 29 Shaban</p>
                </div>
              </div>

              <div className="row g-3">
                {/* Current FY */}
                <div className="col-md-4">
                  <div style={{ background: '#36457410', borderRadius: '10px', padding: '14px', border: '1px solid #36457425' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#364574', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Current FY</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#364574' }}>{currentFY.hijriYear}H</div>
                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                      {formatDateShort(currentFY.startGregorian)} → {formatDateShort(currentFY.endGregorian)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#0ab39c', marginTop: '4px', fontWeight: 600 }}>
                      1 Ramadan {currentFY.hijriYear}H
                    </div>
                    {rolloverDone && (
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0ab39c', fontWeight: 600 }}>
                        <i className="bi bi-check-circle-fill" /> Rollover done
                      </div>
                    )}
                  </div>
                </div>

                {/* Next FY */}
                <div className="col-md-4">
                  <div style={{ background: '#ffbf6910', borderRadius: '10px', padding: '14px', border: '1px solid #ffbf6930' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#856404', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Next FY</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#856404' }}>{nextFY.hijriYear}H</div>
                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                      {formatDateShort(nextFY.startGregorian)} → {formatDateShort(nextFY.endGregorian)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#ffbf69', marginTop: '4px', fontWeight: 600 }}>
                      1 Ramadan {nextFY.hijriYear}H
                    </div>
                  </div>
                </div>

                {/* Rollover action */}
                <div className="col-md-4">
                  <div style={{
                    background: rolloverDone ? '#0ab39c10' : rolloverOverdue ? '#e6394610' : '#f8f9fa',
                    borderRadius: '10px', padding: '14px',
                    border: `1px solid ${rolloverDone ? '#0ab39c30' : rolloverOverdue ? '#e6394630' : '#e9ebec'}`,
                    height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Year Rollover</div>
                      {rolloverDone ? (
                        <>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0ab39c' }}>
                            <i className="bi bi-check-circle-fill me-2" />Completed
                          </div>
                          {rolloverResult && (
                            <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                              {rolloverResult.count} mumineen reset to No-Show
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: daysToRamadan <= 0 ? '#e63946' : '#212529' }}>
                            {daysToRamadan > 0 ? `${daysToRamadan} days to Ramadan` : 'Ramadan started!'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                            Resets all HOF niyyat to No-Show for {nextFY.hijriYear}H
                          </div>
                        </>
                      )}
                    </div>
                    {!rolloverDone && (
                      <button
                        onClick={() => setShowRolloverConfirm(true)}
                        disabled={rolloverLoading}
                        className="btn btn-sm mt-3 w-100"
                        style={{
                          background: rolloverOverdue ? '#e63946' : '#364574',
                          color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600
                        }}>
                        {rolloverLoading
                          ? <><span className="spinner-border spinner-border-sm me-1" />Rolling over...</>
                          : <><i className="bi bi-arrow-repeat me-1" />Rollover to {nextFY.hijriYear}H</>
                        }
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
          { label: 'Mumineen', sub: 'Manage community members', icon: 'bi-people-fill', color: '#364574', href: '/mumineen' },
          { label: 'Thaali', sub: 'Registrations & stickers', icon: 'bi-cup-hot', color: '#0ab39c', href: '/thaali' },
          { label: 'Distributors', sub: 'Manage distributors', icon: 'bi-truck', color: '#299cdb', href: '/distributors' },
          { label: 'Calendar', sub: 'Events & daily menu', icon: 'bi-calendar3', color: '#ffbf69', href: '/calendar' },
        ].map((item, i) => (
          <div key={i} className="col-xl-3 col-md-6">
            <div className="card h-100" onClick={() => router.push(item.href)}
              style={{ borderRadius: '12px', border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 6px rgba(0,0,0,0.07)' }}>
              <div className="card-body p-3 d-flex align-items-center gap-3">
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: item.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`bi ${item.icon}`} style={{ fontSize: '18px', color: item.color }} />
                </div>
                <div>
                  <p className="mb-0 fw-bold" style={{ fontSize: '14px', color: '#212529' }}>{item.label}</p>
                  <p className="mb-0 text-muted" style={{ fontSize: '11px' }}>{item.sub}</p>
                </div>
                <i className="bi bi-chevron-right ms-auto text-muted" style={{ fontSize: '13px' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rollover Confirm Modal */}
      {showRolloverConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: '#e6394610', padding: '20px', borderBottom: '1px solid #e6394620', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e6394620', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#e63946', fontSize: '18px' }} />
              </div>
              <div>
                <h6 className="mb-0 fw-bold" style={{ color: '#e63946' }}>Confirm Fiscal Year Rollover</h6>
                <p className="mb-0" style={{ fontSize: '12px', color: '#6c757d' }}>This action cannot be undone</p>
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '14px', color: '#212529', marginBottom: '12px' }}>
                This will start <strong>FY {nextFY.hijriYear}H</strong> by resetting niyyat for all active mumineen:
              </p>
              <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#495057' }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-arrow-right-circle" style={{ color: '#e63946' }} />
                  <span><strong>niyyat_status_id</strong> → No-Show (ID: 3)</span>
                </div>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-arrow-right-circle" style={{ color: '#e63946' }} />
                  <span><strong>niyyat_done</strong> → false</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-arrow-right-circle" style={{ color: '#e63946' }} />
                  <span><strong>niyyat_done_on</strong> → null</span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '12px', marginBottom: 0 }}>
                Only active HOF mumineen are affected. Takhmeem history and thaali registrations are untouched.
              </p>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e9ebec', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRolloverConfirm(false)} className="btn btn-sm btn-outline-secondary" style={{ borderRadius: '8px', fontSize: '13px' }}>
                Cancel
              </button>
              <button onClick={handleRollover} className="btn btn-sm" style={{ background: '#e63946', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                <i className="bi bi-arrow-repeat me-1" />Yes, Rollover to {nextFY.hijriYear}H
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}