'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalMumineen: '—',
    activeThaalis: '—',
    distributors: '—',
    todayMenu: '—',
  })
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setLoading(false)
        fetchStats()
      }
    })
  }, [router])

  const fetchStats = async () => {
    // Total Mumineen (HOFs only = households)
    const { count: mumineenCount } = await supabase
      .from('mumineen')
      .select('*', { count: 'exact', head: true })
      .eq('is_hof', true)

    // Active Thaalis (thaali_registrations with active status)
    const { count: thaaliCount } = await supabase
      .from('thaali_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    // Active Distributors
    const { count: distributorCount } = await supabase
      .from('distributors')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    // Today's calendar event menu
    const today = new Date().toISOString().split('T')[0]
    const { data: todayEvent } = await supabase
      .from('calendar_events')
      .select('menu')
      .eq('event_date', today)
      .maybeSingle()

    setStats({
      totalMumineen: mumineenCount?.toString() ?? '0',
      activeThaalis: thaaliCount?.toString() ?? '0',
      distributors: distributorCount?.toString() ?? '0',
      todayMenu: todayEvent?.menu || 'No event',
    })
  }

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="spinner-border text-primary" role="status" />
    </div>
  )

  const cards = [
    { label: 'Total Households', value: stats.totalMumineen, icon: '👥', color: '#364574' },
    { label: 'Active Thaalis', value: stats.activeThaalis, icon: '🍽️', color: '#0ab39c' },
    { label: 'Active Distributors', value: stats.distributors, icon: '🚗', color: '#f06548' },
    { label: "Today's Menu", value: stats.todayMenu, icon: '📅', color: '#299cdb' },
  ]

  return (
    <div>
      <div className="row mb-4">
        <div className="col">
          <h4 className="text-dark">Dashboard</h4>
          <p className="text-muted">Welcome to the Admin Portal</p>
        </div>
      </div>

      <div className="row g-3">
        {cards.map((stat, i) => (
          <div key={i} className="col-xl-3 col-md-6">
            <div className="card" style={{ borderRadius: '10px', border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <p className="text-muted mb-1" style={{ fontSize: '13px' }}>{stat.label}</p>
                    <h4 className="mb-0" style={{ color: stat.color, fontSize: stat.label === "Today's Menu" ? '16px' : undefined }}>
                      {stat.value}
                    </h4>
                  </div>
                  <div style={{ fontSize: '32px' }}>{stat.icon}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}