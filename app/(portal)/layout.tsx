'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Theme = 'light' | 'dark' | 'system'

const ALL_MENU_ITEMS = [
  { label: 'Dashboard',          href: '/dashboard',         icon: 'bi-speedometer2',    module: 'dashboard' },
  { label: 'Mumineen',           href: '/mumineen',          icon: 'bi-people',          module: 'mumineen' },
  { label: 'Address Requests',   href: '/address-requests',  icon: 'bi-geo-alt-fill',    module: 'address_requests' },
  {
    label: 'Thaali', href: '/thaali', icon: 'bi-cup-hot', module: 'thaali',
    children: [
      { label: 'Registrations',  href: '/thaali',                icon: 'bi-list-ul'      },
      { label: 'Customizations', href: '/thaali/customizations', icon: 'bi-sliders'      },
      { label: 'Stop Requests',  href: '/thaali/stop-requests',  icon: 'bi-slash-circle' },
    ],
  },
  { label: 'Distribution',  href: '/distribution', icon: 'bi-box-seam',         module: 'distribution' },
  { label: 'Distributors',  href: '/distributors', icon: 'bi-truck',            module: 'distributors' },
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

const applyTheme = (t: Theme) => {
  const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light')
}
const saveTheme = (t: Theme) => { localStorage.setItem('fmb-theme', t); applyTheme(t) }
const loadTheme = (): Theme => (localStorage.getItem('fmb-theme') as Theme) || 'light'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [menuItems, setMenuItems] = useState(ALL_MENU_ITEMS)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [theme, setThemeState] = useState<Theme>('system')
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingAddressCount, setPendingAddressCount] = useState(0)

  useEffect(() => {
    const saved = loadTheme()
    setThemeState(saved)
    applyTheme(saved)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { if (loadTheme() === 'system') applyTheme('system') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setTheme = (t: Theme) => { setThemeState(t); saveTheme(t) }

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) setShowThemeMenu(false)
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) setShowProfileDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
    if (adminData.status !== 'active') { await supabase.auth.signOut(); router.push('/login?error=inactive'); return }

    setAdminUser(adminData)
    const groupName = adminData.user_groups?.name?.toLowerCase() || ''
    setIsAdmin(groupName === 'super admin' || groupName === 'admin' || groupName === 'super_admin')

    if (adminData.user_group_id) {
      const { data: permsData } = await supabase
        .from('permissions')
        .select('module, can_view')
        .eq('user_group_id', adminData.user_group_id)
      const perms = permsData || []
      setPermissions(perms)
      const allowed = perms.filter(p => p.can_view).map(p => p.module)
      setMenuItems(ALL_MENU_ITEMS.filter(m =>
        allowed.includes(m.module) || m.module === 'settings' || m.module === 'address_requests'
      ))
    } else {
      setMenuItems(ALL_MENU_ITEMS.filter(m => m.module === 'dashboard'))
    }

    const { count } = await supabase
      .from('address_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingAddressCount(count || 0)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const themeOptions: { val: Theme; icon: string; label: string }[] = [
    { val: 'light',  icon: 'bi-sun-fill',    label: 'Light'  },
    { val: 'dark',   icon: 'bi-moon-fill',   label: 'Dark'   },
    { val: 'system', icon: 'bi-circle-half', label: 'System' },
  ]
  const currentOpt = themeOptions.find(o => o.val === theme) || themeOptions[2]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bs-body-bg)' }}>
        <div className="spinner-border text-primary" />
      </div>
    )
  }

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Logo */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            {/* Logo image — mix-blend-mode:screen removes black background on dark sidebar */}
            <img
              src="/fmb-logo.png"
              alt="Faiz ul Mawaid il Burhaniyah"
              style={{ width: '100%', maxWidth: '180px', height: 'auto', display: 'block', margin: '0 auto 8px', mixBlendMode: 'screen' }}
            />
            <div style={{ color: '#fff', fontSize: '11px', fontWeight: 700, lineHeight: 1.4 }}>Faiz ul Mawaid il Burhaniyah</div>
            <div style={{ color: '#ffbf69', fontSize: '10px', fontWeight: 500, marginTop: 2 }}>FMB Portal</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="d-lg-none"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '20px', cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0, marginLeft: 4 }}
          >
            <i className="bi bi-x" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
        {menuItems.map((item) => {
          const hasChildren = !!(item as any).children
          const children = (item as any).children as { label: string; href: string; icon: string }[] | undefined

          const isGroupActive = hasChildren
            ? children!.some(c => {
                // FIX: for child whose href equals the group href (Registrations = /thaali),
                // use exact match so sub-pages don't falsely activate it
                if (c.href === item.href) return pathname === c.href
                return pathname === c.href || pathname.startsWith(c.href + '/')
              })
            : (item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href))

          if (hasChildren) {
            return (
              <div key={item.href}>
                <div
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '11px 16px', cursor: 'pointer',
                    background: isGroupActive ? 'rgba(255,191,105,0.15)' : 'transparent',
                    borderLeft: isGroupActive ? '3px solid #ffbf69' : '3px solid transparent',
                    color: isGroupActive ? '#ffbf69' : 'rgba(255,255,255,0.65)',
                    fontSize: '14px', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { if (!isGroupActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                  onMouseLeave={e => { if (!isGroupActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <i className={`bi ${item.icon}`} style={{ fontSize: '16px', width: '18px' }} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <i className={`bi bi-chevron-${isGroupActive ? 'down' : 'right'}`} style={{ fontSize: '11px', opacity: 0.6 }} />
                </div>

                {isGroupActive && children!.map(child => {
                  // FIX: Registrations href = /thaali (same as parent) → exact match only
                  // Other children → exact OR startsWith child href
                  const isChildActive = child.href === item.href
                    ? pathname === child.href
                    : pathname === child.href || pathname.startsWith(child.href + '/')

                  return (
                    <div
                      key={child.href}
                      onClick={() => router.push(child.href)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 16px 9px 40px', cursor: 'pointer',
                        background: isChildActive ? 'rgba(255,191,105,0.1)' : 'transparent',
                        borderLeft: isChildActive ? '3px solid rgba(255,191,105,0.6)' : '3px solid transparent',
                        color: isChildActive ? '#ffbf69' : 'rgba(255,255,255,0.5)',
                        fontSize: '13px', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isChildActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { if (!isChildActive) e.currentTarget.style.background = 'transparent' }}
                    >
                      <i className={`bi ${child.icon}`} style={{ fontSize: '14px', width: '16px' }} />
                      <span>{child.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          }

          // Flat item
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
              {item.href === '/address-requests' && pendingAddressCount > 0 && (
                <span style={{
                  background: '#e63946', color: '#fff', fontSize: '10px', fontWeight: 700,
                  borderRadius: '10px', padding: '1px 6px', lineHeight: '16px',
                  minWidth: '18px', textAlign: 'center',
                }}>
                  {pendingAddressCount}
                </span>
              )}
            </div>
          )
        })}
      </nav>

      {/* User info */}
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
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1040;
          opacity: 0; pointer-events: none; transition: opacity 0.27s ease;
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
        .fmb-theme-opt:hover { background: var(--bs-secondary-bg) !important; }
      `}</style>

      <script dangerouslySetInnerHTML={{ __html: `window.__fmbIsAdmin = ${isAdmin}` }} />

      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bs-tertiary-bg)' }}>

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
          <div className="fmb-topbar" style={{
            background: 'var(--bs-body-bg)', padding: '0 24px', height: '60px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--bs-border-color)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            position: 'sticky', top: 0, zIndex: 50,
          }}>

            <button className="fmb-hamburger" onClick={() => setSidebarOpen(true)} style={{ display: 'none', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: '6px', color: '#364574' }}>
              <i className="bi bi-list" style={{ fontSize: '24px' }} />
            </button>

            <div className="d-lg-none" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#364574', marginLeft: '4px' }}>FMB Portal</span>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>

              {/* Theme toggle */}
              <div ref={themeMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowThemeMenu(p => !p)}
                  style={{
                    background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)',
                    borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    color: 'var(--bs-body-color)', fontSize: '13px', transition: 'all 0.15s',
                  }}
                >
                  <i className={`bi ${currentOpt.icon}`} style={{ fontSize: '14px', color: '#ffbf69' }} />
                  <span className="d-none d-sm-inline" style={{ fontSize: '12px', fontWeight: 500 }}>{currentOpt.label}</span>
                  <i className="bi bi-chevron-down" style={{ fontSize: '10px', opacity: 0.5 }} />
                </button>

                {showThemeMenu && (
                  <div style={{
                    position: 'absolute', top: '42px', right: 0,
                    background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)',
                    borderRadius: '10px', minWidth: '145px',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.13)', zIndex: 300, overflow: 'hidden',
                  }}>
                    {themeOptions.map(opt => (
                      <div
                        key={opt.val}
                        className="fmb-theme-opt"
                        onClick={() => { setTheme(opt.val); setShowThemeMenu(false) }}
                        style={{
                          padding: '9px 14px', cursor: 'pointer', fontSize: '13px',
                          display: 'flex', alignItems: 'center', gap: '10px',
                          background: theme === opt.val ? 'var(--bs-secondary-bg)' : 'transparent',
                          color: 'var(--bs-body-color)', fontWeight: theme === opt.val ? 600 : 400,
                          transition: 'background 0.12s',
                        }}
                      >
                        <i className={`bi ${opt.icon}`} style={{ color: '#ffbf69', width: '16px', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{opt.label}</span>
                        {theme === opt.val && <i className="bi bi-check2" style={{ color: '#364574' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Profile dropdown */}
              <div ref={profileMenuRef} style={{ position: 'relative' }}>
                <div
                  onClick={() => setShowProfileDropdown(p => !p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    cursor: 'pointer', padding: '5px 10px', borderRadius: '8px',
                    background: showProfileDropdown ? 'var(--bs-secondary-bg)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!showProfileDropdown) e.currentTarget.style.background = 'var(--bs-secondary-bg)' }}
                  onMouseLeave={e => { if (!showProfileDropdown) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#364574', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffbf69', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                    {adminUser?.full_name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="d-none d-sm-block">
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bs-body-color)', lineHeight: 1.2 }}>{adminUser?.full_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--bs-secondary-color)', lineHeight: 1.2 }}>{adminUser?.user_groups?.name || 'No Group'}</div>
                  </div>
                  <i className="bi bi-chevron-down d-none d-sm-inline" style={{ color: 'var(--bs-secondary-color)', fontSize: '11px' }} />
                </div>

                {showProfileDropdown && (
                  <div style={{
                    position: 'absolute', top: '48px', right: 0,
                    background: 'var(--bs-body-bg)', borderRadius: '10px', minWidth: '200px',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.13)', zIndex: 200,
                    border: '1px solid var(--bs-border-color)', overflow: 'hidden',
                  }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bs-border-color)', background: 'var(--bs-secondary-bg)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bs-body-color)' }}>{adminUser?.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}>@{adminUser?.username}</div>
                      <div style={{ fontSize: '11px', color: '#0ab39c', marginTop: '2px' }}>{adminUser?.user_groups?.name}</div>
                    </div>
                    <div
                      onClick={() => { setShowProfileDropdown(false); router.push('/settings') }}
                      style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--bs-body-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bs-secondary-bg)'}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <i className="bi bi-gear" /> Settings
                    </div>
                    <div
                      onClick={handleLogout}
                      style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#e63946', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--bs-border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,57,70,0.07)'}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <i className="bi bi-box-arrow-right" /> Logout
                    </div>
                  </div>
                )}
              </div>
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