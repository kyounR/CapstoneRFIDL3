import { useEffect, useState } from 'react'
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

const feeFields = [
  ['ps_fee', 'PS Fee'],
  ['water_fee', 'Water Fee'],
  ['dispatcher_collection_fee', 'Dispatcher Collection Fee'],
  ['ftb', 'FTB'],
  ['savings', 'Savings'],
  ['trust_fund', 'Trust Fund'],
]

function DailyRemittancePage() {
  const [pageState, setPageState] = useState(0)
  const [remittances, setRemittances] = useState([])
  const [terminals, setTerminals] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [dispatchers, setDispatchers] = useState([])
  const [terminalId, setTerminalId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [dispatcherName, setDispatcherName] = useState('')
  const [date, setDate] = useState(getToday())
  const [substituteFee, setSubstituteFee] = useState('')
  const [remittance, setRemittance] = useState(null)
  const [rounds, setRounds] = useState([])
  const [roundRemovalReasons, setRoundRemovalReasons] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  async function fetchPickerData() {
    setIsLoading(true)
    setError('')
    try {
      const [remittanceResponse, terminalResponse, vehicleResponse, driverResponse, dispatcherResponse] = await Promise.all([
        api.get('remittances/', { params: { is_finalized: false } }),
        api.get('terminals/'),
        api.get('vehicles/?active_only=true'),
        api.get('drivers/'),
        api.get('dispatchers/'),
      ])
      setRemittances(getListData(remittanceResponse.data))
      setTerminals(getListData(terminalResponse.data))
      setVehicles(getListData(vehicleResponse.data))
      setDrivers(getListData(driverResponse.data))
      setDispatchers(getListData(dispatcherResponse.data))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load remittance data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPickerData()
  }, [])

  function resetForm() {
    setTerminalId('')
    setVehicleId('')
    setDriverId('')
    setDispatcherName('')
    setSubstituteFee('')
    setDate(getToday())
  }

  function handleVehicleChange(event) {
    const selectedId = event.target.value
    setVehicleId(selectedId)
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === Number(selectedId))
    setDriverId(selectedVehicle?.assigned_driver || '')
    setSubstituteFee('')
  }

  function selectRemittance(selectedRemittance) {
    setRemittance(selectedRemittance)
    setPageState(2)
  }

  async function loadRemittanceDetails(remittanceId) {
    setError('')
    try {
      const [remittanceResponse, roundsResponse] = await Promise.all([
        api.get(`remittances/${remittanceId}/`),
        api.get(`remittances/${remittanceId}/rounds/`),
      ])
      setRemittance(remittanceResponse.data)
      setRounds(getListData(roundsResponse.data))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load remittance details.')
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    setBusyAction('create')
    setError('')
    const payload = { terminal: Number(terminalId), vehicle: Number(vehicleId), driver: Number(driverId), dispatcher: Number(dispatcherName), date }
    if (substituteFee !== '') payload.substitute_fee = substituteFee
    try {
      const response = await api.post('remittances/', payload)
      await fetchPickerData()
      selectRemittance(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not create remittance.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSyncRounds() {
    setBusyAction('sync-rounds')
    setError('')
    try {
      await api.post(`remittances/${remittance.id}/sync-rounds/`)
      await loadRemittanceDetails(remittance.id)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not sync dispatch rounds.')
    } finally {
      setBusyAction('')
    }
  }

  useEffect(() => {
    if (pageState !== 2 || !remittance?.id) return undefined

    let cancelled = false
    async function syncOnEntry() {
      setBusyAction('sync-rounds')
      setError('')
      try {
        await api.post(`remittances/${remittance.id}/sync-rounds/`)
        if (!cancelled) await loadRemittanceDetails(remittance.id)
      } catch (requestError) {
        if (!cancelled) setError(requestError.response?.data?.error || 'Could not sync dispatch rounds.')
      } finally {
        if (!cancelled) setBusyAction('')
      }
    }

    syncOnEntry()
    return () => {
      cancelled = true
    }
  }, [pageState, remittance?.id])

  async function handleRemoveRound(round) {
    const reason = roundRemovalReasons[round.id] || ''
    if (!reason.trim()) {
      setError('A non-empty reason is required.')
      return
    }

    setBusyAction(`remove-round-${round.id}`)
    setError('')
    try {
      await api.delete(`remittances/${remittance.id}/rounds/${round.id}/`, {
        data: { reason: reason.trim() },
      })
      await loadRemittanceDetails(remittance.id)
      setRoundRemovalReasons((currentReasons) => {
        const nextReasons = { ...currentReasons }
        delete nextReasons[round.id]
        return nextReasons
      })
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not remove dispatch round.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleFinalize() {
    if (!window.confirm('Finalize this remittance? It cannot be edited afterward.')) return
    setBusyAction('finalize')
    setError('')
    try {
      await api.post(`remittances/${remittance.id}/finalize/`)
      setPageState(0)
      setRemittance(null)
      setRounds([])
      resetForm()
      await fetchPickerData()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not finalize remittance.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleCancel() {
    const roundCount = rounds.length
    const confirmationMessage = roundCount > 0
      ? `This remittance has ${roundCount} dispatch rounds already added. Canceling will permanently delete this record. Are you sure?`
      : 'Cancel this remittance?'

    if (!window.confirm(confirmationMessage)) return

    setBusyAction('cancel')
    setError('')
    try {
      await api.post(`remittances/${remittance.id}/cancel/`)
      setPageState(0)
      setRemittance(null)
      setRounds([])
      resetForm()
      await fetchPickerData()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not cancel remittance.')
    } finally {
      setBusyAction('')
    }
  }

  function switchRemittance() {
    setPageState(0)
    setRemittance(null)
    setRounds([])
    setError('')
    fetchPickerData()
  }

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === Number(vehicleId))
  const isSubstitution = selectedVehicle?.assigned_driver && selectedVehicle.assigned_driver !== Number(driverId)
  const detailVehicle = vehicles.find((vehicle) => vehicle.id === remittance?.vehicle)
  const detailDriver = drivers.find((driver) => driver.id === remittance?.driver)
  const originalAssignedDriver = drivers.find((driver) => driver.id === remittance?.original_assigned_driver)
  const detailTerminal = terminals.find((terminal) => terminal.id === remittance?.terminal)
  const detailDispatcher = dispatchers.find((dispatcher) => dispatcher.id === remittance?.dispatcher)

  return (
    <div style={{ width: '100%', maxWidth: '1600px', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Daily Remittance</h1>
        <SectionTabs activePath="/remittance" historyPath="/remittance/history" compact />
      </div>
      {error ? (
        <p>
          <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
          {error}
        </p>
      ) : null}

      {pageState === 0 ? (
        <section>
          <h2>Active Remittances</h2>
          {isLoading ? <p>Loading remittances...</p> : null}
          {!isLoading && remittances.length === 0 ? <p>No active remittances. Start a new one below.</p> : null}
          {remittances.map((item) => {
            const vehicle = vehicles.find((entry) => entry.id === item.vehicle)
            const driver = drivers.find((entry) => entry.id === item.driver)
            return <button key={item.id} type="button" onClick={() => selectRemittance(item)} className="card" style={{ display: 'block', width: '100%', marginBottom: '10px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)' }}><strong>{driver?.full_name || item.driver}</strong> - {vehicle?.plate_number || item.vehicle} - {item.date}</button>
          })}
          <button type="button" onClick={() => setPageState(1)} className="btn-primary">Start New Remittance</button>
        </section>
      ) : null}

      {pageState === 1 ? (
        <form onSubmit={handleCreate} className="card">
          <h2 style={{ marginTop: 0 }}>Start New Remittance</h2>
          <label htmlFor="terminal">Terminal</label>
          <select id="terminal" value={terminalId} onChange={(event) => setTerminalId(event.target.value)} required className="input" style={{ display: 'block', width: '100%', margin: '4px 0 12px' }}>
            <option value="">Select a terminal</option>
            {terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}
          </select>
          <label htmlFor="vehicle">Vehicle</label>
          <select id="vehicle" value={vehicleId} onChange={handleVehicleChange} required className="input" style={{ display: 'block', width: '100%', margin: '4px 0 12px' }}>
            <option value="">Select a vehicle</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number} - {vehicle.line_name}</option>)}
          </select>
          <label htmlFor="driver">Driver</label>
          <select id="driver" value={driverId} onChange={(event) => setDriverId(event.target.value)} required className="input" style={{ display: 'block', width: '100%', margin: '4px 0 12px' }}>
            <option value="">Select a driver</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}
          </select>
          {isSubstitution ? (
            <div style={{ marginBottom: '12px', paddingLeft: '12px', borderLeft: '3px solid var(--accent)' }}>
              <label htmlFor="substituteFee">Substitute fee</label>
              <input id="substituteFee" type="number" min="0" step="0.01" value={substituteFee} onChange={(event) => setSubstituteFee(event.target.value)} className="input numeric" style={{ display: 'block', marginTop: '4px' }} />
              <p>Fee owed by the substitute driver to the assigned driver.</p>
            </div>
          ) : null}
          <label htmlFor="dispatcher">Dispatcher</label>
          <select id="dispatcher" value={dispatcherName} onChange={(event) => setDispatcherName(event.target.value)} required className="input" style={{ display: 'block', width: '100%', margin: '4px 0 12px' }}>
            <option value="">Select a dispatcher</option>
            {dispatchers.map((dispatcher) => <option key={dispatcher.id} value={dispatcher.id}>{dispatcher.full_name}</option>)}
          </select>
          <label htmlFor="remittanceDate">Date</label>
          <input id="remittanceDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="input" style={{ display: 'block', margin: '4px 0 12px' }} />
          <button type="submit" disabled={busyAction === 'create'} className="btn-primary">{busyAction === 'create' ? 'Creating...' : 'Start Remittance'}</button>
          <button type="button" onClick={() => setPageState(0)} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
        </form>
      ) : null}

      {pageState === 2 && remittance ? (
        <section>
          <button type="button" onClick={switchRemittance} className="btn-secondary" style={{ marginBottom: '12px' }}>Back to Remittances</button>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginTop: 0 }}>{detailTerminal?.name || remittance.terminal} - {detailVehicle?.plate_number || remittance.vehicle}</h2>
            <p><strong>Driver:</strong> {detailDriver?.full_name || remittance.driver}</p>
            <p><strong>Dispatcher:</strong> {detailDispatcher?.full_name || remittance.dispatcher}</p>
            <p><strong>Date:</strong> {remittance.date}</p>
            <span className={`badge ${remittance.is_finalized ? 'badge--success' : 'badge--pending'}`}>{remittance.is_finalized ? 'Finalized' : 'In Progress'}</span>
            {detailVehicle?.is_light_vehicle ? <span className="badge badge--pending">Light vehicle</span> : null}
            {remittance.substitute_fee != null ? (
              <p style={{ paddingLeft: '12px', borderLeft: '3px solid var(--accent)' }}>
                Substitute driver — original assigned driver: {originalAssignedDriver?.full_name || remittance.original_assigned_driver}, fee: <span className="numeric">{remittance.substitute_fee}</span>
              </p>
            ) : null}
          </div>

          <h3>Dispatch Rounds</h3>
          {rounds.length > 0 ? (
            <div className="card" style={{ padding: 0, marginBottom: '12px', overflow: 'hidden' }}>
              <table className="table">
                <thead><tr><th>Round</th><th>Amount</th><th>Departure Time</th><th>Source</th>{!remittance.is_finalized ? <th>Action</th> : null}</tr></thead>
                <tbody>{rounds.map((round) => <tr key={round.id} style={round.is_excluded ? { color: 'var(--text-secondary)', textDecoration: 'line-through' } : undefined}>
                  <td className="numeric">{round.round_number}</td>
                  <td className="numeric">{round.amount}</td>
                  <td className="numeric">{round.departure_time}</td>
                  <td>{round.is_excluded ? <span className="badge badge--pending" style={{ textDecoration: 'none' }}>Excluded</span> : <>{round.source_trip ? `Auto-generated from Travel Pass #${round.source_trip}` : 'Legacy manual round'}{round.departure_terminal_name ? ` - ${round.departure_terminal_name}` : ''}</>}</td>
                  {!remittance.is_finalized ? <td>
                    {round.is_excluded ? null : <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '280px' }}>
                      <input
                        type="text"
                        value={roundRemovalReasons[round.id] || ''}
                        onChange={(event) => setRoundRemovalReasons((currentReasons) => ({ ...currentReasons, [round.id]: event.target.value }))}
                        placeholder="Reason for removal"
                        aria-label={`Reason for removing dispatch round ${round.round_number}`}
                        className="input"
                        style={{ minWidth: 0, flex: 1 }}
                      />
                      <button type="button" onClick={() => handleRemoveRound(round)} disabled={busyAction !== '' || !(roundRemovalReasons[round.id] || '').trim()} className="btn-secondary">
                        {busyAction === `remove-round-${round.id}` ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                    {!(roundRemovalReasons[round.id] || '').trim() ? <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Enter a reason to enable removal</span> : null}
                    </>}
                  </td> : null}
                </tr>)}</tbody>
              </table>
            </div>
          ) : <p>No rounds added yet.</p>}
          {!remittance.is_finalized ? (
            <div className="card" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              <span>Sync finalized Travel Passes for this vehicle, date, and terminal.</span>
              <button type="button" onClick={handleSyncRounds} disabled={busyAction !== ''} className="btn-primary">{busyAction === 'sync-rounds' ? 'Syncing...' : 'Sync Dispatch Rounds'}</button>
            </div>
          ) : null}

          <h3>Computed Figures</h3>
          <div className="numeric" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', marginBottom: '20px' }}>
            <span>Gross: {remittance.gross}</span>
            <span aria-hidden="true">·</span>
            <span>Terminal Fee ({remittance.terminal_fee_percentage}%): {remittance.terminal_fee}</span>
            <span aria-hidden="true">·</span>
            <span>Subtotal: {remittance.subtotal}</span>
            <span aria-hidden="true">·</span>
            <span>Net Pay: {remittance.net_pay}</span>
          </div>

          <h3>Fees</h3>
          <p className="numeric"><strong>Terminal Fee:</strong> {remittance.terminal_fee} (computed)</p>
          {feeFields.map(([field, label]) => (
            <p key={field} className="numeric"><strong>{label}:</strong> {remittance[field]}</p>
          ))}
          {!remittance.is_finalized ? <>
            <button type="button" onClick={handleFinalize} disabled={busyAction !== ''} className="btn-primary" style={{ marginTop: '20px' }}>Finalize Remittance</button>
            <button type="button" onClick={handleCancel} disabled={busyAction !== ''} className="btn-secondary" style={{ marginTop: '20px', marginLeft: '8px' }}>
              {busyAction === 'cancel' ? 'Canceling...' : 'Cancel Remittance'}
            </button>
          </> : null}
        </section>
      ) : null}
    </div>
  )
}

export default DailyRemittancePage
