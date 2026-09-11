import { useEffect, useRef, useState } from 'react'
import api from '../api/client'

function RfidReaderStatus() {
  const [isSupported, setIsSupported] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const portRef = useRef(null)
  const readerRef = useRef(null)

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
        })
        .catch((requestError) => {
          console.error(
            'RFID tap request failed:',
            requestError.response?.status,
            requestError.response?.data || requestError.message,
          )
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

    function handleDisconnect(event) {
      const disconnectedPort = event.port || event.target
      if (disconnectedPort === portRef.current) {
        stopReading(disconnectedPort)
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
      stopReading()
    }
  }, [])

  async function handleConnect() {
    if (!('serial' in navigator) || isConnecting || isConnected) {
      return
    }

    setIsConnecting(true)
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      portRef.current = port

      if (!port.readable) {
        throw new Error('The selected RFID reader does not provide a readable serial stream.')
      }

      const decodedStream = port.readable.pipeThrough(new TextDecoderStream())
      const reader = decodedStream.getReader()
      readerRef.current = reader
      setIsConnected(true)
      let bufferedText = ''

      while (portRef.current === port) {
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
              api.post('tap/', { card_uid: uid })
                .then((response) => console.log('RFID tap response:', response.status, response.data))
                .catch((requestError) => console.error('RFID tap request failed:', requestError.response?.status, requestError.response?.data || requestError.message))
            }
          }
        })
      }
    } catch (connectionError) {
      console.error('Could not connect RFID reader:', connectionError)
    } finally {
      const reader = readerRef.current
      readerRef.current = null
      if (reader) {
        try {
          await reader.cancel()
        } catch {
          // The reader may have already ended.
        }
        reader.releaseLock()
      }
      const port = portRef.current
      portRef.current = null
      if (port) {
        try {
          await port.close()
        } catch {
          // The port may already be closed.
        }
      }
      setIsConnected(false)
      setIsConnecting(false)
    }
  }

  if (isSupported === false) {
    return <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>RFID reader requires Chrome or Edge</span>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
      <span className={`status-dot ${isConnected ? 'status-dot--success' : 'status-dot--pending'}`} />
      <span className={`badge ${isConnected ? 'badge--success' : 'badge--pending'}`}>Reader: {isConnected ? 'Connected' : 'Not connected'}</span>
      {!isConnected ? <button type="button" onClick={handleConnect} disabled={isConnecting || isSupported !== true} className="btn-secondary">{isConnecting ? 'Connecting...' : 'Connect Reader'}</button> : null}
    </div>
  )
}

export default RfidReaderStatus
