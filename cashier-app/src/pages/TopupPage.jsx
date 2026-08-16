import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

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
    <div style={{ maxWidth: '560px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Top-up</h1>
      <p>
        <Link to="/summary">Go to summary</Link>
        {' | '}
        <Link to="/travel-pass">Travel Pass</Link>
      </p>
      <p style={{ marginBottom: '16px' }}>
        Top-ups are charged at face value. Discounts apply only during fare deduction.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="cardUid">Card UID</label>
          <input
            id="cardUid"
            type="text"
            value={cardUid}
            onChange={(event) => setCardUid(event.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            required
          />
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleLookupCard}
              disabled={isLookingUp}
              style={{ padding: '8px 14px' }}
            >
              {isLookingUp ? 'Looking up...' : 'Look up card'}
            </button>
          </div>
        </div>

        {lookupError ? <p style={{ color: 'crimson' }}>{lookupError}</p> : null}
        {lookupMessage ? <p style={{ color: 'green' }}>{lookupMessage}</p> : null}

        {cardLookup ? (
          <div style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ccc' }}>
            <p>Card UID: {cardLookup.uid}</p>
            <p>Balance: {cardLookup.balance}</p>
            <p>Status: {cardLookup.status}</p>
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
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            required
          />
        </div>

        {topupError ? <p style={{ color: 'crimson' }}>{topupError}</p> : null}

        <button type="submit" disabled={isSubmitting} style={{ padding: '8px 14px' }}>
          {isSubmitting ? 'Processing...' : 'Confirm Top-Up'}
        </button>
      </form>

      {topupResult ? (
        <div style={{ marginTop: '16px', padding: '12px', border: '1px solid #ccc' }}>
          <p>{topupResult.message}</p>
          <p>Card UID: {topupResult.card_uid}</p>
          <p>Updated Balance: {topupResult.balance}</p>
        </div>
      ) : null}
    </div>
  )
}

export default TopupPage
