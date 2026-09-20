import { useEffect, useState } from 'react'
import api from '../api/client'
import BoardingCodeBadge from './BoardingCodeBadge'
import CalPassWordmark from './CalPassWordmark'

function formatFareType(fareType) {
  if (fareType === 'discount') return 'Discount'
  if (fareType === 'base') return 'Regular'
  return '-'
}

function getPaymentMethod(tapLog) {
  if (tapLog.source === 'rfid' && tapLog.card_uid) return 'RFID Card'
  if (tapLog.source === 'manual') return 'Cash'
  return '-'
}

function ReceiptModal({ tapLogId, onClose }) {
  const [tapLog, setTapLog] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tapLogId) return undefined

    let isMounted = true
    setTapLog(null)
    setError('')
    setIsLoading(true)

    api.get(`tap-log/${tapLogId}/`)
      .then((response) => {
        if (isMounted) setTapLog(response.data)
      })
      .catch((requestError) => {
        if (isMounted) setError(requestError.response?.data?.error || 'Could not load receipt.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [tapLogId])

  if (!tapLogId) return null

  return (
    <div className="receipt-modal-overlay" role="dialog" aria-modal="true" aria-label="Official receipt">
      <section className="receipt-modal-content">
        <div className="receipt-modal-header">
          <CalPassWordmark />
          <h2>Official Receipt</h2>
        </div>
        {isLoading ? <p>Loading receipt...</p> : null}
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {tapLog ? <div className="receipt-details">
          {tapLog.boarding_code?.color && tapLog.boarding_code?.shape && tapLog.boarding_code?.number != null ? <div className="receipt-boarding-code">
            <p className="receipt-boarding-code-label">Board vehicle marked:</p>
            <BoardingCodeBadge code={tapLog.boarding_code} size={112} />
          </div> : null}
          <p><strong>Receipt No.:</strong> {tapLog.id}</p>
          <p><strong>Date/Time:</strong> {new Date(tapLog.timestamp).toLocaleString()}</p>
          <p><strong>Destination:</strong> {tapLog.destination_name || '-'}</p>
          <p><strong>Fare Type:</strong> {formatFareType(tapLog.fare_type)}</p>
          <p><strong>Amount:</strong> <span className="numeric">{tapLog.fare_charged ?? '-'}</span></p>
          <p><strong>Payment Method:</strong> {getPaymentMethod(tapLog)}</p>
          {tapLog.passenger_name ? <p><strong>Passenger:</strong> {tapLog.passenger_name}</p> : null}
        </div> : null}
        <div className="receipt-modal-actions">
          <button type="button" onClick={() => window.print()} className="btn-primary" disabled={!tapLog}>Print</button>
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </section>
    </div>
  )
}

export default ReceiptModal
