import { Navigate, Outlet } from 'react-router-dom'

function RequireAdmin() {
  const role = localStorage.getItem('userRole')

  if (role !== 'admin') {
    return <Navigate to="/topup" replace />
  }

  return <Outlet />
}

export default RequireAdmin
