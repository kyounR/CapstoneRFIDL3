import { useEffect, useState } from 'react'
import api from '../api/client'

function getListData(data) {
  return Array.isArray(data) ? data : data.results || []
}

function TapTerminalPage() {
  const [destinations, setDestinations] = useState([])
  const [activeManifests, setActiveManifests] = useState([])
  const [selectedDestinationId, setSelectedDestinationId] = useState('')
  const [selectedManifestId, setSelectedManifestId] = useState('')
  const [currentSelection, setCurrentSelection] = useState(null)
  const [error, setError] = useState('')
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(true)
  const [isLoadingManifests, setIsLoadingManifests] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function fetchDestinations() {
      try {
        const response = await api.get('destinations/')
        if (isMounted) {
          setDestinations(getListData(response.data).filter((destination) => destination.is_active))
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.detail || 'Could not load destinations.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingDestinations(false)
        }
      }
    }

    fetchDestinations()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function fetchActiveManifests() {
      try {
        const response = await api.get('manifests/', { params: { is_finalized: false } })
        if (isMounted) {
          setActiveManifests(getListData(response.data))
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.detail || 'Could not load active Travel Passes.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingManifests(false)
        }
      }
    }

    fetchActiveManifests()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    let hadSelection = false

    async function fetchCurrentSelection() {
      try {
        const response = await api.get('tap-destination/')
        if (isMounted) {
          if (hadSelection && response.data === null) {
            setSelectedDestinationId('')
            setSelectedManifestId('')
          }
          hadSelection = response.data !== null
          setCurrentSelection(response.data)
          setError('')
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.error || 'Could not load the tap destination.')
        }
      }
    }

    fetchCurrentSelection()
    const intervalId = setInterval(fetchCurrentSelection, 2000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  async function handleSetDestination(event) {
    event.preventDefault()
    setError('')
    setIsSaving(true)

    try {
      const response = await api.post('tap-destination/', {
        destination_id: Number(selectedDestinationId),
        manifest_trip_id: Number(selectedManifestId),
      })
      setCurrentSelection(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not set the tap destination.')
    } finally {
      setIsSaving(false)
    }
  }

  const selectedDestination = destinations.find((destination) => destination.id === Number(selectedDestinationId))
  const selectedManifest = activeManifests.find((manifest) => manifest.id === Number(selectedManifestId))

  return (
    <main style={{ maxWidth: '720px', margin: '40px auto', fontFamily: 'var(--font-body)' }}>
      <h1>Tap Terminal</h1>
      <form onSubmit={handleSetDestination} className="card">
        <label htmlFor="tapManifest">Travel Pass / vehicle</label>
        <select
          id="tapManifest"
          value={selectedManifestId}
          onChange={(event) => setSelectedManifestId(event.target.value)}
          className="input"
          style={{ display: 'block', width: '100%', marginTop: '8px' }}
          disabled={isLoadingManifests || isSaving}
          required
        >
          <option value="">{isLoadingManifests ? 'Loading active Travel Passes...' : 'Choose a vehicle'}</option>
          {activeManifests.map((manifest) => (
            <option key={manifest.id} value={manifest.id}>
              {manifest.vehicle_plate_number || manifest.vehicle} - {manifest.date}
            </option>
          ))}
        </select>
        <label htmlFor="tapDestination">Destination for next tap</label>
        <select
          id="tapDestination"
          value={selectedDestinationId}
          onChange={(event) => setSelectedDestinationId(event.target.value)}
          className="input"
          style={{ display: 'block', width: '100%', marginTop: '8px' }}
          disabled={isLoadingDestinations || isLoadingManifests || isSaving}
          required
        >
          <option value="">{isLoadingDestinations ? 'Loading destinations...' : 'Choose a destination'}</option>
          {destinations.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.destination_name} ({destination.base_fare})
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" style={{ marginTop: '16px' }} disabled={isSaving || !selectedDestinationId || !selectedManifestId}>
          {isSaving ? 'Setting...' : 'Set Destination'}
        </button>
        {selectedDestination ? <span className="numeric" style={{ marginLeft: '12px' }}>Fare: {selectedDestination.base_fare}</span> : null}
        {selectedManifest ? <p style={{ marginBottom: 0 }}>Vehicle: {selectedManifest.vehicle_plate_number || selectedManifest.vehicle}</p> : null}
      </form>

      {error ? (
        <p>
          <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
          {error}
        </p>
      ) : null}

      <section
        className="card"
        style={{
          marginTop: '24px',
          borderColor: currentSelection ? 'var(--success)' : 'var(--accent)',
          background: currentSelection ? 'rgba(47, 191, 158, 0.12)' : 'rgba(242, 169, 59, 0.12)',
        }}
      >
        <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>
          <span className={`status-dot ${currentSelection ? 'status-dot--success' : 'status-dot--pending'}`} style={{ marginRight: '10px' }} />
          {currentSelection ? (
            <>Ready for: {currentSelection.destination_name} <span className="numeric">({destinations.find((destination) => destination.id === currentSelection.destination_id)?.base_fare ?? 'fare unavailable'})</span> - Vehicle: {currentSelection.plate_number}</>
          ) : 'No destination selected -- choose one before the next tap'}
        </p>
      </section>
    </main>
  )
}

export default TapTerminalPage
