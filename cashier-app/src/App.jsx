import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import LoginPage from './pages/LoginPage'
import SummaryPage from './pages/SummaryPage'
import TopupPage from './pages/TopupPage'
import TravelPassPage from './pages/TravelPassPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/topup" element={<TopupPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/travel-pass" element={<TravelPassPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
