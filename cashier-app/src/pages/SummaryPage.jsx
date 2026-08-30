import { Fragment, useEffect, useState } from 'react'
import api from '../api/client'

function SummaryPage() {
  const [date, setDate] = useState('')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [cashierTransactions, setCashierTransactions] = useState([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
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
          <p className="numeric">Fare Collected (RFID): {summary.total_fare_amount}</p>
          <p className="numeric">Number of Transactions: {summary.transaction_count}</p>
          <p className="numeric">Cash Fares Collected: {summary.cash_fare_total_amount}</p>
          <p className="numeric">Number of Cash Fares: {summary.cash_fare_count}</p>

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

          <h2>Cash Fares by Cashier</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Total Cash Fares</th>
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
                        <td>{item.cashier_username}</td>
                        <td className="numeric">{item.total_cash_fares}</td>
                        <td className="numeric">{item.cash_fare_count}</td>
                      </tr>
                      {isExpanded ? <tr><td colSpan="3">
                        {isLoadingCashFares ? <p>Loading cashier cash fares...</p> : (
                          <table className="table">
                            <thead><tr><th>Destination</th><th>Fare Type</th><th>Amount</th><th>Timestamp</th></tr></thead>
                            <tbody>
                              {cashierCashFares.length ? cashierCashFares.map((fare) => <tr key={`${fare.destination_name}-${fare.timestamp}`}>
                                <td>{fare.destination_name}</td>
                                <td>{fare.fare_type === 'discount' ? 'Discount' : 'Regular'}</td>
                                <td className="numeric">{fare.fare_charged}</td>
                                <td>{new Date(fare.timestamp).toLocaleString()}</td>
                              </tr>) : <tr><td colSpan="4">No cash fare transactions found.</td></tr>}
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
