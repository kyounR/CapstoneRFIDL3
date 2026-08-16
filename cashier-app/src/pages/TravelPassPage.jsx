import { useEffect, useMemo, useState } from 'react'
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

function TravelPassPage() {
  const [vehicles, setVehicles] = useState([])
  const [destinations, setDestinations] = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [date, setDate] = useState(getToday())
  const [manifest, setManifest] = useState(null)
  const [entries, setEntries] = useState({})
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true)
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [showFinalizeForm, setShowFinalizeForm] = useState(false)
  const [departureTime, setDepartureTime] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchVehicles() {
      try {
        const response = await api.get('vehicles/')
        setVehicles(getListData(response.data))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load vehicles.')
      } finally {
        setIsLoadingVehicles(false)
      }
    }

    fetchVehicles()
  }, [])

  useEffect(() => {
    if (!manifest) {
      return
    }

    async function fetchDestinations() {
      setIsLoadingDestinations(true)
      setError('')

      try {
        const response = await api.get('destinations/')
        setDestinations(getListData(response.data))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load destinations.')
      } finally {
        setIsLoadingDestinations(false)
      }
    }

    fetchDestinations()
  }, [manifest])

  async function handleCreatePass(event) {
    event.preventDefault()
    setError('')
    setBusyAction('create')

    try {
      const response = await api.post('manifests/', {
        vehicle: Number(vehicleId),
        date,
      })
      setManifest(response.data)
      setEntries({})
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not create travel pass.')
    } finally {
      setBusyAction('')
    }
  }

  function updateEntry(entry) {
    setEntries((currentEntries) => ({
      ...currentEntries,
      [entry.destination]: entry,
    }))
  }

  async function handleTally(destination, passengerType, direction) {
    const actionKey = `${destination.id}-${passengerType}-${direction}`
    setError('')
    setBusyAction(actionKey)

    try {
      const endpoint = direction === 'add' ? 'manifest-entries/tally/' : 'manifest-entries/untally/'
      const response = await api.post(endpoint, {
        manifest_trip: manifest.id,
        destination: destination.id,
        passenger_type: passengerType,
      })
      updateEntry(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update tally.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleFinalize(event) {
    event.preventDefault()
    if (!departureTime) {
      setError('Departure time is required to finalize the travel pass.')
      return
    }

    setError('')
    setBusyAction('finalize')

    try {
      const response = await api.post(`manifests/${manifest.id}/finalize/`, {
        departure_time: departureTime,
      })
      setManifest(response.data.manifest_trip)

      const finalizedEntries = {}
      response.data.entries.forEach((entry) => {
        finalizedEntries[entry.destination] = entry
      })
      setEntries(finalizedEntries)
      setShowFinalizeForm(false)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not finalize travel pass.')
    } finally {
      setBusyAction('')
    }
  }

  function startNewPass() {
    setManifest(null)
    setEntries({})
    setVehicleId('')
    setDate(getToday())
    setDepartureTime('')
    setShowFinalizeForm(false)
    setError('')
  }

  const totals = useMemo(() => {
    return Object.values(entries).reduce(
      (currentTotals, entry) => ({
        passengerCount: currentTotals.passengerCount + entry.passenger_count,
        totalFare: currentTotals.totalFare + Number(entry.total_fare),
      }),
      { passengerCount: 0, totalFare: 0 },
    )
  }, [entries])

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === Number(vehicleId))
  const isFinalized = manifest?.is_finalized === true

  return (
    <div style={{ maxWidth: '900px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Travel Pass</h1>
      <p style={{ marginBottom: '16px' }}>
        <Link to="/topup">Back to top-up</Link>
        {' | '}
        <Link to="/travel-pass/history">Travel Pass History</Link>
      </p>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {!manifest ? (
        <form onSubmit={handleCreatePass}>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="vehicle">Vehicle</label>
            <select
              id="vehicle"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              style={{ display: 'block', width: '100%', padding: '8px', marginTop: '4px' }}
              required
              disabled={isLoadingVehicles || busyAction === 'create'}
            >
              <option value="">{isLoadingVehicles ? 'Loading vehicles...' : 'Select a vehicle'}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number} - {vehicle.route_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="travelPassDate">Date</label>
            <input
              id="travelPassDate"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              style={{ display: 'block', padding: '8px', marginTop: '4px' }}
              required
            />
          </div>

          <button type="submit" disabled={busyAction === 'create'} style={{ padding: '8px 14px' }}>
            {busyAction === 'create' ? 'Creating...' : 'Start Travel Pass'}
          </button>
        </form>
      ) : (
        <div>
          <div style={{ marginBottom: '20px', padding: '12px', border: '1px solid #ccc' }}>
            <h2 style={{ marginTop: 0 }}>
              {selectedVehicle?.plate_number || manifest.vehicle} - {manifest.date}
            </h2>
            {isFinalized ? (
              <p style={{ color: 'green', fontWeight: 'bold' }}>
                Finalized{manifest.departure_time ? ` at ${manifest.departure_time}` : ''}
                {manifest.finalized_at ? ` (${manifest.finalized_at})` : ''}
              </p>
            ) : (
              <p>Active and ready for boarding tally.</p>
            )}
          </div>

          {isLoadingDestinations ? <p>Loading destinations...</p> : null}
          {!isLoadingDestinations && destinations.length === 0 ? <p>No active destinations available.</p> : null}

          <div>
            {destinations.map((destination) => {
              const entry = entries[destination.id] || {
                passenger_count: 0,
                discount_count: 0,
                total_fare: '0.00',
              }
              const regularAddKey = `${destination.id}-regular-add`
              const discountAddKey = `${destination.id}-discount-add`
              const regularRemoveKey = `${destination.id}-regular-remove`
              const discountRemoveKey = `${destination.id}-discount-remove`

              return (
                <div key={destination.id} style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ccc' }}>
                  <h3 style={{ marginTop: 0 }}>{destination.destination_name}</h3>
                  <p>Fare: {destination.base_fare}</p>
                  <p>Passengers: {entry.passenger_count}</p>
                  <p>Discount passengers: {entry.discount_count}</p>
                  <p>Total fare: {entry.total_fare}</p>

                  {!isFinalized ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => handleTally(destination, 'regular', 'add')}
                        disabled={busyAction !== ''}
                        style={{ marginRight: '8px', padding: '6px 10px' }}
                      >
                        {busyAction === regularAddKey ? '...' : '+1 Regular'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTally(destination, 'regular', 'remove')}
                        disabled={entry.passenger_count - entry.discount_count <= 0 || busyAction !== ''}
                        style={{ marginRight: '8px', padding: '6px 10px' }}
                      >
                        {busyAction === regularRemoveKey ? '...' : '-1 Regular'}
                      </button>
                      {!destination.discount_exempt ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTally(destination, 'discount', 'add')}
                            disabled={busyAction !== ''}
                            style={{ marginRight: '8px', padding: '6px 10px' }}
                          >
                            {busyAction === discountAddKey ? '...' : '+1 Discount'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTally(destination, 'discount', 'remove')}
                            disabled={entry.discount_count <= 0 || busyAction !== ''}
                            style={{ padding: '6px 10px' }}
                          >
                            {busyAction === discountRemoveKey ? '...' : '-1 Discount'}
                          </button>
                        </>
                      ) : (
                        <span>No discount on this destination.</span>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: '20px', padding: '12px', borderTop: '2px solid #333' }}>
            <strong>Running tally:</strong> {totals.passengerCount} passengers, {totals.totalFare.toFixed(2)} total fare
          </div>

          {!isFinalized ? (
            showFinalizeForm ? (
              <form onSubmit={handleFinalize} style={{ marginTop: '16px' }}>
                <label htmlFor="departureTime">Departure time</label>
                <input
                  id="departureTime"
                  type="time"
                  value={departureTime}
                  onChange={(event) => setDepartureTime(event.target.value)}
                  style={{ marginLeft: '8px', padding: '6px' }}
                  required
                />
                <button type="submit" disabled={busyAction === 'finalize'} style={{ marginLeft: '8px', padding: '6px 10px' }}>
                  {busyAction === 'finalize' ? 'Finalizing...' : 'Confirm Finalize'}
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setShowFinalizeForm(true)} style={{ marginTop: '16px', padding: '8px 14px' }}>
                Finalize Travel Pass
              </button>
            )
          ) : (
            <button type="button" onClick={startNewPass} style={{ marginTop: '16px', padding: '8px 14px' }}>
              Start New Travel Pass
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default TravelPassPage
