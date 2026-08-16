import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

function getToday() {
  const currentDate = new Date()
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getListData(data) {
  return Array.isArray(data) ? data : data.results || []
}

function TravelPassHistoryPage() {
  const [date, setDate] = useState(getToday())
  const [travelPasses, setTravelPasses] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    async function fetchVehicles() {
      try {
        const response = await api.get('vehicles/')
        setVehicles(getListData(response.data))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load vehicles.')
      }
    }

    fetchVehicles()
  }, [])

  useEffect(() => {
    async function fetchTravelPasses() {
      if (!date) {
        return
      }

      setIsLoading(true)
      setError('')

      try {
        const response = await api.get('manifests/', { params: { date } })
        setTravelPasses(getListData(response.data))
        setExpandedId(null)
      } catch (requestError) {
        setTravelPasses([])
        setError(requestError.response?.data?.detail || 'Could not load Travel Pass history.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTravelPasses()
  }, [date])

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Travel Pass History</h1>
      <p style={{ marginBottom: '16px' }}>
        <Link to="/travel-pass">Travel Pass</Link>
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="historyDate">Date</label>
        <input
          id="historyDate"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          style={{ marginLeft: '8px', padding: '6px' }}
        />
      </div>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {isLoading ? <p>Loading Travel Pass history...</p> : null}

      {!isLoading && !error && travelPasses.length === 0 ? (
        <p>No Travel Passes recorded for this date.</p>
      ) : null}

      {!isLoading && travelPasses.length > 0 ? (
        <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Cashier</th>
              <th>Departure</th>
              <th>Total Passengers</th>
              <th>Total Fare</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {travelPasses.map((travelPass) => {
              const isExpanded = expandedId === travelPass.id
              const vehicle = vehicles.find((item) => item.id === travelPass.vehicle)

              return (
                <Fragment key={travelPass.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : travelPass.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{vehicle?.plate_number || travelPass.vehicle}</td>
                    <td>{travelPass.cashier_username || travelPass.cashier}</td>
                    <td>{travelPass.departure_time || 'Not yet finalized'}</td>
                    <td>{travelPass.total_passengers}</td>
                    <td>{travelPass.total_fare}</td>
                    <td>
                      <span style={{ color: travelPass.is_finalized ? 'green' : '#9a6700' }}>
                        {travelPass.is_finalized ? 'Finalized' : 'In Progress'}
                      </span>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr>
                      <td colSpan="6">
                        <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
                          <thead>
                            <tr>
                              <th>Destination</th>
                              <th>Passenger Count</th>
                              <th>Discount Count</th>
                              <th>Total Fare</th>
                            </tr>
                          </thead>
                          <tbody>
                            {travelPass.entries?.length ? (
                              travelPass.entries.map((entry) => (
                                <tr key={`${travelPass.id}-${entry.destination_name}`}>
                                  <td>{entry.destination_name}</td>
                                  <td>{entry.passenger_count}</td>
                                  <td>{entry.discount_count}</td>
                                  <td>{entry.total_fare}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="4">No entries recorded.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}

export default TravelPassHistoryPage
