import { Navigate, Outlet } from 'react-router-dom'

function RequireAuth() {
  const token = localStorage.getItem('authToken')
  const role = localStorage.getItem('userRole')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (role !== 'cashier' && role !== 'admin') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default RequireAuth
