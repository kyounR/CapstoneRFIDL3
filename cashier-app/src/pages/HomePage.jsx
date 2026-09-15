import { Link } from 'react-router-dom'

const navigationItems = [
  { label: 'Top-up', path: '/topup', description: 'Add or load fare balance' },
  { label: 'Travel Pass', path: '/travel-pass', description: 'Tally passengers and manage boarding' },
  { label: 'Remittance', path: '/remittance', description: 'Record rounds and submit remittance' },
  { label: 'Tap Feed', path: '/tap-feed', description: 'Check recent card taps' },
]

const adminNavigationItems = [
  { label: 'Admin Dashboard', path: '/admin/dashboard', description: 'Review operational totals' },
  { label: 'Reports', path: '/admin/reports', description: 'Generate and export reports' },
  { label: 'Admin Management', path: '/admin/manage', description: 'Manage records and settings' },
  { label: 'Audit Log', path: '/admin/manage', description: 'Review administrative activity' },
]

function HomePage() {
  const role = localStorage.getItem('userRole')
  const username = localStorage.getItem('username')
  const fullName = localStorage.getItem('fullName')
  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening'

  const allNavigationItems = role === 'admin' ? [...navigationItems, ...adminNavigationItems] : navigationItems

  return (
    <main style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
      <section style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0 }}>{greeting}, {fullName || username}</h1>
      </section>

      <section aria-labelledby="home-navigation-heading">
        <h2 id="home-navigation-heading">Quick Actions</h2>
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
