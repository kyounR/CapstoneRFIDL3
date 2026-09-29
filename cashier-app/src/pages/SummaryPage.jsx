import { Fragment, useEffect, useState } from 'react'
import api from '../api/client'

function SummaryPage() {
  const [date, setDate] = useState('')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [cashierTransactions, setCashierTransactions] = useState([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [reversingTransactionId, setReversingTransactionId] = useState(null)
  const [reversalReasons, setReversalReasons] = useState({})
  const [expandedReversalTransactionId, setExpandedReversalTransactionId] = useState(null)
  const [expandedCashFareId, setExpandedCashFareId] = useState(null)
  const [cashierCashFares, setCashierCashFares] = useState([])
  const [isLoadingCashFares, setIsLoadingCashFares] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setDate(today)
  }, [])

  async function fetchSummary(targetDate) {
    setError('')

    try {
      const response = await api.get('reports/', { params: { date: targetDate } })
      setSummary(response.data)
      setExpandedId(null)
      setCashierTransactions([])
      setExpandedReversalTransactionId(null)
      setExpandedCashFareId(null)
      setCashierCashFares([])
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Could not load summary.'
      setError(message)
      setSummary(null)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (date) {
      fetchSummary(date)
    }
  }

  async function fetchCashierTransactions(cashierId) {
    setIsLoadingTransactions(true)
    try {
      const response = await api.get('reports/cashier-transactions/', {
        params: { cashier_id: cashierId, date },
      })
      setCashierTransactions(Array.isArray(response.data) ? response.data : response.data.results || [])
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load cashier transactions.')
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  async function toggleCashierTransactions(cashierId) {
    if (expandedId === cashierId) {
      setExpandedId(null)
      setCashierTransactions([])
      setExpandedReversalTransactionId(null)
      return
    }

    setExpandedId(cashierId)
    setCashierTransactions([])
    setExpandedReversalTransactionId(null)
    await fetchCashierTransactions(cashierId)
  }

  async function handleReverseTransaction(transaction) {
    const reason = reversalReasons[transaction.id] || ''
    if (!reason.trim()) {
      setError('A non-empty reason is required.')
      return
    }

    const cashierId = expandedId
    setReversingTransactionId(transaction.id)
    setError('')
    try {
      await api.post(`transactions/${transaction.id}/reverse/`, { reason: reason.trim() })
      await fetchSummary(date)
      if (cashierId !== null) {
        setExpandedId(cashierId)
        await fetchCashierTransactions(cashierId)
      }
      setExpandedReversalTransactionId(null)
      setReversalReasons((current) => ({ ...current, [transaction.id]: '' }))
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Top-up reversal failed.')
    } finally {
      setReversingTransactionId(null)
    }
  }

  function closeReversalPanel(transactionId) {
    setExpandedReversalTransactionId(null)
    setReversalReasons((current) => ({ ...current, [transactionId]: '' }))
  }

  async function toggleCashierCashFares(cashierId) {
    if (expandedCashFareId === cashierId) {
      setExpandedCashFareId(null)
      setCashierCashFares([])
      return
    }

    setExpandedCashFareId(cashierId)
    setCashierCashFares([])
    setIsLoadingCashFares(true)
    try {
      const response = await api.get('reports/cashier-cash-fares/', {
        params: { cashier_id: cashierId, date },
      })
      setCashierCashFares(Array.isArray(response.data) ? response.data : response.data.results || [])
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load cashier cash fares.')
    } finally {
      setIsLoadingCashFares(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: '1600px', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
      <h1>Daily Summary</h1>

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="summaryDate">Date</label>
        <input
          id="summaryDate"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="input"
          required
        />
        <button type="submit" className="btn-primary">
          Load Summary
        </button>
      </form>

      {error ? (
        <p>
          <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
          {error}
        </p>
      ) : null}

      {summary ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            <section>
              <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>RFID</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div className="card" style={{ padding: '16px' }}><div className="numeric" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{summary.total_topups_amount}</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Total Top-up Amount</div></div>
                <div className="card" style={{ padding: '16px' }}><div className="numeric" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{summary.total_fare_amount}</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Fare Collected (RFID)</div></div>
                <div className="card" style={{ padding: '16px' }}><div className="numeric" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{summary.transaction_count}</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>RFID Transactions</div></div>
              </div>
            </section>
            <section>
              <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>CASH</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div className="card" style={{ padding: '16px' }}><div className="numeric" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{summary.cash_fare_total_amount}</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Cash Fares Collected</div></div>
                <div className="card" style={{ padding: '16px' }}><div className="numeric" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{summary.cash_fare_count}</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Number of Cash Fares</div></div>
              </div>
            </section>
          </div>

          <h2>Cashier Top-up Breakdown</h2>
          <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead>
              <tr>
                <th>Cashier</th>
                <th style={{ textAlign: 'right' }}>Total Top-ups</th>
                <th>Top-up Count</th>
              </tr>
            </thead>
            <tbody>
              {summary.cashier_topup_breakdown.length === 0 ? (
                <tr>
                  <td colSpan="3">No top-up activity for this date.</td>
                </tr>
              ) : (
                summary.cashier_topup_breakdown.map((item) => {
                  const isExpanded = expandedId === item.cashier_id
                  return (
                    <Fragment key={item.cashier_id}>
                      <tr onClick={() => toggleCashierTransactions(item.cashier_id)} style={{ cursor: 'pointer' }}>
                        <td>{item.cashier_full_name || item.cashier_username}</td>
                        <td className="numeric" style={{ textAlign: 'right' }}>{item.total_topups}</td>
                        <td className="numeric">{item.topup_count}</td>
                      </tr>
                      {isExpanded ? <tr><td colSpan="3" style={{ padding: 0 }}>
                        {isLoadingTransactions ? <p>Loading cashier transactions...</p> : (
                          <div style={{ margin: '12px 16px 16px 40px', padding: '12px', overflowX: 'auto', background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent)' }}>
                            <table className="table" style={{ minWidth: '860px' }}>
                              <thead><tr><th>Passenger</th><th>Card UID</th><th style={{ textAlign: 'right' }}>Amount</th><th>Timestamp</th><th>Status</th><th>Action</th></tr></thead>
                              <tbody>
                                {cashierTransactions.length ? cashierTransactions.map((transaction) => {
                                  const isReversalPanelOpen = expandedReversalTransactionId === transaction.id
                                  return <Fragment key={transaction.id}>
                                    <tr>
                                      <td>{transaction.passenger_name || 'Unregistered card'}</td>
                                      <td className="numeric">{transaction.card_uid}</td>
                                      <td className="numeric" style={{ textAlign: 'right' }}>{transaction.amount}</td>
                                      <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                                      <td>
                                        <span className={`badge ${transaction.is_reversed ? 'badge--pending' : 'badge--success'}`}>{transaction.is_reversed ? 'Reversed' : 'Active'}</span>
                                        {transaction.is_reversed ? <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                          Reversed by {transaction.reversed_by_full_name || transaction.reversed_by_username || 'Unknown user'} on {transaction.reversed_at ? new Date(transaction.reversed_at).toLocaleString() : 'unknown date'}: {transaction.reversal_reason || 'No reason provided.'}
                                        </div> : null}
                                      </td>
                                      <td>{transaction.is_reversed ? 'Reversed' : <button type="button" onClick={() => setExpandedReversalTransactionId(transaction.id)} disabled={reversingTransactionId !== null} style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--accent)', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Reverse</button>}</td>
                                    </tr>
                                    {isReversalPanelOpen ? <tr><td colSpan="6" style={{ background: 'var(--bg)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                        <input
                                          type="text"
                                          value={reversalReasons[transaction.id] || ''}
                                          onChange={(event) => setReversalReasons((current) => ({ ...current, [transaction.id]: event.target.value }))}
                                          placeholder="Reason for reversal"
                                          aria-label={`Reason for reversing top-up ${transaction.id}`}
                                          className="input"
                                          style={{ minWidth: '220px', flex: 1 }}
                                        />
                                        <button type="button" onClick={() => handleReverseTransaction(transaction)} disabled={reversingTransactionId === transaction.id || !(reversalReasons[transaction.id] || '').trim()} className="btn-primary">{reversingTransactionId === transaction.id ? 'Reversing...' : 'Confirm'}</button>
                                        <button type="button" onClick={() => closeReversalPanel(transaction.id)} disabled={reversingTransactionId === transaction.id} className="btn-secondary">Cancel</button>
                                      </div>
                                    </td></tr> : null}
                                  </Fragment>
                                }) : <tr><td colSpan="6">No top-up transactions found.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td></tr> : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>

          <h2>Cash Fares by Cashier</h2>
          <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead>
              <tr>
                <th>Cashier</th>
                <th style={{ textAlign: 'right' }}>Total Cash Fares</th>
                <th>Cash Fare Count</th>
              </tr>
            </thead>
            <tbody>
              {summary.cashier_cash_fare_breakdown.length === 0 ? (
                <tr>
                  <td colSpan="3">No cash fare activity for this date.</td>
                </tr>
              ) : (
                summary.cashier_cash_fare_breakdown.map((item) => {
                  const isExpanded = expandedCashFareId === item.cashier_id
                  return (
                    <Fragment key={`cashfare-${item.cashier_id}`}>
                      <tr onClick={() => toggleCashierCashFares(item.cashier_id)} style={{ cursor: 'pointer' }}>
                        <td>{item.cashier_full_name || item.cashier_username}</td>
                        <td className="numeric" style={{ textAlign: 'right' }}>{item.total_cash_fares}</td>
                        <td className="numeric">{item.cash_fare_count}</td>
                      </tr>
                      {isExpanded ? <tr><td colSpan="3" style={{ padding: 0 }}>
                        {isLoadingCashFares ? <p>Loading cashier cash fares...</p> : (
                          <div style={{ margin: '12px 16px 16px 40px', padding: '12px', overflowX: 'auto', background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent)' }}>
                            <table className="table" style={{ minWidth: '640px' }}>
                              <thead><tr><th>Destination</th><th>Fare Type</th><th style={{ textAlign: 'right' }}>Amount</th><th>Timestamp</th></tr></thead>
                              <tbody>
                                {cashierCashFares.length ? cashierCashFares.map((fare) => <tr key={`${fare.destination_name}-${fare.timestamp}`}>
                                  <td>{fare.destination_name}{fare.is_correction ? <span className="badge badge--neutral" style={{ marginLeft: '8px' }}>Correction</span> : null}</td>
                                  <td>{fare.fare_type === 'discount' ? 'Discount' : 'Regular'}</td>
                                  <td className="numeric" style={{ textAlign: 'right' }}>{fare.fare_charged}</td>
                                  <td>{new Date(fare.timestamp).toLocaleString()}</td>
                                </tr>) : <tr><td colSpan="4">No cash fare transactions found.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td></tr> : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export default SummaryPage
