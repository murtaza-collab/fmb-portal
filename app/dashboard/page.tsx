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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
      <div className="spinner-border text-primary" role="status" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f3f3f9' }}>
      
      {/* Top Navbar */}
      <div style={{ background: '#364574', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h5 className="text-white mb-0">AMB FMB Niyaz Niyat</h5>
        <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className="container-fluid p-4">
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
            { label: 'Today\'s Calendar', value: '—', icon: '📅', color: '#299cdb' },
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

        {/* Modules Grid */}
        <div className="row g-3 mt-2">
          {[
            { label: 'Mumineen', href: '/mumineen', icon: '👥' },
            { label: 'Thaali', href: '/thaali', icon: '🍽️' },
            { label: 'Distribution', href: '/distribution', icon: '📦' },
            { label: 'Distributors', href: '/distributors', icon: '🚗' },
            { label: 'Sectors', href: '/sectors', icon: '🗺️' },
            { label: 'Takhmeem', href: '/takhmeem', icon: '💰' },
            { label: 'Calendar', href: '/calendar', icon: '📅' },
            { label: 'Users', href: '/users', icon: '⚙️' },
          ].map((mod, i) => (
            <div key={i} className="col-xl-3 col-md-4 col-6">
              <div 
                className="card text-center p-3" 
                style={{ borderRadius: '10px', border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', cursor: 'pointer' }}
                onClick={() => router.push(mod.href)}
              >
                <div style={{ fontSize: '36px' }}>{mod.icon}</div>
                <p className="mb-0 mt-2 fw-semibold text-dark">{mod.label}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}