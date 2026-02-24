'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ALL_MENU_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '🏠', module: 'dashboard' },
  { label: 'Mumineen', href: '/mumineen', icon: '👥', module: 'mumineen' },
  { label: 'Thaali', href: '/thaali', icon: '🍽️', module: 'thaali' },
  { label: 'Distribution', href: '/distribution', icon: '📦', module: 'distribution' },
  { label: 'Distributors', href: '/distributors', icon: '🚗', module: 'distributors' },
  { label: 'Sectors', href: '/sectors', icon: '🗺️', module: 'sectors' },
  { label: 'Takhmeem', href: '/takhmeen', icon: '💰', module: 'takhmeem' },
  { label: 'Calendar', href: '/calendar', icon: '📅', module: 'calendar' },
  { label: 'Users', href: '/users', icon: '⚙️', module: 'users' },
]

interface AdminUser {
  id: number
  full_name: string
  username: string
  status: string
  user_group_id: number
  user_groups?: { name: string }
}

interface Permission {
  module: string
  can_view: boolean
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [menuItems, setMenuItems] = useState(ALL_MENU_ITEMS)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    const handleClick = () => setShowProfileDropdown(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Get admin user record
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*, user_groups(name)')
      .eq('auth_id', user.id)
      .single()

    if (!adminData) { await supabase.auth.signOut(); router.push('/login'); return }

    // Block deactivated users
    if (adminData.status !== 'active') {
      await supabase.auth.signOut()
      router.push('/login?error=inactive')
      return
    }

    setAdminUser(adminData)

    // Fetch permissions for this user's group
    if (adminData.user_group_id) {
      const { data: permsData } = await supabase
        .from('permissions')
        .select('module, can_view')
        .eq('user_group_id', adminData.user_group_id)

      const perms = permsData || []
      setPermissions(perms)

      // Filter menu to only modules user can view
      const allowed = perms.filter(p => p.can_view).map(p => p.module)
      setMenuItems(ALL_MENU_ITEMS.filter(m => allowed.includes(m.module)))
    } else {
      // No group = no access except dashboard
      setMenuItems(ALL_MENU_ITEMS.filter(m => m.module === 'dashboard'))
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f3f9' }}>
        <div className="spinner-border text-primary" />
      </div>
    )
  }

  const currentLabel = ALL_MENU_ITEMS.find(m => pathname.startsWith(m.href))?.label || 'Portal'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f3f9' }}>

      {/* Sidebar */}
      <div style={{ width: '240px', background: '#364574', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100 }}>

        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h6 className="text-white mb-0 fw-bold">AMB FMB</h6>
          <small style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Niyaz Niyat Portal</small>
        </div>

        {/* Menu */}
        <nav style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
          {menuItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <div
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 16px', cursor: 'pointer',
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #fff' : '3px solid transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontSize: '14px', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>

        {/* User info at bottom of sidebar */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0
            }}>
              {adminUser?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {adminUser?.full_name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                {adminUser?.user_groups?.name || 'No Group'}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-sm w-100"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontSize: '13px' }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content — offset for fixed sidebar */}
      <div style={{ flex: 1, marginLeft: '240px', overflow: 'auto', minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{
          background: '#fff', padding: '0 24px', height: '60px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #e9ebec', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          position: 'sticky', top: 0, zIndex: 50
        }}>
          <h6 className="mb-0 text-muted fw-normal">{currentLabel}</h6>

          {/* Right side — user profile */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={(e) => { e.stopPropagation(); setShowProfileDropdown(p => !p) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                cursor: 'pointer', padding: '6px 10px', borderRadius: '8px',
                transition: 'background 0.15s',
                background: showProfileDropdown ? '#f3f3f9' : 'transparent'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f3f3f9'}
              onMouseLeave={e => { if (!showProfileDropdown) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#364574', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700
              }}>
                {adminUser?.full_name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', lineHeight: 1.2 }}>
                  {adminUser?.full_name}
                </div>
                <div style={{ fontSize: '11px', color: '#6c757d', lineHeight: 1.2 }}>
                  {adminUser?.user_groups?.name || 'No Group'}
                </div>
              </div>
              <span style={{ color: '#6c757d', fontSize: '12px', marginLeft: '2px' }}>▾</span>
            </div>

            {/* Dropdown */}
            {showProfileDropdown && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', top: '48px', right: 0,
                  background: '#fff', borderRadius: '10px', minWidth: '200px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 200,
                  border: '1px solid #e9ebec', overflow: 'hidden'
                }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e9ebec', background: '#f8f9fa' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{adminUser?.full_name}</div>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>@{adminUser?.username}</div>
                  <div style={{ fontSize: '11px', color: '#0ab39c', marginTop: '2px' }}>{adminUser?.user_groups?.name}</div>
                </div>
                <div
                  onClick={() => { setShowProfileDropdown(false); router.push('/users') }}
                  style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  ⚙️ Settings
                </div>
                <div
                  onClick={handleLogout}
                  style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#e63946', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #e9ebec' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  🚪 Logout
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}