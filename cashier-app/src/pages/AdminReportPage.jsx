import { useState } from 'react'
import api from '../api/client'

function getToday() {
  const currentDate = new Date()
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getFilename(contentDisposition, startDate, endDate) {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i)
  return match?.[1] || `caltransco_report_${startDate}_to_${endDate}.csv`
}

function AdminReportPage() {
  const today = getToday()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [report, setReport] = useState(null)
  const [generatedOn, setGeneratedOn] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  async function handleApply(event) {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get('admin/dashboard/', {
        params: { start_date: startDate, end_date: endDate },
      })
      setReport(response.data)
      setGeneratedOn(new Date().toLocaleString())
    } catch (requestError) {
      setReport(null)
      setError(requestError.response?.data?.error || 'Could not load report data.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDownload() {
    setIsDownloading(true)
    setError('')

    try {
      const response = await api.get('admin/reports/export/', {
        params: { start_date: startDate, end_date: endDate },
        responseType: 'blob',
      })
      const objectUrl = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = getFilename(response.headers['content-disposition'], startDate, endDate)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (requestError) {
      setError('Could not download the CSV report.')
    } finally {
      setIsDownloading(false)
    }
  }

  const hasFinalizedTrips = report?.trip_count > 0

  return (
    <div style={{ maxWidth: '900px', margin: '40px auto', fontFamily: 'serif' }}>
      <div className="report-controls" style={{ marginBottom: '20px', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleApply}>
          <label htmlFor="reportStartDate">Start date</label>
          <input id="reportStartDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={{ marginLeft: '8px', marginRight: '16px', padding: '6px' }} required />
          <label htmlFor="reportEndDate">End date</label>
          <input id="reportEndDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={{ marginLeft: '8px', marginRight: '8px', padding: '6px' }} required />
          <button type="submit" disabled={isLoading} style={{ padding: '6px 10px' }}>{isLoading ? 'Loading...' : 'Apply'}</button>
          <button type="button" onClick={handleDownload} disabled={isDownloading} style={{ marginLeft: '8px', padding: '6px 10px' }}>{isDownloading ? 'Downloading...' : 'Download CSV'}</button>
          <button type="button" onClick={() => window.print()} style={{ marginLeft: '8px', padding: '6px 10px' }}>Print Report</button>
        </form>
      </div>

      {error ? <p style={{ color: 'crimson', fontFamily: 'sans-serif' }}>{error}</p> : null}
      {isLoading ? <p style={{ fontFamily: 'sans-serif' }}>Loading report...</p> : null}

      {report ? (
        <article className="management-report">
          <header style={{ borderBottom: '2px solid #000', marginBottom: '20px', paddingBottom: '10px' }}>
            <h1 style={{ margin: 0 }}>CALTRANSCO Management Report</h1>
            <p style={{ marginBottom: '4px' }}>Report period: {startDate} to {endDate}</p>
            <p style={{ margin: 0 }}>Generated on {generatedOn}</p>
          </header>

          {!hasFinalizedTrips ? <p>No finalized Travel Passes in this date range.</p> : (
            <>
              <section style={{ marginBottom: '24px' }}>
                <p><strong>Total Passengers:</strong> {report.total_passengers}</p>
                <p><strong>Total Income:</strong> {report.total_income}</p>
                <p><strong>Total Discount Passengers:</strong> {report.total_discount_passengers}</p>
                <p><strong>Trip Count:</strong> {report.trip_count}</p>
              </section>

              <section>
                <h2>Popular Destinations</h2>
                <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr><th>Destination</th><th>Passenger Count</th><th>Total Fare</th></tr></thead>
                  <tbody>
                    {report.popular_destinations.map((destination) => (
                      <tr key={destination.destination_id}><td>{destination.destination_name}</td><td>{destination.passenger_count}</td><td>{destination.total_fare}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </article>
      ) : null}
    </div>
  )
}

export default AdminReportPage
