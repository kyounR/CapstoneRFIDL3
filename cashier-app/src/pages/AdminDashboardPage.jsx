import { useState } from 'react'
import api from '../api/client'

function getToday() {
  const currentDate = new Date()
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function AdminDashboardPage() {
  const today = getToday()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleApply(event) {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get('admin/dashboard/', {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      })
      setDashboard(response.data)
    } catch (requestError) {
      setDashboard(null)
      setError(requestError.response?.data?.error || 'Could not load dashboard data.')
    } finally {
      setIsLoading(false)
    }
  }

  const hasFinalizedTrips = dashboard?.trip_count > 0

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Admin Dashboard</h1>

      <form onSubmit={handleApply} style={{ marginBottom: '20px' }}>
        <label htmlFor="startDate">Start date</label>
        <input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          style={{ marginLeft: '8px', marginRight: '16px', padding: '6px' }}
          required
        />
        <label htmlFor="endDate">End date</label>
        <input
          id="endDate"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          style={{ marginLeft: '8px', marginRight: '8px', padding: '6px' }}
          required
        />
        <button type="submit" disabled={isLoading} style={{ padding: '6px 10px' }}>
          {isLoading ? 'Loading...' : 'Apply'}
        </button>
      </form>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {isLoading ? <p>Loading dashboard...</p> : null}

      {dashboard && !hasFinalizedTrips ? <p>No finalized Travel Passes in this date range.</p> : null}

      {dashboard && hasFinalizedTrips ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <div style={{ border: '1px solid #ccc', padding: '12px' }}><strong>Total Passengers</strong><p style={{ fontSize: '28px', marginBottom: 0 }}>{dashboard.total_passengers}</p></div>
            <div style={{ border: '1px solid #ccc', padding: '12px' }}><strong>Total Income</strong><p style={{ fontSize: '28px', marginBottom: 0 }}>{dashboard.total_income}</p></div>
            <div style={{ border: '1px solid #ccc', padding: '12px' }}><strong>Total Discount Passengers</strong><p style={{ fontSize: '28px', marginBottom: 0 }}>{dashboard.total_discount_passengers}</p></div>
            <div style={{ border: '1px solid #ccc', padding: '12px' }}><strong>Trip Count</strong><p style={{ fontSize: '28px', marginBottom: 0 }}>{dashboard.trip_count}</p></div>
          </div>

          <h2>Popular Destinations</h2>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '24px' }}>
            <thead><tr><th>Destination</th><th>Passenger Count</th><th>Total Fare</th></tr></thead>
            <tbody>
              {dashboard.popular_destinations.map((destination) => (
                <tr key={destination.destination_id}><td>{destination.destination_name}</td><td>{destination.passenger_count}</td><td>{destination.total_fare}</td></tr>
              ))}
            </tbody>
          </table>

          <h2>Daily Breakdown</h2>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th>Date</th><th>Total Passengers</th><th>Total Income</th></tr></thead>
            <tbody>
              {dashboard.daily_breakdown.map((day) => (
                <tr key={day.date}><td>{day.date}</td><td>{day.total_passengers}</td><td>{day.total_income}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  )
}

export default AdminDashboardPage
