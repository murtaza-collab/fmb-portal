'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="spinner-border text-primary" role="status" />
    </div>
  )

  return (
    <div>
      <div className="row mb-4">
        <div className="col">
          <h4 className="text-dark">Dashboard</h4>
          <p className="text-muted">Welcome to the Admin Portal</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row g-3">
        {[
          { label: 'Total Mumineen', value: '—', icon: '👥', color: '#364574' },
          { label: 'Active Thaalis', value: '—', icon: '🍽️', color: '#0ab39c' },
          { label: 'Distributors', value: '—', icon: '🚗', color: '#f06548' },
          { label: "Today's Calendar", value: '—', icon: '📅', color: '#299cdb' },
        ].map((stat, i) => (
          <div key={i} className="col-xl-3 col-md-6">
            <div className="card" style={{ borderRadius: '10px', border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <p className="text-muted mb-1" style={{ fontSize: '13px' }}>{stat.label}</p>
                    <h4 className="mb-0" style={{ color: stat.color }}>{stat.value}</h4>
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