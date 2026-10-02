import { Fragment, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import SectionTabs from '../components/SectionTabs'
import api from '../api/client'

function getListData(data) {
  return Array.isArray(data) ? data : data.results || []
}

function formatDeduction(amount) {
  return Number(amount) > 0 ? `- ${amount}` : amount
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
  const [expandedRoundId, setExpandedRoundId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  async function fetchPickerData() {
    setIsLoading(true)
    setError('')
    try {
      const [availableResponse, driverResponse] = await Promise.all([
        api.get('remittances/available/'),
        api.get('drivers/?active_only=true'),
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
      setExpandedRoundId(null)
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

  function closeRoundExclusion(roundId) {
    setExpandedRoundId(null)
    setRoundRemovalReasons((currentReasons) => {
      const nextReasons = { ...currentReasons }
      delete nextReasons[roundId]
      return nextReasons
    })
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
        <SectionTabs activePath="/remittance" historyPath="/remittance/history" historyLabel="Ledger" compact />
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
          {selectedAvailable.assigned_driver_id && !differentDriver ? <p><strong>Driver:</strong> {selectedAvailable.assigned_driver_full_name}</p> : null}
          {!selectedAvailable.assigned_driver_id ? <p>No assigned driver. Select a driver below.</p> : null}
          {selectedAvailable.assigned_driver_id ? (
            <label style={{ display: 'block', margin: '12px 0' }}>
              <input type="checkbox" checked={differentDriver} onChange={(event) => setDifferentDriver(event.target.checked)} /> Different driver today
            </label>
          ) : null}
          {differentDriver || !selectedAvailable.assigned_driver_id ? (
            <>
              <label htmlFor="driver">Driver</label>
              <select id="driver" value={driverId} onChange={(event) => setDriverId(event.target.value)} required className="input" style={{ display: 'block', width: '100%', margin: '4px 0 12px' }}>
                <option value="">Select a driver</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}
              </select>
            </>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <h2 style={{ margin: 0 }}>{selectedAvailable?.departure_terminal_name || remittance.terminal} - {selectedAvailable?.plate_number || remittance.vehicle}</h2>
              <span className={`badge ${remittance.is_finalized ? 'badge--success' : 'badge--pending'}`}>{remittance.is_finalized ? 'Finalized' : 'In Progress'}</span>
            </div>
            <p style={{ marginBottom: remittance.substitute_fee != null ? '16px' : 0 }}><strong>Driver:</strong> {detailDriver?.full_name || remittance.driver} <span aria-hidden="true">&middot;</span> <strong>Date:</strong> {remittance.date}</p>
            {remittance.substitute_fee != null ? (
              <p style={{ paddingLeft: '12px', borderLeft: '3px solid var(--accent)' }}>
                Substitute driver — original assigned driver: {originalAssignedDriver?.full_name || remittance.original_assigned_driver}, fee: <span className="numeric">{remittance.substitute_fee}</span>
              </p>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h3>Dispatch Rounds</h3>
            {!remittance.is_finalized ? <button type="button" onClick={handleSyncRounds} disabled={busyAction !== ''} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 9px', fontSize: '0.85rem' }} aria-label="Sync from Travel Passes">
              {busyAction === 'sync-rounds' ? 'Syncing...' : <><RefreshCw size={15} aria-hidden="true" /> Sync</>}
            </button> : null}
          </div>
          {rounds.length > 0 ? (
            <div className="card" style={{ padding: 0, marginBottom: '12px', overflow: 'hidden' }}>
              <table className="table">
                <thead><tr><th>Round</th><th>Departed</th><th>Travel Pass</th><th>Dispatcher</th><th style={{ textAlign: 'right' }}>Amount</th>{!remittance.is_finalized ? <th>Action</th> : null}</tr></thead>
                <tbody>{rounds.map((round) => {
                  const isExclusionPanelOpen = expandedRoundId === round.id
                  const usesDifferentTerminal = round.departure_terminal != null && String(round.departure_terminal) !== String(remittance.terminal)
                  const travelPassLabel = round.source_trip ? `#${round.source_trip}` : 'Legacy'
                  return <Fragment key={round.id}>
                    <tr style={round.is_excluded ? { color: 'var(--text-secondary)', textDecoration: 'line-through' } : undefined}>
                      <td className="numeric">{round.round_number}</td>
                      <td className="numeric">{round.departure_time?.slice(0, 5) || '-'}</td>
                      <td>{travelPassLabel}{usesDifferentTerminal && round.departure_terminal_name ? ` - ${round.departure_terminal_name}` : ''}{round.is_excluded ? <span className="badge badge--neutral" style={{ marginLeft: '8px', textDecoration: 'none' }}>Excluded</span> : null}</td>
                      <td>{round.dispatcher_name ?? '--'}</td>
                      <td className="numeric" style={{ textAlign: 'right' }}>{round.amount}</td>
                      {!remittance.is_finalized ? <td>{round.is_excluded ? null : <button type="button" onClick={() => setExpandedRoundId(round.id)} disabled={busyAction !== ''} style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--accent)', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Exclude</button>}</td> : null}
                    </tr>
                    {isExclusionPanelOpen ? <tr><td colSpan="6" style={{ background: 'var(--bg-elevated)' }}>
                      <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Excluded rounds stay on record but don't count toward this remittance's totals.</p>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <input
                          type="text"
                          value={roundRemovalReasons[round.id] || ''}
                          onChange={(event) => setRoundRemovalReasons((currentReasons) => ({ ...currentReasons, [round.id]: event.target.value }))}
                          placeholder="Reason for exclusion"
                          aria-label={`Reason for excluding dispatch round ${round.round_number}`}
                          className="input"
                          style={{ minWidth: '220px', flex: 1 }}
                        />
                        <button type="button" onClick={() => handleRemoveRound(round)} disabled={busyAction !== '' || !(roundRemovalReasons[round.id] || '').trim()} className="btn-primary">{busyAction === `remove-round-${round.id}` ? 'Excluding...' : 'Confirm'}</button>
                        <button type="button" onClick={() => closeRoundExclusion(round.id)} disabled={busyAction !== ''} className="btn-secondary">Cancel</button>
                      </div>
                    </td></tr> : null}
                  </Fragment>
                })}</tbody>
              </table>
            </div>
          ) : busyAction === 'sync-rounds' ? <p>Syncing dispatch rounds...</p> : <p>No rounds added yet.</p>}

          <section className="card" style={{ maxWidth: '560px', marginTop: '20px' }}>
            <h3 style={{ marginTop: 0 }}>Statement</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px' }}><span>Gross (dispatch rounds)</span><span className="numeric">{remittance.gross}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px' }}><span>Terminal fee ({remittance.terminal_fee_percentage}%)</span><span className="numeric">{formatDeduction(remittance.terminal_fee)}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontWeight: 600 }}><span>Subtotal</span><span className="numeric">{remittance.subtotal}</span></div>
              {feeFields.map(([field, label]) => (
                <div key={field} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', color: 'var(--text-secondary)' }}><span>{label}</span><span className="numeric">{formatDeduction(remittance[field])}</span></div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', alignItems: 'baseline', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '1.35rem', fontWeight: 700 }}><span>Net pay</span><span className="numeric">{remittance.net_pay}</span></div>
              {remittance.substitute_fee != null ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}><span>Substitute fee (separate settlement)</span><span className="numeric">{remittance.substitute_fee}</span></div> : null}
            </div>
          </section>
          {!remittance.is_finalized ? <div className="card" style={{ position: 'sticky', bottom: 0, zIndex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', padding: '12px 16px' }}>
            <button type="button" onClick={handleFinalize} disabled={busyAction !== ''} className="btn-primary">Finalize Remittance</button>
            <button type="button" onClick={handleCancel} disabled={busyAction !== ''} className="btn-secondary">
              {busyAction === 'cancel' ? 'Canceling...' : 'Cancel Remittance'}
            </button>
          </div> : null}
        </section>
      ) : null}
    </div>
  )
}

export default DailyRemittancePage
