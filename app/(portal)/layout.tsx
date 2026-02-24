'use client'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const menuItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { label: 'Mumineen', href: '/mumineen', icon: '👥' },
  { label: 'Thaali', href: '/thaali', icon: '🍽️' },
  { label: 'Distribution', href: '/distribution', icon: '📦' },
  { label: 'Distributors', href: '/distributors', icon: '🚗' },
  { label: 'Sectors', href: '/sectors', icon: '🗺️' },
  { label: 'Takhmeen', href: '/takhmeen', icon: '💰' },
  { label: 'Calendar', href: '/calendar', icon: '📅' },
  { label: 'Users', href: '/users', icon: '⚙️' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f3f9' }}>
      
      {/* Sidebar */}
      <div style={{ width: '240px', background: '#364574', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h6 className="text-white mb-0 fw-bold">AMB FMB</h6>
          <small style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Niyaz Niyat Portal</small>
        </div>

        {/* Menu */}
        <nav style={{ padding: '12px 0', flex: 1 }}>
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <div
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #fff' : '3px solid transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={handleLogout}
            className="btn btn-sm w-100"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none' }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Top bar */}
        <div style={{ background: '#fff', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #e9ebec', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h6 className="mb-0 text-muted fw-normal">
            {menuItems.find(m => m.href === pathname)?.label || 'Dashboard'}
          </h6>
        </div>
        
        {/* Page content */}
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>

    </div>
  )
}