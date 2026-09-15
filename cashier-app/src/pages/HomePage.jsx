import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

function getToday() {
  const currentDate = new Date()
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const navigationItems = [
  { label: 'Top-up', path: '/topup', description: 'Add value to a passenger card.' },
  { label: 'Travel Pass', path: '/travel-pass', description: 'Manage active trips and boarding.' },
  { label: 'Remittance', path: '/remittance', description: 'Record daily dispatch rounds and fees.' },
  { label: 'Tap Feed', path: '/tap-feed', description: 'Monitor recent RFID activity.' },
]

const adminNavigationItems = [
  { label: 'Admin Dashboard', path: '/admin/dashboard', description: 'Review operational performance.' },
  { label: 'Reports', path: '/admin/reports', description: 'Generate and export reports.' },
  { label: 'Admin Management', path: '/admin/manage', description: 'Manage system records and settings.' },
  { label: 'Audit Log', path: '/admin/manage', description: 'Review administrative activity.' },
]

function StatCard({ label, value }) {
  return (
    <div className="card">
      <strong>{label}</strong>
      <p className="numeric" style={{ margin: '12px 0 0', fontSize: '1.6rem' }}>{value}</p>
    </div>
  )
}

function HomePage() {
  const role = localStorage.getItem('userRole')
  const username = localStorage.getItem('username')
  const fullName = localStorage.getItem('fullName')
  const today = getToday()
  const [summary, setSummary] = useState(null)
  const [adminDashboard, setAdminDashboard] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadHomeData() {
      setIsLoading(true)
      setError('')
      try {
        const requests = [
          api.get('reports/', { params: { date: today } }),
        ]
        if (role === 'admin') {
          requests.push(api.get('admin/dashboard/', { params: { start_date: today, end_date: today } }))
        }

        const responses = await Promise.all(requests)
        if (isMounted) {
          setSummary(responses[0].data)
          setAdminDashboard(role === 'admin' ? responses[1].data : null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.error || 'Could not load home statistics.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadHomeData()
    return () => {
      isMounted = false
    }
  }, [role, today])

  const allNavigationItems = role === 'admin' ? [...navigationItems, ...adminNavigationItems] : navigationItems

  return (
    <main style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
      <section style={{ marginBottom: '28px' }}>
        <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>{new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <h1 style={{ margin: 0 }}>Welcome, {fullName || username}</h1>
      </section>

      {error ? (
        <p>
          <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
          {error}
        </p>
      ) : null}

      <section aria-labelledby="home-stats-heading" style={{ marginBottom: '32px' }}>
        <h2 id="home-stats-heading">Today at a glance</h2>
        {isLoading ? <p>Loading statistics...</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <StatCard label="Total Top-up Amount" value={summary?.total_topups_amount ?? '0.00'} />
            <StatCard label="Fare Collected (RFID)" value={summary?.total_fare_amount ?? '0.00'} />
            <StatCard label="Cash Fares Collected" value={summary?.cash_fare_total_amount ?? '0.00'} />
            {role === 'admin' ? <>
              <StatCard label="Total Passengers" value={adminDashboard?.total_passengers ?? 0} />
              <StatCard label="Total Income" value={adminDashboard?.total_income ?? '0.00'} />
            </> : null}
          </div>
        )}
      </section>

      <section aria-labelledby="home-navigation-heading">
        <h2 id="home-navigation-heading">Quick navigation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {allNavigationItems.map((item) => (
            <Link key={`${item.label}-${item.path}`} to={item.path} className="card" style={{ display: 'block', color: 'var(--text-primary)', textDecoration: 'none' }}>
              <strong>{item.label}</strong>
              <p style={{ margin: '8px 0 16px', color: 'var(--text-secondary)' }}>{item.description}</p>
              <span className="btn-primary" style={{ display: 'inline-block' }}>Open</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}

export default HomePage
