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
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: 'clamp(28px, 5vw, 72px)',
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 48px', fontFamily: 'var(--font-display)', fontSize: 'clamp(4rem, 8vw, 7rem)', letterSpacing: '0' }}>
          Boarding Status
        </h1>

        {boarding.length === 0 ? (
          <section
            style={{
              padding: 'clamp(40px, 8vw, 96px)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.75rem, 5vw, 4.5rem)',
              textAlign: 'center',
            }}
          >
            No vehicles currently boarding
          </section>
        ) : (
          <div style={{ display: 'grid', gap: '36px' }}>
            {boarding.map((line) => (
              <section key={line.line_name}>
                <h2 style={{ margin: '0 0 20px', fontFamily: 'var(--font-display)', fontSize: 'clamp(2.75rem, 5vw, 4.5rem)' }}>
                  {line.line_name}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                  {line.vehicles.map((vehicle, index) => (
                    <article
                      key={vehicle.manifest_trip_id}
                      style={{
                        padding: vehicle.is_primary || index < 2 ? '32px' : '22px 26px',
                        background: vehicle.is_primary ? 'var(--accent)' : 'var(--surface)',
                        border: `${vehicle.is_primary ? '3px' : '2px'} solid ${vehicle.is_primary ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        boxShadow: vehicle.is_primary ? '0 0 0 3px rgba(242, 169, 59, 0.22)' : 'none',
                        opacity: vehicle.is_primary || index < 2 ? 1 : 0.68,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          color: vehicle.is_primary ? '#14171B' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-display)',
                          fontSize: vehicle.is_primary || index < 2 ? 'clamp(1.9rem, 3vw, 2.75rem)' : 'clamp(1.4rem, 2.2vw, 2rem)',
                          fontWeight: 600,
                        }}
                      >
                        {vehicle.is_primary ? 'Now Boarding' : `Next Vehicle #${index + 1}`}
                      </p>
                      <p className="numeric" style={{ display: 'flex', alignItems: 'center', gap: '18px', margin: '16px 0', color: vehicle.is_primary ? '#14171B' : 'var(--text-primary)', fontSize: vehicle.is_primary || index < 2 ? 'clamp(3.5rem, 6vw, 6rem)' : 'clamp(2.5rem, 4.5vw, 4.5rem)', fontWeight: 600 }}>
                        {vehicle.plate_number}
                        <BoardingCodeBadge code={{ color: vehicle.color, shape: vehicle.shape, number: vehicle.number }} size={vehicle.is_primary || index < 2 ? 96 : 72} />
                      </p>
                      <p className="numeric" style={{ margin: 0, color: vehicle.is_primary ? '#14171B' : 'var(--text-secondary)', fontSize: vehicle.is_primary || index < 2 ? 'clamp(1.7rem, 3vw, 2.5rem)' : 'clamp(1.35rem, 2.2vw, 2rem)' }}>
                        {vehicle.total_passengers} passengers
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {recentlyDeparted.length > 0 ? (
          <section style={{ marginTop: '56px', color: 'var(--text-secondary)' }}>
            <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', fontWeight: 600 }}>
              Just Departed
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {recentlyDeparted.map((vehicle, index) => (
                <div
                  key={`${vehicle.plate_number}-${vehicle.departure_time}-${index}`}
                  style={{
                    padding: '12px 16px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 'clamp(1rem, 1.8vw, 1.35rem)',
                  }}
                >
                  <span className="numeric">{vehicle.plate_number}</span> · {vehicle.line_name} · {vehicle.departure_time}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default BoardingStatusPage
