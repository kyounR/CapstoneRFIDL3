import { Fragment, useEffect, useState } from 'react'
import api from '../api/client'

function SummaryPage() {
  const [date, setDate] = useState('')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [cashierTransactions, setCashierTransactions] = useState([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)

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

  async function toggleCashierTransactions(cashierId) {
    if (expandedId === cashierId) {
      setExpandedId(null)
      setCashierTransactions([])
      return
    }

    setExpandedId(cashierId)
    setCashierTransactions([])
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

  return (
    <div style={{ maxWidth: '760px', margin: '40px auto', fontFamily: 'var(--font-body)' }}>
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
        <div className="card">
          <p className="numeric">Total Top-up Amount: {summary.total_topups_amount}</p>
          <p className="numeric">Total Fare Collected: {summary.total_fare_amount}</p>
          <p className="numeric">Number of Transactions: {summary.transaction_count}</p>

          <h2>Cashier Top-up Breakdown</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Total Top-ups</th>
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
                        <td>{item.cashier_username}</td>
                        <td className="numeric">{item.total_topups}</td>
                        <td className="numeric">{item.topup_count}</td>
                      </tr>
                      {isExpanded ? <tr><td colSpan="3">
                        {isLoadingTransactions ? <p>Loading cashier transactions...</p> : (
                          <table className="table">
                            <thead><tr><th>Passenger</th><th>Card UID</th><th>Amount</th><th>Timestamp</th></tr></thead>
                            <tbody>
                              {cashierTransactions.length ? cashierTransactions.map((transaction) => <tr key={`${transaction.card_uid}-${transaction.timestamp}`}>
                                <td>{transaction.passenger_name || 'Unregistered card'}</td>
                                <td className="numeric">{transaction.card_uid}</td>
                                <td className="numeric">{transaction.amount}</td>
                                <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                              </tr>) : <tr><td colSpan="4">No top-up transactions found.</td></tr>}
                            </tbody>
                          </table>
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
