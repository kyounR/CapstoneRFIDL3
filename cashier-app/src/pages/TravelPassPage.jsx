import { useEffect, useMemo, useState } from 'react'
import SectionTabs from '../components/SectionTabs'
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
  const [tapSelection, setTapSelection] = useState(null)
  const [recentTaps, setRecentTaps] = useState([])
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
        const response = await api.get('vehicles/?active_only=true')
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
        const response = await api.get('destinations/?active_only=true')
        setDestinations(getListData(response.data))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load destinations.')
      } finally {
        setIsLoadingDestinations(false)
      }
    }

    fetchDestinations()
  }, [pageState])

  useEffect(() => {
    if (pageState !== 2 || !manifest) {
      return
    }

    let isMounted = true

    async function pollAllBoardData() {
      try {
        const [tapSelResponse, recentTapsResponse, entriesResponse] = await Promise.all([
          api.get('tap-destination/'),
          api.get(`manifests/${manifest.id}/recent-taps/`),
          api.get('manifest-entries/', {
            params: { manifest_trip: manifest.id },
          }),
        ])

        if (isMounted) {
          // Update tap selection with manifest_trip_id guard
          const selection = tapSelResponse.data
          setTapSelection(selection?.manifest_trip_id === manifest.id ? selection : null)

          // Update recent taps and entries together (React batches into one render)
          setRecentTaps(getListData(recentTapsResponse.data))
          setEntries(entriesByDestination(getListData(entriesResponse.data)))
        }
      } catch (requestError) {
        // Silent fail for polling: retry on next cycle without interrupting
      }
    }

    pollAllBoardData()
    const intervalId = setInterval(pollAllBoardData, 3000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [pageState, manifest?.id])

  async function selectManifest(selectedManifest) {
    setManifest(selectedManifest)
    setEntries(entriesByDestination(selectedManifest.entries))
    setTapSelection(null)
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
      await fetchActivePasses()
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

  async function handleSetForTap(destination) {
    const actionKey = `${destination.id}-set-for-tap`
    setError('')
    setBusyAction(actionKey)
    try {
      const response = await api.post('tap-destination/', {
        destination_id: destination.id,
        manifest_trip_id: manifest.id,
      })
      setTapSelection(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not set the destination for tapping.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleClearTapSelection() {
    setError('')
    setBusyAction('clear-tap-selection')
    try {
      await api.delete('tap-destination/')
      setTapSelection(null)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not clear the tap destination.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleCancelBoarding(tap) {
    const confirmMessage = `Refund ${tap.fare_charged} to this card and remove this passenger from the tally? This cannot be undone.`
    if (!window.confirm(confirmMessage)) {
      return
    }

    const actionKey = `cancel-boarding-${tap.id}`
    setError('')
    setBusyAction(actionKey)
    try {
      await api.post(`tap-log/${tap.id}/cancel-boarding/`)
      setRecentTaps((currentTaps) => currentTaps.filter((t) => t.id !== tap.id))
      try {
        const response = await api.get('manifest-entries/', {
          params: { manifest_trip: manifest.id },
        })
        setEntries(entriesByDestination(getListData(response.data)))
      } catch (refreshError) {
        setError(refreshError.response?.data?.detail || 'Could not refresh tally after refund.')
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not cancel this boarding.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleFinalize(event) {
    if (!window.confirm('Finalize this Travel Pass? It cannot be edited afterward.')) return
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

  async function handleCancel() {
    const passengerCount = Object.values(entries).reduce(
      (total, entry) => total + entry.passenger_count,
      0,
    )
    const confirmationMessage = passengerCount > 0
      ? `This Travel Pass has ${passengerCount} passengers already tallied. Canceling will permanently delete this record. Are you sure?`
      : 'Cancel this Travel Pass?'

    if (!window.confirm(confirmationMessage)) {
      return
    }

    setError('')
    setBusyAction('cancel')
    try {
      await api.post(`manifests/${manifest.id}/cancel/`)
      setManifest(null)
      setEntries({})
      setShowFinalizeForm(false)
      setPageState(0)
      await fetchActivePasses()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not cancel Travel Pass.')
    } finally {
      setBusyAction('')
    }
  }

  function switchVehicle() {
    setManifest(null)
    setEntries({})
    setTapSelection(null)
    setRecentTaps([])
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

  const sortedActivePasses = useMemo(
    () => [...activePasses].sort((firstPass, secondPass) => firstPass.id - secondPass.id),
    [activePasses],
  )
  const selectedPassIndex = sortedActivePasses.findIndex((activePass) => activePass.id === manifest?.id)
  const selectedPassLabel = selectedPassIndex === 0 ? 'Primary' : `Next Vehicle (#${selectedPassIndex + 1})`

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === Number(manifest?.vehicle || vehicleId))
  const isFinalized = manifest?.is_finalized === true

  return (
    <div style={{ width: '100%', maxWidth: '1600px', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
      <h1>Travel Pass</h1>
      {pageState !== 2 ? <SectionTabs activePath="/travel-pass" historyPath="/travel-pass/history" /> : null}
      {error ? (
        <p>
          <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
          {error}
        </p>
      ) : null}

      {pageState === 0 ? (
        <section>
          <h2>Active Travel Passes</h2>
          {isLoadingPicker ? <p>Loading active Travel Passes...</p> : null}
          {!isLoadingPicker && activePasses.length === 0 ? <p>No active Travel Passes. Start a new one below.</p> : null}
          {sortedActivePasses.map((activePass, index) => {
            const vehicle = vehicles.find((item) => item.id === activePass.vehicle)
            return (
              <button key={activePass.id} type="button" onClick={() => selectManifest(activePass)} className="card" style={{ display: 'block', width: '100%', marginBottom: '10px', textAlign: 'left', cursor: 'pointer' }}>
                <strong>{vehicle?.plate_number || activePass.vehicle}</strong>
                <span className={`badge ${index === 0 ? 'badge--success' : 'badge--pending'}`} style={{ marginLeft: '8px' }}>{index === 0 ? 'Primary' : `Next Vehicle (#${index + 1})`}</span>
                <span> - {activePass.date} - <span className="numeric">{activePass.total_passengers}</span> passengers</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setPageState(1)} className="btn-primary">
            Start New Travel Pass
          </button>
        </section>
      ) : null}

      {pageState === 1 ? (
        <form onSubmit={handleCreatePass} className="card">
          <h2 style={{ marginTop: 0 }}>Start New Travel Pass</h2>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required disabled={isLoadingVehicles || busyAction === 'create'}>
              <option value="">{isLoadingVehicles ? 'Loading vehicles...' : 'Select a vehicle'}</option>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number} - {vehicle.line_name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="travelPassDate">Date</label>
            <input id="travelPassDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" style={{ display: 'block', marginTop: '4px' }} required />
          </div>
          <button type="submit" disabled={busyAction === 'create'} className="btn-primary">{busyAction === 'create' ? 'Creating...' : 'Start Travel Pass'}</button>
          <button type="button" onClick={() => setPageState(0)} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
        </form>
      ) : null}

      {pageState === 2 && manifest ? (
        <section>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 16px', marginBottom: '12px', flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, whiteSpace: 'nowrap' }}>
              <strong>{selectedVehicle?.plate_number || manifest.vehicle}</strong>
              <span className={`badge ${selectedPassIndex === 0 ? 'badge--success' : 'badge--pending'}`}>{selectedPassLabel}</span>
              <span>{manifest.date}</span>
              <span className={`badge ${isFinalized ? 'badge--success' : 'badge--pending'}`}>{isFinalized ? 'Finalized' : 'In Progress'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
              <button type="button" onClick={switchVehicle} className="btn-secondary" style={{ padding: '6px 10px' }}>Switch Vehicle</button>
              <SectionTabs activePath="/travel-pass" historyPath="/travel-pass/history" compact />
            </div>
          </div>
          {isLoadingDestinations ? <p>Loading destinations...</p> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
            {destinations.map((destination) => {
              const entry = entries[destination.id] || { passenger_count: 0, discount_count: 0, total_fare: '0.00' }
              const atCapacity = destination.capacity_limit != null && destination.capacity_limit > 0 && entry.passenger_count >= destination.capacity_limit
              const regularAddKey = `${destination.id}-regular-add`
              const discountAddKey = `${destination.id}-discount-add`
              const regularRemoveKey = `${destination.id}-regular-remove`
              const discountRemoveKey = `${destination.id}-discount-remove`
              const isSelectedForTap = tapSelection?.destination_id === destination.id
              const compactButtonStyle = { minWidth: '32px', height: '32px', padding: '0 8px' }
              return (
                <div key={destination.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderColor: isSelectedForTap ? 'var(--success)' : 'var(--border)', boxShadow: isSelectedForTap ? '0 0 0 2px rgba(47, 191, 158, 0.18)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                    <strong>{destination.destination_name}</strong>
                    <span className="numeric" style={{ whiteSpace: 'nowrap' }}>{destination.base_fare}</span>
                  </div>
                  {atCapacity ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="badge badge--danger">At capacity</span><button type="button" onClick={switchVehicle} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.8rem' }}>Switch</button></div> : null}
                  <div className="numeric" style={{ fontSize: '0.9rem' }}>Reg {entry.passenger_count - entry.discount_count} - Disc {entry.discount_count} - Total {entry.passenger_count}</div>
                  {isSelectedForTap ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--success)' }}><span className="badge badge--success">Tap armed</span><button type="button" onClick={handleClearTapSelection} disabled={busyAction !== ''} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>{busyAction === 'clear-tap-selection' ? 'Clearing...' : 'Clear'}</button></div> : null}
                  {!isFinalized ? <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ minWidth: '28px', fontSize: '0.8rem', fontWeight: 600 }}>Reg</span>
                      <button type="button" onClick={isSelectedForTap ? handleClearTapSelection : () => handleSetForTap(destination)} disabled={busyAction !== ''} className="btn-primary" style={{ ...compactButtonStyle, padding: 0 }} title="Tap" aria-label={isSelectedForTap ? `Clear ${destination.destination_name} tap selection` : `Set ${destination.destination_name} for next tap`}>
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                      </button>
                      <button type="button" onClick={() => handleTally(destination, 'regular', 'remove')} disabled={entry.passenger_count - entry.discount_count <= 0 || busyAction !== ''} className="btn-secondary" style={compactButtonStyle} aria-label={`Remove regular passenger from ${destination.destination_name}`}>{busyAction === regularRemoveKey ? '...' : '-'}</button>
                      <button type="button" onClick={() => handleTally(destination, 'regular', 'add')} disabled={busyAction !== ''} className="btn-primary" style={compactButtonStyle} aria-label={`Add regular passenger to ${destination.destination_name}`}>{busyAction === regularAddKey ? '...' : '+'}</button>
                    </div>
                    {!destination.discount_exempt ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '32px' }}>
                      <span style={{ minWidth: '28px', fontSize: '0.8rem', fontWeight: 600 }}>Disc</span>
                      <button type="button" onClick={() => handleTally(destination, 'discount', 'remove')} disabled={entry.discount_count <= 0 || busyAction !== ''} className="btn-secondary" style={compactButtonStyle} aria-label={`Remove discount passenger from ${destination.destination_name}`}>{busyAction === discountRemoveKey ? '...' : '-'}</button>
                      <button type="button" onClick={() => handleTally(destination, 'discount', 'add')} disabled={busyAction !== ''} className="btn-primary" style={compactButtonStyle} aria-label={`Add discount passenger to ${destination.destination_name}`}>{busyAction === discountAddKey ? '...' : '+'}</button>
                    </div> : <div aria-hidden="true" style={{ minHeight: '32px' }} />}
                  </> : <div aria-hidden="true" style={{ minHeight: '72px' }} />}
                </div>
              )
            })}
          </div>
          {!isFinalized && recentTaps.length > 0 ? (
            <details className="card" style={{ marginTop: '12px', padding: '10px 12px' }}>
              <summary className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>Cancel tap ({recentTaps.length})</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentTaps.map((tap) => (
                  <div key={tap.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', fontSize: '0.95rem' }}>
                    <div style={{ flex: 1 }}>
                      <span className="numeric" style={{ fontWeight: 600 }}>{tap.passenger_name || tap.card_uid}</span>
                      {' '} → <span>{tap.destination_name}</span>
                      {' '} · <span className="numeric">{tap.fare_charged}</span>
                      {' '} · <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{new Date(tap.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelBoarding(tap)}
                      disabled={busyAction !== ''}
                      className="btn-secondary"
                      style={{ marginLeft: '12px', padding: '4px 12px', fontSize: '0.9rem' }}
                    >
                        {busyAction === `cancel-boarding-${tap.id}` ? 'Canceling...' : 'Cancel this boarding'}
                      </button>
                    </div>
                  ))}
                </div>
            </details>
          ) : null}
          <div className="card" style={{ position: 'sticky', bottom: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px', padding: '12px 16px' }}>
            <div className="numeric"><strong>Running tally:</strong> {totals.passengerCount} passengers, {totals.totalFare.toFixed(2)} total fare{selectedVehicle?.passenger_capacity != null && selectedVehicle.passenger_capacity > 0 && totals.passengerCount >= selectedVehicle.passenger_capacity ? <span style={{ color: 'var(--danger)' }}> (vehicle at capacity)</span> : null}</div>
            {!isFinalized ? (showFinalizeForm ? <form onSubmit={handleFinalize} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="departureTime">Departure time</label>
              <input id="departureTime" type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} className="input" required />
              <button type="submit" disabled={busyAction === 'finalize'} className="btn-primary">{busyAction === 'finalize' ? 'Finalizing...' : 'Confirm Finalize'}</button>
            </form> : <div style={{ display: 'flex', gap: '8px', whiteSpace: 'nowrap' }}>
              <button type="button" onClick={() => setShowFinalizeForm(true)} className="btn-primary">Finalize Travel Pass</button>
              <button type="button" onClick={handleCancel} disabled={busyAction !== ''} className="btn-secondary">{busyAction === 'cancel' ? 'Canceling...' : 'Cancel Travel Pass'}</button>
            </div>) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default TravelPassPage
