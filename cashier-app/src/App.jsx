import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAdmin from './components/RequireAdmin'
import RequireAuth from './components/RequireAuth'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminReportPage from './pages/AdminReportPage'
import DailyRemittancePage from './pages/DailyRemittancePage'
import LoginPage from './pages/LoginPage'
import SummaryPage from './pages/SummaryPage'
import TopupPage from './pages/TopupPage'
import TravelPassPage from './pages/TravelPassPage'
import TravelPassHistoryPage from './pages/TravelPassHistoryPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/topup" element={<TopupPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/travel-pass" element={<TravelPassPage />} />
        <Route path="/travel-pass/history" element={<TravelPassHistoryPage />} />
        <Route path="/remittance" element={<DailyRemittancePage />} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/reports" element={<AdminReportPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
