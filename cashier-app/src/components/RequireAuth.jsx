import { useEffect, useState } from 'react'
import {
  Activity,
  Banknote,
  BarChart3,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Ticket,
  Wallet,
} from 'lucide-react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import CalPassWordmark from './CalPassWordmark'
import RfidReaderStatus from './RfidReaderStatus'

function RequireAuth() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('authToken')
  const role = localStorage.getItem('userRole')
  const username = localStorage.getItem('username')
  const fullName = localStorage.getItem('fullName')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === 'true',
  )

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (role !== 'cashier' && role !== 'admin') {
    return <Navigate to="/login" replace />
  }

  function handleLogout() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('userRole')
    localStorage.removeItem('username')
    localStorage.removeItem('fullName')
    navigate('/login')
  }

  const navItems = [
    { label: 'Home', path: '/home', icon: Home },
    { label: 'Top-up', path: '/topup', icon: Wallet },
    { label: 'Travel Pass', path: '/travel-pass', icon: Ticket },
    { label: 'Remittance', path: '/remittance', icon: Banknote },
    { label: 'Summary', path: '/summary', icon: BarChart3 },
    { label: 'Tap Feed', path: '/tap-feed', icon: Activity },
    { label: 'Transaction History', path: '/transaction-history', icon: Receipt },
  ]

  const adminNavItems = [
    { label: 'Admin Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Manage', path: '/admin/manage', icon: Settings },
    { label: 'Reports', path: '/admin/reports', icon: FileText },
  ]

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  const sidebarWidth = isSidebarCollapsed ? '88px' : '264px'

  function renderNavItem(item) {
    const active = isActive(item.path)
    const Icon = item.icon

    return (
      <Link
        key={item.path}
        to={item.path}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
          gap: '12px',
          minHeight: '44px',
          padding: isSidebarCollapsed ? '10px' : '10px 12px',
          borderRadius: 'var(--radius)',
          background: active ? 'var(--surface-hover)' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text-primary)',
          fontWeight: active ? 600 : 400,
          textDecoration: 'none',
        }}
      >
        <Icon size={20} aria-hidden="true" />
        {!isSidebarCollapsed ? <span>{item.label}</span> : null}
      </Link>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: '100vh' }}>
      <aside
        aria-label="Sidebar"
        style={{
          display: 'flex',
          flex: `0 0 ${sidebarWidth}`,
          flexDirection: 'column',
          gap: '16px',
          minHeight: '100vh',
          padding: isSidebarCollapsed ? '16px 8px' : '16px',
          overflowX: 'hidden',
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border)',
          fontFamily: 'var(--font-body)',
          transition: 'flex-basis 180ms ease, padding 180ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: isSidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <CalPassWordmark compact iconOnly={isSidebarCollapsed} />
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!isSidebarCollapsed ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Logged in as {fullName || username} ({role})
          </div>
        ) : null}

        <RfidReaderStatus collapsed={isSidebarCollapsed} />

        <div style={{ borderTop: '1px solid var(--border)' }} />

        <nav aria-label="Primary navigation" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(renderNavItem)}
        </nav>

        {role === 'admin' ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderTop: '1px solid var(--border)',
                paddingTop: '14px',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {!isSidebarCollapsed ? 'Admin' : null}
            </div>
            <nav aria-label="Admin navigation" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {adminNavItems.map(renderNavItem)}
            </nav>
          </>
        ) : null}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          aria-label="Log out"
          className="btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
            gap: '12px',
            padding: isSidebarCollapsed ? '10px' : '10px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          <LogOut size={20} aria-hidden="true" />
          {!isSidebarCollapsed ? <span>Log out</span> : null}
        </button>
      </aside>

      <main style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}

export default RequireAuth
