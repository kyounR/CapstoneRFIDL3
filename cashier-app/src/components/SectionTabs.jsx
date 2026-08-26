import { Link, useLocation } from 'react-router-dom'

// Page-level Active/History sub-navigation, distinct from the main header nav.
function SectionTabs({ activePath, historyPath }) {
  const location = useLocation()
  const isHistory = location.pathname === historyPath || location.pathname.startsWith(`${historyPath}/`)

  const tabStyle = (selected) => ({
    padding: '6px 16px',
    borderRadius: 'var(--radius-pill)',
    background: selected ? 'var(--accent)' : 'transparent',
    color: selected ? '#14171B' : 'var(--text-primary)',
    fontWeight: selected ? 600 : 400,
    textDecoration: 'none',
  })

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: '4px',
        padding: '4px',
        marginBottom: '20px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
      }}
    >
      <Link to={activePath} style={tabStyle(!isHistory)}>Active</Link>
      <Link to={historyPath} style={tabStyle(isHistory)}>History</Link>
    </div>
  )
}

export default SectionTabs
