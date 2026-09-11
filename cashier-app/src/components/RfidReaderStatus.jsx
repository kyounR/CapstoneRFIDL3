import { useEffect, useRef, useState } from 'react'
import api from '../api/client'

function RfidReaderStatus() {
  const [isSupported, setIsSupported] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [lastTap, setLastTap] = useState(null)
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const connectToPortRef = useRef(null)
  const disconnectReaderRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    function setConnectionState(connected) {
      if (isMounted) {
        setIsConnected(connected)
      }
    }

    async function closePort(port) {
      if (!port) {
        return
      }

      try {
        await port.close()
      } catch {
        // The port may already be closed after an unplug or reader failure.
      }
    }

    async function stopReading(port = portRef.current) {
      const reader = readerRef.current
      readerRef.current = null

      if (reader) {
        try {
          await reader.cancel()
        } catch {
          // A reader that has already ended does not need cancellation.
        }
        reader.releaseLock()
      }

      if (portRef.current === port) {
        portRef.current = null
      }
      await closePort(port)
      setConnectionState(false)
    }

    function submitTap(uid) {
      api.post('tap/', { card_uid: uid })
        .then((response) => {
          console.log('RFID tap response:', response.status, response.data)
          setLastTap({
            uid,
            passenger_name: response.data.passenger_name || '',
            success: response.data.success === true,
            message: response.data.message || response.data.error || response.data.reason || '',
            fare_charged: response.data.fare_charged ?? response.data.applied_fare ?? null,
            destination_name: response.data.destination_name || '',
            timestamp: new Date().toISOString(),
          })
        })
        .catch((requestError) => {
          const response = requestError.response
          console.error('RFID tap request failed:', response?.status, response?.data || requestError.message)
          if (response) {
            setLastTap({
              uid,
              passenger_name: response.data.passenger_name || '',
              success: false,
              message: response.data.message || response.data.error || 'Tap failed.',
              fare_charged: null,
              destination_name: response.data.destination_name || '',
              timestamp: new Date().toISOString(),
            })
          }
        })
    }

    async function startReadLoop(port) {
      if (!port.readable) {
        await stopReading(port)
        return
      }

      const decodedStream = port.readable.pipeThrough(new TextDecoderStream())
      const reader = decodedStream.getReader()
      readerRef.current = reader
      setConnectionState(true)
      let bufferedText = ''

      try {
        while (isMounted && portRef.current === port) {
          const { value, done } = await reader.read()
          if (done) {
            break
          }

          bufferedText += value
          const lines = bufferedText.split(/\r?\n/)
          bufferedText = lines.pop()

          lines.forEach((line) => {
            const message = line.trim()
            if (message === 'READY') {
              console.log('RFID reader ready.')
            } else if (message.startsWith('TAP:')) {
              const uid = message.slice(4).trim()
              if (uid) {
                submitTap(uid)
              }
            }
          })
        }
      } catch (readError) {
        if (isMounted) {
          console.error('RFID reader disconnected:', readError)
        }
      } finally {
        if (readerRef.current === reader) {
          readerRef.current = null
          reader.releaseLock()
        }
        if (portRef.current === port) {
          portRef.current = null
          await closePort(port)
          setConnectionState(false)
        }
      }
    }

    async function connectToPort(port) {
      setIsConnecting(true)
      try {
        if (!port.readable) {
          await port.open({ baudRate: 115200 })
        }
        if (!isMounted) {
          await closePort(port)
          return
        }
        portRef.current = port
        startReadLoop(port)
      } catch (connectionError) {
        console.error('Could not connect RFID reader:', connectionError)
        await closePort(port)
        setConnectionState(false)
      } finally {
        if (isMounted) {
          setIsConnecting(false)
        }
      }
    }

    connectToPortRef.current = connectToPort
    disconnectReaderRef.current = stopReading

    function handleDisconnect(event) {
      const disconnectedPort = event.port || event.target
      if (disconnectedPort === portRef.current) {
        void stopReading(disconnectedPort)
      }
    }

    if (!('serial' in navigator)) {
      setIsSupported(false)
      return undefined
    }

    setIsSupported(true)
    navigator.serial.addEventListener('disconnect', handleDisconnect)
    navigator.serial.getPorts()
      .then((ports) => {
        if (isMounted && ports[0]) {
          connectToPort(ports[0])
        }
      })
      .catch((connectionError) => {
        console.error('Could not access authorized RFID readers:', connectionError)
      })

    return () => {
      isMounted = false
      navigator.serial.removeEventListener('disconnect', handleDisconnect)
      void stopReading()
      connectToPortRef.current = null
      disconnectReaderRef.current = null
    }
  }, [])

  async function handleConnect() {
    if (!('serial' in navigator) || isConnecting || isConnected) {
      return
    }

    setIsConnecting(true)
    try {
      const port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x10C4 }, { usbVendorId: 0x1A86 }],
      })
      await connectToPortRef.current?.(port)
    } catch (connectionError) {
      console.error('Could not select RFID reader:', connectionError)
      setIsConnecting(false)
    }
  }

  async function handleCopyUid() {
    if (!lastTap?.uid) {
      return
    }

    try {
      await navigator.clipboard.writeText(lastTap.uid)
    } catch (clipboardError) {
      console.error('Could not copy RFID UID:', clipboardError)
    }
  }

  if (isSupported === false) {
    return <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>RFID reader requires Chrome or Edge</span>
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
        <span className={`status-dot ${isConnected ? 'status-dot--success' : 'status-dot--pending'}`} />
        <span className={`badge ${isConnected ? 'badge--success' : 'badge--pending'}`}>Reader: {isConnected ? 'Connected' : 'Not connected'}</span>
        {!isConnected ? <button type="button" onClick={handleConnect} disabled={isConnecting || isSupported !== true} className="btn-secondary">{isConnecting ? 'Connecting...' : 'Connect Reader'}</button> : <button type="button" onClick={() => void disconnectReaderRef.current?.()} className="btn-secondary">Disconnect Reader</button>}
      </div>
      {lastTap ? (
        <aside className="card" style={{ position: 'fixed', left: '24px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: '260px', padding: '14px', fontFamily: 'var(--font-body)' }}>
          <strong>Last RFID tap</strong>
          <p style={{ margin: '10px 0 4px' }}>{lastTap.passenger_name || 'Unregistered card'}</p>
          <p className="numeric" style={{ margin: '0 0 10px', color: 'var(--text-secondary)' }}>{lastTap.uid}</p>
          {lastTap.success ? <>
            {lastTap.destination_name ? <p style={{ margin: '0 0 4px' }}>{lastTap.destination_name}</p> : null}
            {lastTap.fare_charged != null ? <p className="numeric" style={{ margin: 0 }}>Fare charged: {lastTap.fare_charged}</p> : null}
          </> : <p style={{ margin: 0, color: 'var(--danger)' }}>{lastTap.message}</p>}
          <button type="button" onClick={handleCopyUid} className="btn-secondary" style={{ marginTop: '12px' }}>Copy UID</button>
        </aside>
      ) : null}
    </>
  )
}

export default RfidReaderStatus
