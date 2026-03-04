'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ALL_MENU_ITEMS = [
  { label: 'Dashboard',     href: '/dashboard',    icon: 'bi-speedometer2',     module: 'dashboard' },
  { label: 'Mumineen',      href: '/mumineen',     icon: 'bi-people',           module: 'mumineen' },
  { label: 'Thaali',        href: '/thaali',       icon: 'bi-cup-hot',          module: 'thaali' },
  { label: 'Distribution',  href: '/distribution', icon: 'bi-box-seam',         module: 'distribution' },
  { label: 'Distributors',  href: '/distributors', icon: 'bi-truck',            module: 'distributors' },
  { label: 'Sectors',       href: '/sectors',      icon: 'bi-map',              module: 'sectors' },
  { label: 'Takhmeem',      href: '/takhmeen',     icon: 'bi-clipboard-check',  module: 'takhmeem' },
  { label: 'Calendar',      href: '/calendar',     icon: 'bi-calendar3',        module: 'calendar' },
  { label: 'Users',         href: '/users',        icon: 'bi-shield-lock',      module: 'users' },
  { label: 'Settings',      href: '/settings',     icon: 'bi-gear',             module: 'settings' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    const handleClick = () => setShowProfileDropdown(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*, user_groups(name)')
      .eq('auth_id', user.id)
      .single()

    if (!adminData) { await supabase.auth.signOut(); router.push('/login'); return }

    if (adminData.status !== 'active') {
      await supabase.auth.signOut()
      router.push('/login?error=inactive')
      return
    }

    setAdminUser(adminData)

    if (adminData.user_group_id) {
      const { data: permsData } = await supabase
        .from('permissions')
        .select('module, can_view')
        .eq('user_group_id', adminData.user_group_id)

      const perms = permsData || []
      setPermissions(perms)
      const allowed = perms.filter(p => p.can_view).map(p => p.module)
      // Always show settings for active admins
      setMenuItems(ALL_MENU_ITEMS.filter(m => allowed.includes(m.module) || m.module === 'settings'))
    } else {
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

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/fmb-logo.svg" alt="FMB" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 900, lineHeight: 1.5 }}>Faiz-ul-Mawaid-il-Burhaniyah</div>
            <div style={{ color: '#ffbf69', fontSize: '11px', fontWeight: 500 }}>FMB Portal</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="d-lg-none"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '22px', cursor: 'pointer', padding: '0 0 0 4px', lineHeight: 1, flexShrink: 0 }}
          >
            <i className="bi bi-x" />
          </button>
        </div>
      </div>

      {/* Menu items */}
      <nav style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
        {menuItems.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

          return (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '11px 16px', cursor: 'pointer',
                background: isActive ? 'rgba(255,191,105,0.15)' : 'transparent',
                borderLeft: isActive ? '3px solid #ffbf69' : '3px solid transparent',
                color: isActive ? '#ffbf69' : 'rgba(255,255,255,0.65)',
                fontSize: '14px', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`bi ${item.icon}`} style={{ fontSize: '16px', width: '18px' }} />
              <span style={{ flex: 1 }}>{item.label}</span>
            </div>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#ffbf69', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#364574', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
            {adminUser?.full_name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminUser?.full_name}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{adminUser?.user_groups?.name || 'No Group'}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="btn btn-sm w-100" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontSize: '13px' }}>
          <i className="bi bi-box-arrow-right me-2" />Logout
        </button>
      </div>
    </div>
  )

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      <style>{`
        @media (min-width: 992px) {
          .fmb-sidebar-desktop { display: flex !important; }
          .fmb-main { margin-left: 240px !important; }
          .fmb-hamburger { display: none !important; }
          .fmb-mobile-overlay, .fmb-sidebar-drawer { display: none !important; }
        }
        @media (max-width: 991.98px) {
          .fmb-sidebar-desktop { display: none !important; }
          .fmb-main { margin-left: 0 !important; }
          .fmb-hamburger { display: flex !important; }
        }
        .fmb-sidebar-drawer {
          position: fixed; top: 0; left: 0;
          width: 270px; height: 100vh;
          background: #364574; z-index: 1050;
          transform: translateX(-100%);
          transition: transform 0.27s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex; flex-direction: column;
          will-change: transform;
        }
        .fmb-sidebar-drawer.open { transform: translateX(0); }
        .fmb-mobile-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.5); z-index: 1040;
          opacity: 0; pointer-events: none;
          transition: opacity 0.27s ease;
        }
        .fmb-mobile-overlay.open { opacity: 1; pointer-events: auto; }
        @media (max-width: 575.98px) {
          .fmb-page-content { padding: 14px !important; }
          .fmb-topbar { padding: 0 14px !important; }
        }
        .fmb-page-content, .fmb-page-content * { box-sizing: border-box; }
        .fmb-page-content { max-width: 100%; overflow-x: hidden; }
        @media (max-width: 767.98px) {
          .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f3f9' }}>

        {/* Desktop sidebar */}
        <div className="fmb-sidebar-desktop" style={{ width: '240px', background: '#364574', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100 }}>
          <SidebarContent />
        </div>

        {/* Mobile overlay */}
        <div className={`fmb-mobile-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

        {/* Mobile drawer */}
        <div className={`fmb-sidebar-drawer${sidebarOpen ? ' open' : ''}`}>
          <SidebarContent />
        </div>

        {/* Main */}
        <div className="fmb-main" style={{ flex: 1, overflow: 'auto', minHeight: '100vh', overflowX: 'hidden' }}>

          {/* Topbar */}
          <div className="fmb-topbar" style={{ background: '#fff', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e9ebec', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 50 }}>

            <button className="fmb-hamburger" onClick={() => setSidebarOpen(true)} style={{ display: 'none', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: '6px', color: '#364574' }}>
              <i className="bi bi-list" style={{ fontSize: '24px' }} />
            </button>

            <div className="d-lg-none" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#364574', marginLeft: '4px' }}>FMB Portal</span>
            </div>

            {/* Profile dropdown */}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <div
                onClick={(e) => { e.stopPropagation(); setShowProfileDropdown(p => !p) }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', background: showProfileDropdown ? '#f3f3f9' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f3f3f9'}
                onMouseLeave={e => { if (!showProfileDropdown) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#364574', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffbf69', fontSize: '13px', fontWeight: 700 }}>
                  {adminUser?.full_name?.charAt(0).toUpperCase()}
                </div>
                <div className="d-none d-sm-block">
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', lineHeight: 1.2 }}>{adminUser?.full_name}</div>
                  <div style={{ fontSize: '11px', color: '#6c757d', lineHeight: 1.2 }}>{adminUser?.user_groups?.name || 'No Group'}</div>
                </div>
                <i className="bi bi-chevron-down d-none d-sm-inline" style={{ color: '#6c757d', fontSize: '11px' }} />
              </div>

              {showProfileDropdown && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '48px', right: 0, background: '#fff', borderRadius: '10px', minWidth: '200px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 200, border: '1px solid #e9ebec', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e9ebec', background: '#f8f9fa' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{adminUser?.full_name}</div>
                    <div style={{ fontSize: '12px', color: '#6c757d' }}>@{adminUser?.username}</div>
                    <div style={{ fontSize: '11px', color: '#0ab39c', marginTop: '2px' }}>{adminUser?.user_groups?.name}</div>
                  </div>
                  <div onClick={() => { setShowProfileDropdown(false); router.push('/settings') }} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <i className="bi bi-gear" /> Settings
                  </div>
                  <div onClick={handleLogout} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#e63946', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #e9ebec' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <i className="bi bi-box-arrow-right" /> Logout
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="fmb-page-content" style={{ padding: '24px' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}