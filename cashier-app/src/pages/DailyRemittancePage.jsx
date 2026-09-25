import { useEffect, useState } from 'react'
import SectionTabs from '../components/SectionTabs'
import api from '../api/client'

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
  const [availableEntries, setAvailableEntries] = useState([])
  const [drivers, setDrivers] = useState([])
  const [driverId, setDriverId] = useState('')
  const [substituteFee, setSubstituteFee] = useState('')
  const [selectedAvailable, setSelectedAvailable] = useState(null)
  const [differentDriver, setDifferentDriver] = useState(false)
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
      const [availableResponse, driverResponse] = await Promise.all([
        api.get('remittances/available/'),
        api.get('drivers/'),
      ])
      setAvailableEntries(getListData(availableResponse.data))
      setDrivers(getListData(driverResponse.data))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load remittance data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPickerData()
  }, [])

  function resetCreateForm() {
    setDriverId('')
    setSubstituteFee('')
    setSelectedAvailable(null)
    setDifferentDriver(false)
  }

  async function selectAvailable(entry) {
    setError('')
    setSelectedAvailable(entry)
    if (entry.remittance_id) {
      try {
        await loadRemittanceDetails(entry.remittance_id)
        setPageState(2)
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load remittance details.')
      }
      return
    }

    setDriverId(entry.assigned_driver_id ? String(entry.assigned_driver_id) : '')
    setDifferentDriver(false)
    setSubstituteFee('')
    setPageState(1)
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
      throw requestError
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    setBusyAction('create')
    setError('')
    if (!selectedAvailable || !driverId) {
      setError('Select a driver before creating the remittance.')
      setBusyAction('')
      return
    }
    const payload = {
      terminal: selectedAvailable.departure_terminal_id,
      vehicle: selectedAvailable.vehicle_id,
      driver: Number(driverId),
      date: selectedAvailable.date,
    }
    if (differentDriver && substituteFee !== '') payload.substitute_fee = substituteFee
    try {
      const response = await api.post('remittances/', payload)
      await fetchPickerData()
      setRemittance(response.data)
      setPageState(2)
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
      if (remittance?.is_finalized) return
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
      resetCreateForm()
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
      ? `This remittance has ${roundCount} dispatch rounds already added. Cancelling will mark it as cancelled and remove it from active remittances; the record itself is preserved. Are you sure?`
      : 'Cancel this remittance?'

    if (!window.confirm(confirmationMessage)) return

    setBusyAction('cancel')
    setError('')
    try {
      await api.post(`remittances/${remittance.id}/cancel/`)
      setPageState(0)
      setRemittance(null)
      setRounds([])
      resetCreateForm()
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
    resetCreateForm()
    setError('')
    fetchPickerData()
  }

  const detailDriver = drivers.find((driver) => driver.id === remittance?.driver)
  const originalAssignedDriver = drivers.find((driver) => driver.id === remittance?.original_assigned_driver)

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
          <h2>Available Remittances</h2>
          {isLoading ? <p>Loading available remittances...</p> : null}
          {!isLoading && availableEntries.length === 0 ? <p>No available finalized Travel Passes.</p> : null}
          {availableEntries.map((entry) => (
            <button key={`${entry.vehicle_id}-${entry.date}-${entry.departure_terminal_id}`} type="button" onClick={() => selectAvailable(entry)} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', marginBottom: '10px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <span><strong>{entry.plate_number}</strong> - {entry.date} - {entry.departure_terminal_name} - <span className="numeric">{entry.gross}</span></span>
              <span className={`badge ${entry.status === 'in_progress' ? 'badge--pending' : 'badge--success'}`}>{entry.status === 'in_progress' ? 'In Progress' : 'Not Started'}</span>
            </button>
          ))}
        </section>
      ) : null}

      {pageState === 1 && selectedAvailable ? (
        <form onSubmit={handleCreate} className="card">
          <h2 style={{ marginTop: 0 }}>Start New Remittance</h2>
          <p><strong>Vehicle:</strong> {selectedAvailable.plate_number}</p>
          <p><strong>Terminal:</strong> {selectedAvailable.departure_terminal_name}</p>
          <p><strong>Date:</strong> {selectedAvailable.date}</p>
          <label htmlFor="driver">Driver</label>
          {selectedAvailable.assigned_driver_id && !differentDriver ? <p>{selectedAvailable.assigned_driver_full_name}</p> : null}
          {!selectedAvailable.assigned_driver_id ? <p>No assigned driver. Select a driver below.</p> : null}
          {selectedAvailable.assigned_driver_id ? (
            <label style={{ display: 'block', margin: '12px 0' }}>
              <input type="checkbox" checked={differentDriver} onChange={(event) => setDifferentDriver(event.target.checked)} /> Different driver today
            </label>
          ) : null}
          {differentDriver || !selectedAvailable.assigned_driver_id ? (
            <select id="driver" value={driverId} onChange={(event) => setDriverId(event.target.value)} required className="input" style={{ display: 'block', width: '100%', margin: '4px 0 12px' }}>
              <option value="">Select a driver</option>
              {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}
            </select>
          ) : null}
          {selectedAvailable.assigned_driver_id && differentDriver ? (
            <div style={{ marginBottom: '12px', paddingLeft: '12px', borderLeft: '3px solid var(--accent)' }}>
              <label htmlFor="substituteFee">Substitute fee</label>
              <input id="substituteFee" type="number" min="0" step="0.01" value={substituteFee} onChange={(event) => setSubstituteFee(event.target.value)} className="input numeric" style={{ display: 'block', marginTop: '4px' }} />
              <p>Fee owed by the substitute driver to the assigned driver.</p>
            </div>
          ) : null}
          <button type="submit" disabled={busyAction === 'create'} className="btn-primary">{busyAction === 'create' ? 'Creating...' : 'Start Remittance'}</button>
          <button type="button" onClick={switchRemittance} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
        </form>
      ) : null}

      {pageState === 2 && remittance ? (
        <section>
          <button type="button" onClick={switchRemittance} className="btn-secondary" style={{ marginBottom: '12px' }}>Back to Remittances</button>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginTop: 0 }}>{selectedAvailable?.departure_terminal_name || remittance.terminal} - {selectedAvailable?.plate_number || remittance.vehicle}</h2>
            <p><strong>Driver:</strong> {detailDriver?.full_name || remittance.driver}</p>
            <p><strong>Date:</strong> {remittance.date}</p>
            <span className={`badge ${remittance.is_finalized ? 'badge--success' : 'badge--pending'}`}>{remittance.is_finalized ? 'Finalized' : 'In Progress'}</span>
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
          ) : busyAction === 'sync-rounds' ? <p>Syncing dispatch rounds...</p> : <p>No rounds added yet.</p>}
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
