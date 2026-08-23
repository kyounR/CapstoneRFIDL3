import { useEffect, useState } from 'react'
import api from '../api/client'

function SummaryPage() {
  const [date, setDate] = useState('')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setDate(today)
  }, [])

  async function fetchSummary(targetDate) {
    setError('')

    try {
      const response = await api.get('reports/', { params: { date: targetDate } })
      setSummary(response.data)
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

  return (
    <div style={{ maxWidth: '760px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Daily Summary</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: '16px' }}>
        <label htmlFor="summaryDate">Date</label>
        <input
          id="summaryDate"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          style={{ marginLeft: '8px', padding: '6px' }}
          required
        />
        <button type="submit" style={{ marginLeft: '8px', padding: '6px 10px' }}>
          Load Summary
        </button>
      </form>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {summary ? (
        <div>
          <p>Total Top-ups: {summary.total_topups_amount}</p>
          <p>Total Fare Collected: {summary.total_fare_amount}</p>
          <p>Transaction Count: {summary.transaction_count}</p>

          <h2>Cashier Top-up Breakdown</h2>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
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
                summary.cashier_topup_breakdown.map((item) => (
                  <tr key={item.cashier_id}>
                    <td>{item.cashier_username}</td>
                    <td>{item.total_topups}</td>
                    <td>{item.topup_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export default SummaryPage
