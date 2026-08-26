import { useState } from 'react'
import api from '../api/client'

const CARD_STATUS_BADGE = {
  active: 'badge--success',
  lost: 'badge--pending',
  deactivated: 'badge--danger',
}

const CARD_STATUS_DOT = {
  active: 'status-dot--success',
  lost: 'status-dot--pending',
  deactivated: 'status-dot--danger',
}

function TopupPage() {
  const [cardUid, setCardUid] = useState('')
  const [cardLookup, setCardLookup] = useState(null)
  const [lookupMessage, setLookupMessage] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)

  const [amount, setAmount] = useState('')
  const [topupResult, setTopupResult] = useState(null)
  const [topupError, setTopupError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLookupCard() {
    const trimmedUid = cardUid.trim()

    if (!trimmedUid) {
      setLookupError('Please enter a card UID before lookup.')
      setLookupMessage('')
      setCardLookup(null)
      return
    }

    setIsLookingUp(true)
    setLookupError('')
    setLookupMessage('')
    setCardLookup(null)
    setTopupError('')

    try {
      const response = await api.get('cards/lookup/', {
        params: { uid: trimmedUid },
      })

      setCardLookup(response.data)
      setLookupMessage('Card found.')
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Card lookup failed.'
      if (requestError.response?.status === 404) {
        setLookupError('Card not found.')
      } else {
        setLookupError(message)
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setTopupError('')
    setTopupResult(null)
    setIsSubmitting(true)

    try {
      const response = await api.post('topup/', {
        card_uid: cardUid.trim(),
        amount,
      })

      setTopupResult(response.data)

      // Prepare form for next passenger after successful top-up.
      setCardUid('')
      setAmount('')
      setCardLookup(null)
      setLookupMessage('')
      setLookupError('')
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Top-up request failed.'
      setTopupError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '40px auto', fontFamily: 'var(--font-body)' }}>
      <h1>Top-up</h1>
      <p style={{ marginBottom: '16px' }}>
        Top-ups are charged at face value. Discounts apply only during fare deduction.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="cardUid">Card UID</label>
          <input
            id="cardUid"
            type="text"
            value={cardUid}
            onChange={(event) => setCardUid(event.target.value)}
            className="input"
            style={{ width: '100%', marginTop: '4px' }}
            required
          />
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleLookupCard}
              disabled={isLookingUp}
              className="btn-secondary"
            >
              {isLookingUp ? 'Looking up...' : 'Look up card'}
            </button>
          </div>
        </div>

        {lookupError ? (
          <p>
            <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
            {lookupError}
          </p>
        ) : null}
        {lookupMessage ? (
          <p>
            <span className="status-dot status-dot--success" style={{ marginRight: '8px' }} />
            {lookupMessage}
          </p>
        ) : null}

        {cardLookup ? (
          <div className="card" style={{ marginBottom: '12px' }}>
            <p className="numeric">Card UID: {cardLookup.uid}</p>
            <p className="numeric">Balance: {cardLookup.balance}</p>
            <p>
              Status:{' '}
              <span className={`badge ${CARD_STATUS_BADGE[cardLookup.status] || 'badge--pending'}`}>
                <span className={`status-dot ${CARD_STATUS_DOT[cardLookup.status] || 'status-dot--pending'}`} style={{ marginRight: '6px' }} />
                {cardLookup.status}
              </span>
            </p>
            {cardLookup.passenger ? (
              <>
                <p>Passenger: {cardLookup.passenger.full_name}</p>
                <p>Discount Type: {cardLookup.passenger.discount_type}</p>
              </>
            ) : (
              <p>No linked passenger.</p>
            )}
          </div>
        ) : null}

        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="input numeric"
            style={{ width: '100%', marginTop: '4px' }}
            required
          />
        </div>

        {topupError ? (
          <p>
            <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
            {topupError}
          </p>
        ) : null}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Processing...' : 'Confirm Top-Up'}
        </button>
      </form>

      {topupResult ? (
        <div className="card" style={{ marginTop: '16px' }}>
          <p>
            <span className="status-dot status-dot--success" style={{ marginRight: '8px' }} />
            {topupResult.message}
          </p>
          <p className="numeric">Card UID: {topupResult.card_uid}</p>
          <p className="numeric">Updated Balance: {topupResult.balance}</p>
        </div>
      ) : null}
    </div>
  )
}

export default TopupPage
