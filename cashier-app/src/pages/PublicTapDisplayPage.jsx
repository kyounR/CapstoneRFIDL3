import { useEffect, useRef, useState } from 'react'
import api from '../api/client'

function PublicTapDisplayPage() {
  const [tap, setTap] = useState(null)
  const lastTimestampRef = useRef(null)
  const idleTimeoutRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    async function poll() {
      try {
        const response = await api.get('tap-log/latest-public/')
        const latest = response.data

        if (!isMounted || !latest) {
          return
        }

        if (latest.timestamp !== lastTimestampRef.current) {
          lastTimestampRef.current = latest.timestamp
          setTap(latest)

          if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current)
          }
          idleTimeoutRef.current = setTimeout(() => {
            if (isMounted) {
              setTap(null)
            }
          }, 3000)
        }
      } catch {
        // ignore transient polling errors, keep showing current state
      }
    }

    poll()
    const intervalId = setInterval(poll, 3000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current)
      }
    }
  }, [])

  const isSuccess = tap?.success === true
  const isFailure = tap != null && tap.success === false

  const backgroundColor = isSuccess ? 'var(--success)' : isFailure ? 'var(--danger)' : 'var(--bg)'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
        backgroundColor,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-display)',
        textAlign: 'center',
        padding: '48px',
        transition: 'background-color 0.4s ease',
      }}
    >
      {tap ? (
        <>
          <span style={{ fontSize: '12rem', lineHeight: 1 }} aria-hidden="true">
            {isSuccess ? '✔' : '✘'}
          </span>
          <h1 style={{ fontSize: '5rem', margin: 0 }}>{tap.display_name}</h1>
          {tap.destination_name ? (
            <p style={{ fontSize: '3rem', margin: 0, fontFamily: 'var(--font-body)' }}>{tap.destination_name}</p>
          ) : null}
          {isSuccess && tap.fare_charged != null ? (
            <p style={{ fontSize: '3rem', margin: 0, fontFamily: 'var(--font-body)' }}>Fare: ₱{tap.fare_charged} deducted</p>
          ) : null}
          {isFailure ? <p style={{ fontSize: '2.5rem', margin: 0, fontFamily: 'var(--font-body)' }}>{tap.message}</p> : null}
        </>
      ) : (
        <>
          <span style={{ fontSize: '10rem', lineHeight: 1 }} aria-hidden="true">
            🚌
          </span>
          <h1 style={{ fontSize: '4rem', margin: 0 }}>Ready — tap your card</h1>
        </>
      )}
    </div>
  )
}

export default PublicTapDisplayPage
