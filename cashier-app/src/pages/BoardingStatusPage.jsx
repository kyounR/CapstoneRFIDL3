import { useEffect, useState } from 'react'
import api from '../api/client'

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
        <h1 style={{ margin: '0 0 40px', fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 7vw, 6rem)', letterSpacing: '0' }}>
          Boarding Status
        </h1>

        {boarding.length === 0 ? (
          <section
            style={{
              padding: 'clamp(32px, 7vw, 80px)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 4vw, 3.5rem)',
              textAlign: 'center',
            }}
          >
            No vehicles currently boarding
          </section>
        ) : (
          <div style={{ display: 'grid', gap: '36px' }}>
            {boarding.map((line) => (
              <section key={line.line_name}>
                <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}>
                  {line.line_name}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {line.vehicles.map((vehicle, index) => (
                    <article
                      key={vehicle.manifest_trip_id}
                      style={{
                        padding: '28px',
                        background: 'var(--surface)',
                        border: `2px solid ${vehicle.is_primary ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          color: vehicle.is_primary ? 'var(--accent)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-display)',
                          fontSize: 'clamp(1.4rem, 2.4vw, 2rem)',
                          fontWeight: 600,
                        }}
                      >
                        {vehicle.is_primary ? 'Now Boarding' : `Next Vehicle #${index + 1}`}
                      </p>
                      <p className="numeric" style={{ margin: '12px 0', fontSize: 'clamp(2.5rem, 5vw, 5rem)', fontWeight: 600 }}>
                        {vehicle.plate_number}
                      </p>
                      <p className="numeric" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'clamp(1.3rem, 2.5vw, 2rem)' }}>
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
