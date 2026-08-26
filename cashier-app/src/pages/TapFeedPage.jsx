import { useEffect, useState } from 'react'
import api from '../api/client'

function TapFeedPage() {
  const [taps, setTaps] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function fetchTaps() {
      try {
        const response = await api.get('tap-log/recent/')
        if (isMounted) {
          setTaps(response.data)
          setError('')
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.error || 'Failed to load tap feed.')
        }
      }
    }

    fetchTaps()
    const intervalId = setInterval(fetchTaps, 2000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  return (
    <div style={{ maxWidth: '900px', margin: '40px auto', fontFamily: 'sans-serif', fontSize: '1.4rem' }}>
      <h1 style={{ fontSize: '2.5rem' }}>Tap Feed</h1>

      {error ? <p style={{ color: 'crimson', fontSize: '1.4rem' }}>{error}</p> : null}

      {taps.length === 0 && !error ? (
        <p style={{ fontSize: '1.6rem' }}>No taps yet today.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {taps.map((tap) => (
            <div
              key={tap.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                padding: '20px 24px',
                borderRadius: '8px',
                backgroundColor: tap.success ? '#e6f7e9' : '#fbe6e6',
                border: `2px solid ${tap.success ? '#2e8b3d' : '#c92a2a'}`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: '3rem',
                  lineHeight: 1,
                  color: tap.success ? '#2e8b3d' : '#c92a2a',
                }}
              >
                {tap.success ? '✔' : '✘'}
              </span>

              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: 0 }}>
                  {tap.passenger_name ? tap.passenger_name : 'Unregistered card'}
                  {tap.destination_name ? ` → ${tap.destination_name}` : ''}
                </p>
                <p style={{ fontSize: '1.4rem', margin: '8px 0 0' }}>{tap.message}</p>
                {tap.success ? (
                  <p style={{ fontSize: '1.4rem', margin: '8px 0 0' }}>
                    Fare charged: {tap.fare_charged} · Remaining balance: {tap.remaining_balance}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TapFeedPage
