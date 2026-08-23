import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'

function RequireAuth() {
  const navigate = useNavigate()
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

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #ccc', fontFamily: 'sans-serif' }}>
        <span>Logged in as {username} ({role})</span>
        <div>
          {role === 'admin' ? <Link to="/admin/dashboard" style={{ marginRight: '12px' }}>Admin Dashboard</Link> : null}
          {role === 'admin' ? <Link to="/admin/reports" style={{ marginRight: '12px' }}>Reports</Link> : null}
          <button type="button" onClick={handleLogout} style={{ padding: '6px 10px' }}>
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </>
  )
}

export default RequireAuth
