'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    activeHouseholds: 0,
    inactiveHouseholds: 0,
    activeThaalis: 0,
    stoppedThaalis: 0,
    activeSectors: 0,
    activeDistributors: 0,
    todayMenu: '—',
  })
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setLoading(false)
      fetchStats()
    })
  }, [router])

  const fetchStats = async () => {
    const [
      { count: activeHOF },
      { count: inactiveHOF },
      { count: activeThaali },
      { count: stoppedThaali },
      { count: activeSectors },
      { count: activeDistributors },
    ] = await Promise.all([
      supabase.from('mumineen').select('*', { count: 'exact', head: true }).eq('is_hof', true).eq('status', 'active'),
      supabase.from('mumineen').select('*', { count: 'exact', head: true }).eq('is_hof', true).eq('status', 'inactive'),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('thaali_registrations').select('*', { count: 'exact', head: true }).eq('status', 'stopped'),
      supabase.from('house_sectors').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('distributors').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    const today = new Date().toISOString().split('T')[0]
    const { data: todayEvent } = await supabase
      .from('calendar_events').select('menu').eq('event_date', today).maybeSingle()

    setStats({
      activeHouseholds: activeHOF ?? 0,
      inactiveHouseholds: inactiveHOF ?? 0,
      activeThaalis: activeThaali ?? 0,
      stoppedThaalis: stoppedThaali ?? 0,
      activeSectors: activeSectors ?? 0,
      activeDistributors: activeDistributors ?? 0,
      todayMenu: todayEvent?.menu || 'No event today',
    })
  }

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="spinner-border text-primary" role="status" />
    </div>
  )

  const cards = [
    {
      label: 'Active Households',
      value: stats.activeHouseholds,
      sub: `${stats.inactiveHouseholds} inactive`,
      icon: 'bi-house-heart',
      color: '#364574',
    },
    {
      label: 'Active Thaalis',
      value: stats.activeThaalis,
      sub: `${stats.stoppedThaalis} stopped`,
      icon: 'bi-bowl-hot',
      color: '#0ab39c',
    },
    {
      label: 'Active Sectors',
      value: stats.activeSectors,
      sub: 'total sectors',
      icon: 'bi-map',
      color: '#ffbf69',
    },
    {
      label: 'Active Distributors',
      value: stats.activeDistributors,
      sub: 'registered distributors',
      icon: 'bi-truck',
      color: '#299cdb',
    },
  ]

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      <div className="row g-3 mb-4">
        {cards.map((card, i) => (
          <div key={i} className="col-xl-3 col-md-6">
            <div className="card h-100" style={{ borderRadius: '10px', border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <p className="text-muted mb-1" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</p>
                    <h3 className="mb-0 fw-bold" style={{ color: card.color }}>{card.value}</h3>
                    <p className="text-muted mb-0 mt-1" style={{ fontSize: '12px' }}>{card.sub}</p>
                  </div>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    background: card.color + '18', display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    <i className={`bi ${card.icon}`} style={{ fontSize: '20px', color: card.color }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today's Menu */}
      <div className="card" style={{ borderRadius: '10px', border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div className="card-body p-3 d-flex align-items-center gap-3">
          <div style={{
            width: '44px', height: '44px', borderRadius: '10px',
            background: '#ffbf6918', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <i className="bi bi-calendar3" style={{ fontSize: '20px', color: '#ffbf69' }} />
          </div>
          <div>
            <p className="text-muted mb-0" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Menu</p>
            <p className="mb-0 fw-semibold" style={{ fontSize: '15px', color: '#364574' }}>{stats.todayMenu}</p>
          </div>
        </div>
      </div>
    </>
  )
}