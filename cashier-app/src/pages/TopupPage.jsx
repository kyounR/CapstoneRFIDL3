import { useEffect, useRef, useState } from 'react'
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

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchTimeoutRef = useRef(null)

  const [amount, setAmount] = useState('')
  const [topupResult, setTopupResult] = useState(null)
  const [topupError, setTopupError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const amountInputRef = useRef(null)

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      setSearchError('')
      return
    }

    setIsSearching(true)
    setSearchError('')

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await api.get('cards/search/', {
          params: { q: searchQuery },
        })
        setSearchResults(response.data)
      } catch (requestError) {
        const message = requestError.response?.data?.error || 'Card search failed.'
        setSearchError(message)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 400)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  function maskCardUid(uid) {
    if (!uid || uid.length < 8) return uid
    return `****${uid.slice(-4)}`
  }

  function handleSelectSearchResult(result) {
    setCardUid(result.uid)
    setCardLookup({
      uid: result.uid,
      balance: result.balance,
      status: result.status,
      passenger: result.passenger,
    })
    setSearchQuery('')
    setSearchResults([])
    setLookupMessage('Card found.')
    setLookupError('')

    // Focus on amount field after short delay for smooth UX
    setTimeout(() => {
      if (amountInputRef.current) {
        amountInputRef.current.focus()
      }
    }, 50)
  }

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
      setSearchQuery('')
      setSearchResults([])
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
          <label htmlFor="searchQuery">Search by name</label>
          <input
            id="searchQuery"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Type passenger name (min 2 characters)"
            className="input"
            style={{ width: '100%', marginTop: '4px' }}
          />
          {isSearching ? <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Searching...</p> : null}
          {searchError ? <p style={{ fontSize: '0.9rem', color: 'var(--danger)', marginTop: '4px' }}>{searchError}</p> : null}
          {searchResults.length > 0 ? (
            <div style={{ marginTop: '8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxHeight: '300px', overflowY: 'auto', background: 'var(--bg-elevated)' }}>
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => handleSelectSearchResult(result)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {result.passenger?.full_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    {maskCardUid(result.uid)} · {result.passenger?.discount_type || 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Balance: <span className="numeric">{result.balance}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

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
            ref={amountInputRef}
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
