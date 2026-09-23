import { useEffect, useState } from 'react'
import api from '../api/client'
import BoardingCodeBadge from '../components/BoardingCodeBadge'

function BoardingStatusPage() {
  const [status, setStatus] = useState({ boarding: [], recently_departed: [] })

  useEffect(() => {
    let isMounted = true

    async function fetchStatus() {
      try {
        const response = await api.get('boarding-status/')
        if (isMounted) {
          setStatus(response.data)
        }
      } catch {
        // Keep the current board visible during transient network failures.
      }
    }

    fetchStatus()
    const intervalId = setInterval(fetchStatus, 5000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  const boarding = status?.boarding || []
  const recentlyDeparted = status?.recently_departed || []

  return (
    <main
      style={{
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: 'clamp(16px, 2.5vw, 32px)',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ flex: '0 0 auto' }}>
        <h1 style={{ margin: '0 0 20px', fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 3.5vw, 3.5rem)', letterSpacing: '0' }}>
          Boarding Status
        </h1>
      </header>

      <section style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
        {boarding.length === 0 ? (
          <section
            style={{
              padding: 'clamp(24px, 4vw, 48px)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 2.5vw, 2.5rem)',
              textAlign: 'center',
            }}
          >
            No vehicles currently boarding
          </section>
        ) : (
          <div style={{ display: 'grid', gap: '20px', overflow: 'hidden' }}>
            {boarding.map((line) => (
              <section key={line.line_name}>
                <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 2.5vw, 2.5rem)' }}>
                  {line.line_name}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                  {line.vehicles.map((vehicle, index) => (
                    <article
                      key={vehicle.manifest_trip_id}
                      style={{
                        padding: vehicle.is_primary ? '20px 24px' : '16px 20px',
                        background: vehicle.is_primary ? 'var(--accent)' : 'var(--surface)',
                        border: `${vehicle.is_primary ? '3px' : '2px'} solid ${vehicle.is_primary ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        boxShadow: vehicle.is_primary ? '0 0 0 3px rgba(242, 169, 59, 0.22)' : 'none',
                        opacity: vehicle.is_primary ? 1 : 0.68,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          color: vehicle.is_primary ? '#14171B' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-display)',
                          fontSize: vehicle.is_primary ? 'clamp(1.3rem, 1.8vw, 1.8rem)' : 'clamp(0.9rem, 1.1vw, 1.1rem)',
                          fontWeight: 600,
                        }}
                      >
                        {vehicle.is_primary ? 'Now Boarding' : `Next Vehicle #${index + 1}`}
                      </p>
                      <p className="numeric" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '12px 0', color: vehicle.is_primary ? '#14171B' : 'var(--text-primary)', fontSize: vehicle.is_primary ? 'clamp(2.5rem, 4vw, 4rem)' : 'clamp(1.5rem, 2.2vw, 2.2rem)', fontWeight: 600 }}>
                        {vehicle.plate_number}
                        <BoardingCodeBadge code={{ color: vehicle.color, shape: vehicle.shape, number: vehicle.number }} size={vehicle.is_primary ? 64 : 40} />
                      </p>
                      <p className="numeric" style={{ margin: 0, color: vehicle.is_primary ? '#14171B' : 'var(--text-secondary)', fontSize: vehicle.is_primary ? 'clamp(1.3rem, 2vw, 1.8rem)' : 'clamp(0.85rem, 1vw, 1.1rem)' }}>
                        {vehicle.total_passengers} passengers
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {recentlyDeparted.length > 0 ? (
        <section style={{ flex: '0 0 auto', maxHeight: '14vh', overflow: 'hidden', marginTop: '16px', color: 'var(--text-secondary)' }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 1.5vw, 1.5rem)', fontWeight: 600 }}>
              Just Departed
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {recentlyDeparted.slice(0, 3).map((vehicle, index) => (
                <div
                  key={`${vehicle.plate_number}-${vehicle.departure_time}-${index}`}
                  style={{
                    padding: '12px 16px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 'clamp(0.8rem, 1vw, 1rem)',
                  }}
                >
                  <span className="numeric">{vehicle.plate_number}</span> · {vehicle.line_name} · {vehicle.departure_time}
                </div>
              ))}
            </div>
        </section>
      ) : null}
    </main>
  )
}

export default BoardingStatusPage
