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

function entriesByDestination(entries = []) {
  return entries.reduce((result, entry) => {
    result[entry.destination] = entry
    return result
  }, {})
}

function TravelPassPage() {
  const [pageState, setPageState] = useState(0)
  const [activePasses, setActivePasses] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [destinations, setDestinations] = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [date, setDate] = useState(getToday())
  const [manifest, setManifest] = useState(null)
  const [entries, setEntries] = useState({})
  const [isLoadingPicker, setIsLoadingPicker] = useState(true)
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true)
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [showFinalizeForm, setShowFinalizeForm] = useState(false)
  const [departureTime, setDepartureTime] = useState('')
  const [error, setError] = useState('')

  async function fetchActivePasses() {
    setIsLoadingPicker(true)
    setError('')
    try {
      const response = await api.get('manifests/', { params: { is_finalized: false } })
      setActivePasses(getListData(response.data))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load active Travel Passes.')
    } finally {
      setIsLoadingPicker(false)
    }
  }

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
    fetchActivePasses()
  }, [])

  useEffect(() => {
    if (pageState !== 2) {
      return
    }

    async function fetchDestinations() {
      setIsLoadingDestinations(true)
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
  }, [pageState])

  async function selectManifest(selectedManifest) {
    setManifest(selectedManifest)
    setEntries(entriesByDestination(selectedManifest.entries))
    setDepartureTime(selectedManifest.departure_time || '')
    setShowFinalizeForm(false)
    setError('')
    setPageState(2)

    try {
      const response = await api.get('manifest-entries/', {
        params: { manifest_trip: selectedManifest.id },
      })
      setEntries(entriesByDestination(getListData(response.data)))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load Travel Pass entries.')
    }
  }

  async function handleCreatePass(event) {
    event.preventDefault()
    setError('')
    setBusyAction('create')
    try {
      const response = await api.post('manifests/', { vehicle: Number(vehicleId), date })
      selectManifest(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not create Travel Pass.')
    } finally {
      setBusyAction('')
    }
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
      setEntries((currentEntries) => ({ ...currentEntries, [response.data.destination]: response.data }))
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update tally.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleFinalize(event) {
    event.preventDefault()
    if (!departureTime) {
      setError('Departure time is required to finalize the Travel Pass.')
      return
    }
    setError('')
    setBusyAction('finalize')
    try {
      const response = await api.post(`manifests/${manifest.id}/finalize/`, { departure_time: departureTime })
      setManifest(response.data.manifest_trip)
      setEntries(entriesByDestination(response.data.entries))
      setShowFinalizeForm(false)
      setPageState(0)
      await fetchActivePasses()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not finalize Travel Pass.')
    } finally {
      setBusyAction('')
    }
  }

  function switchVehicle() {
    setManifest(null)
    setEntries({})
    setShowFinalizeForm(false)
    setError('')
    setPageState(0)
    fetchActivePasses()
  }

  const totals = useMemo(() => Object.values(entries).reduce(
    (result, entry) => ({
      passengerCount: result.passengerCount + entry.passenger_count,
      totalFare: result.totalFare + Number(entry.total_fare),
    }),
    { passengerCount: 0, totalFare: 0 },
  ), [entries])

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === Number(manifest?.vehicle || vehicleId))
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

      {pageState === 0 ? (
        <section>
          <h2>Active Travel Passes</h2>
          {isLoadingPicker ? <p>Loading active Travel Passes...</p> : null}
          {!isLoadingPicker && activePasses.length === 0 ? <p>No active Travel Passes. Start a new one below.</p> : null}
          {activePasses.map((activePass) => {
            const vehicle = vehicles.find((item) => item.id === activePass.vehicle)
            return (
              <button key={activePass.id} type="button" onClick={() => selectManifest(activePass)} style={{ display: 'block', width: '100%', marginBottom: '10px', padding: '12px', textAlign: 'left' }}>
                <strong>{vehicle?.plate_number || activePass.vehicle}</strong>
                <span> - {activePass.date} - {activePass.total_passengers} passengers</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setPageState(1)} style={{ padding: '8px 14px' }}>
            Start New Travel Pass
          </button>
        </section>
      ) : null}

      {pageState === 1 ? (
        <form onSubmit={handleCreatePass}>
          <h2>Start New Travel Pass</h2>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} style={{ display: 'block', width: '100%', padding: '8px', marginTop: '4px' }} required disabled={isLoadingVehicles || busyAction === 'create'}>
              <option value="">{isLoadingVehicles ? 'Loading vehicles...' : 'Select a vehicle'}</option>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number} - {vehicle.route_name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="travelPassDate">Date</label>
            <input id="travelPassDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ display: 'block', padding: '8px', marginTop: '4px' }} required />
          </div>
          <button type="submit" disabled={busyAction === 'create'} style={{ padding: '8px 14px' }}>{busyAction === 'create' ? 'Creating...' : 'Start Travel Pass'}</button>
          <button type="button" onClick={() => setPageState(0)} style={{ marginLeft: '8px', padding: '8px 14px' }}>Cancel</button>
        </form>
      ) : null}

      {pageState === 2 && manifest ? (
        <section>
          <button type="button" onClick={switchVehicle} style={{ marginBottom: '12px', padding: '6px 10px' }}>Switch Vehicle</button>
          <div style={{ marginBottom: '20px', padding: '12px', border: '1px solid #ccc' }}>
            <h2 style={{ marginTop: 0 }}>{selectedVehicle?.plate_number || manifest.vehicle} - {manifest.date}</h2>
            {isFinalized ? <p style={{ color: 'green', fontWeight: 'bold' }}>Finalized{manifest.departure_time ? ` at ${manifest.departure_time}` : ''}{manifest.finalized_at ? ` (${manifest.finalized_at})` : ''}</p> : <p>Active and ready for boarding tally.</p>}
          </div>
          {isLoadingDestinations ? <p>Loading destinations...</p> : null}
          {destinations.map((destination) => {
            const entry = entries[destination.id] || { passenger_count: 0, discount_count: 0, total_fare: '0.00' }
            const atCapacity = destination.capacity_limit != null && entry.passenger_count >= destination.capacity_limit
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
                {atCapacity ? <p style={{ color: '#9a6700' }}>At capacity ({entry.passenger_count}/{destination.capacity_limit}) for this vehicle — tally additional passengers heading here under the NEXT vehicle&apos;s Travel Pass instead. <button type="button" onClick={switchVehicle} style={{ padding: '4px 8px' }}>Switch Vehicle</button></p> : null}
                {!isFinalized ? <div>
                  <button type="button" onClick={() => handleTally(destination, 'regular', 'add')} disabled={busyAction !== ''} style={{ marginRight: '8px', padding: '6px 10px' }}>{busyAction === regularAddKey ? '...' : '+1 Regular'}</button>
                  <button type="button" onClick={() => handleTally(destination, 'regular', 'remove')} disabled={entry.passenger_count - entry.discount_count <= 0 || busyAction !== ''} style={{ marginRight: '8px', padding: '6px 10px' }}>{busyAction === regularRemoveKey ? '...' : '-1 Regular'}</button>
                  {!destination.discount_exempt ? <>
                    <button type="button" onClick={() => handleTally(destination, 'discount', 'add')} disabled={busyAction !== ''} style={{ marginRight: '8px', padding: '6px 10px' }}>{busyAction === discountAddKey ? '...' : '+1 Discount'}</button>
                    <button type="button" onClick={() => handleTally(destination, 'discount', 'remove')} disabled={entry.discount_count <= 0 || busyAction !== ''} style={{ padding: '6px 10px' }}>{busyAction === discountRemoveKey ? '...' : '-1 Discount'}</button>
                  </> : <span>No discount on this destination.</span>}
                </div> : null}
              </div>
            )
          })}
          <div style={{ marginTop: '20px', padding: '12px', borderTop: '2px solid #333' }}><strong>Running tally:</strong> {totals.passengerCount} passengers, {totals.totalFare.toFixed(2)} total fare</div>
          {!isFinalized ? (showFinalizeForm ? <form onSubmit={handleFinalize} style={{ marginTop: '16px' }}>
            <label htmlFor="departureTime">Departure time</label>
            <input id="departureTime" type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} style={{ marginLeft: '8px', padding: '6px' }} required />
            <button type="submit" disabled={busyAction === 'finalize'} style={{ marginLeft: '8px', padding: '6px 10px' }}>{busyAction === 'finalize' ? 'Finalizing...' : 'Confirm Finalize'}</button>
          </form> : <button type="button" onClick={() => setShowFinalizeForm(true)} style={{ marginTop: '16px', padding: '8px 14px' }}>Finalize Travel Pass</button>) : null}
        </section>
      ) : null}
    </div>
  )
}

export default TravelPassPage
