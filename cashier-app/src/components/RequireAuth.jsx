import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'

function RequireAuth() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('authToken')
  const role = localStorage.getItem('userRole')
  const username = localStorage.getItem('username')

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
    navigate('/login')
  }

  const navItems = [
    { label: 'Top-up', path: '/topup' },
    { label: 'Travel Pass', path: '/travel-pass' },
    { label: 'Remittance', path: '/remittance' },
    { label: 'Summary', path: '/summary' },
    { label: 'Tap Feed', path: '/tap-feed' },
  ]

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '12px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-body)' }}>
        <span>Logged in as {username} ({role})</span>
        <nav aria-label="Primary navigation" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} style={{ color: isActive(item.path) ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isActive(item.path) ? 600 : 400, textDecoration: isActive(item.path) ? 'underline' : 'none' }}>
              {item.label}
            </Link>
          ))}
          {role === 'admin' ? <>
            <span aria-hidden="true" style={{ color: 'var(--border)' }}>|</span>
            <Link to="/admin/dashboard" style={{ color: isActive('/admin/dashboard') ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isActive('/admin/dashboard') ? 600 : 400, textDecoration: isActive('/admin/dashboard') ? 'underline' : 'none' }}>Admin Dashboard</Link>
            <Link to="/admin/reports" style={{ color: isActive('/admin/reports') ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isActive('/admin/reports') ? 600 : 400, textDecoration: isActive('/admin/reports') ? 'underline' : 'none' }}>Reports</Link>
          </> : null}
          <button type="button" onClick={handleLogout} className="btn-secondary">
            Log out
          </button>
        </nav>
      </header>
      <Outlet />
    </>
  )
}

export default RequireAuth
