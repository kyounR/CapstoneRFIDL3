import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAdmin from './components/RequireAdmin'
import RequireAuth from './components/RequireAuth'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminManagementPage from './pages/AdminManagementPage'
import AdminReportPage from './pages/AdminReportPage'
import BoardingStatusPage from './pages/BoardingStatusPage'
import DailyRemittancePage from './pages/DailyRemittancePage'
import DailyRemittanceHistoryPage from './pages/DailyRemittanceHistoryPage'
import LoginPage from './pages/LoginPage'
import PublicTapDisplayPage from './pages/PublicTapDisplayPage'
import SummaryPage from './pages/SummaryPage'
import TapFeedPage from './pages/TapFeedPage'
import TopupPage from './pages/TopupPage'
import TravelPassPage from './pages/TravelPassPage'
import TravelPassHistoryPage from './pages/TravelPassHistoryPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/display" element={<PublicTapDisplayPage />} />
      <Route path="/board" element={<BoardingStatusPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/topup" element={<TopupPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/travel-pass" element={<TravelPassPage />} />
        <Route path="/travel-pass/history" element={<TravelPassHistoryPage />} />
        <Route path="/remittance" element={<DailyRemittancePage />} />
        <Route path="/remittance/history" element={<DailyRemittanceHistoryPage />} />
        <Route path="/tap-feed" element={<TapFeedPage />} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/manage" element={<AdminManagementPage />} />
          <Route path="/admin/reports" element={<AdminReportPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
