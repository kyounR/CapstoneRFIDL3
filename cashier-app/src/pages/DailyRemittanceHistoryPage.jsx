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

const feeFields = [
  ['ps_fee', 'PS Fee'],
  ['water_fee', 'Water Fee'],
  ['dispatcher_collection_fee', 'Dispatcher Collection Fee'],
  ['ftb', 'FTB'],
  ['savings', 'Savings'],
  ['trust_fund', 'Trust Fund'],
]

function DailyRemittanceHistoryPage() {
  const [date, setDate] = useState(getToday())
  const [remittances, setRemittances] = useState([])
  const [terminals, setTerminals] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [dispatchers, setDispatchers] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [rounds, setRounds] = useState([])
  const [corrections, setCorrections] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [reason, setReason] = useState('')
  const [editError, setEditError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const isAdmin = localStorage.getItem('userRole') === 'admin'

  useEffect(() => {
    async function loadLookups() {
      try {
        const [terminalResponse, vehicleResponse, driverResponse, dispatcherResponse] = await Promise.all([
          api.get('terminals/'),
          api.get('vehicles/'),
          api.get('drivers/'),
          api.get('dispatchers/'),
        ])
        setTerminals(getListData(terminalResponse.data))
        setVehicles(getListData(vehicleResponse.data))
        setDrivers(getListData(driverResponse.data))
        setDispatchers(getListData(dispatcherResponse.data))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load remittance lookup data.')
      }
    }

    loadLookups()
  }, [])

  useEffect(() => {
    async function fetchRemittances() {
      if (!date) return
      setIsLoading(true)
      setError('')
      setExpandedId(null)
      setDetail(null)
      setCorrections([])
      try {
        const response = await api.get('remittances/', { params: { date } })
        setRemittances(getListData(response.data))
      } catch (requestError) {
        setRemittances([])
        setError(requestError.response?.data?.detail || 'Could not load remittance history.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRemittances()
  }, [date])

  async function loadDetail(remittanceId) {
    setIsLoadingDetail(true)
    setError('')
    try {
      const [remittanceResponse, roundsResponse, correctionsResponse] = await Promise.all([
        api.get(`remittances/${remittanceId}/`),
        api.get(`remittances/${remittanceId}/rounds/`),
        api.get(`remittances/${remittanceId}/corrections/`),
      ])
      setDetail(remittanceResponse.data)
      setRounds(getListData(roundsResponse.data))
      setCorrections(getListData(correctionsResponse.data))
      setRemittances((current) => current.map((item) => item.id === remittanceId ? { ...item, ...remittanceResponse.data } : item))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load remittance details.')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  function toggleDetail(remittanceId) {
    if (expandedId === remittanceId) {
      setExpandedId(null)
      setDetail(null)
      setRounds([])
      setCorrections([])
      setEditing(null)
      return
    }
    setExpandedId(remittanceId)
    setDetail(null)
    setRounds([])
    setCorrections([])
    setEditing(null)
    loadDetail(remittanceId)
  }

  function startEdit(type, id, field, value) {
    setEditing({ type, id, field })
    setEditValue(value ?? '')
    setReason('')
    setEditError('')
  }

  function cancelEdit() {
    setEditing(null)
    setEditValue('')
    setReason('')
    setEditError('')
  }

  async function saveEdit() {
    if (!reason.trim()) {
      setEditError('Reason for correction is required.')
      return
    }
    setIsSaving(true)
    setEditError('')
    const payload = { reason: reason.trim(), [editing.field]: editValue }
    if (editing.field === 'terminal' || editing.field === 'driver' || editing.field === 'dispatcher') payload[editing.field] = Number(editValue)

    try {
      const endpoint = editing.type === 'remittance'
        ? `remittances/${editing.id}/admin-correct/`
        : `dispatch-rounds/${editing.id}/admin-correct/`
      await api.post(endpoint, payload)
      cancelEdit()
      await loadDetail(expandedId)
    } catch (requestError) {
      setEditError(requestError.response?.data?.error || 'Could not save correction.')
    } finally {
      setIsSaving(false)
    }
  }

  function editButton(type, id, field, value) {
    if (!isAdmin || !detail?.is_finalized) return null
    return <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(type, id, field, value) }} style={{ marginLeft: '6px', padding: '3px 7px', fontSize: '0.85em' }}>Edit (Admin)</button>
  }

  function editControls(type, id, field, input) {
    if (!editing || editing.type !== type || editing.id !== id || editing.field !== field) return null
    return <div onClick={(event) => event.stopPropagation()} style={{ marginTop: '6px' }}>
      {input}
      <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for correction" required style={{ display: 'block', width: '100%', padding: '6px', marginTop: '6px' }} />
      {editError ? <p style={{ color: 'crimson' }}>{editError}</p> : null}
      <button type="button" onClick={saveEdit} disabled={!reason.trim() || isSaving} style={{ marginTop: '6px', padding: '6px 10px' }}>{isSaving ? 'Saving...' : 'Save Correction'}</button>
      <button type="button" onClick={cancelEdit} disabled={isSaving} style={{ marginLeft: '6px', padding: '6px 10px' }}>Cancel</button>
    </div>
  }

  function renderHeader(remittance) {
    const terminal = terminals.find((item) => item.id === remittance.terminal)
    const vehicle = vehicles.find((item) => item.id === remittance.vehicle)
    const driver = drivers.find((item) => item.id === remittance.driver)
    const dispatcher = dispatchers.find((item) => item.id === remittance.dispatcher)
    return <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #ccc' }} onClick={(event) => event.stopPropagation()}>
      <p><strong>Terminal:</strong> {terminal?.name || remittance.terminal}{editButton('remittance', remittance.id, 'terminal', remittance.terminal)}</p>
      {editControls('remittance', remittance.id, 'terminal', <select value={editValue} onChange={(event) => setEditValue(event.target.value)}>{terminals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>)}
      <p><strong>Vehicle:</strong> {vehicle?.plate_number || remittance.vehicle}</p>
      <p><strong>Driver:</strong> {driver?.full_name || remittance.driver}{editButton('remittance', remittance.id, 'driver', remittance.driver)}</p>
      {editControls('remittance', remittance.id, 'driver', <select value={editValue} onChange={(event) => setEditValue(event.target.value)}>{drivers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select>)}
      <p><strong>Dispatcher:</strong> {dispatcher?.full_name || remittance.dispatcher}</p>
      {editButton('remittance', remittance.id, 'dispatcher', remittance.dispatcher)}
      {editControls('remittance', remittance.id, 'dispatcher', <select value={editValue} onChange={(event) => setEditValue(event.target.value)}>{dispatchers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select>)}
      <p><strong>Date:</strong> {remittance.date}{editButton('remittance', remittance.id, 'date', remittance.date)}</p>
      {editControls('remittance', remittance.id, 'date', <input type="date" value={editValue} onChange={(event) => setEditValue(event.target.value)} />)}
      {remittance.substitute_fee != null ? <p>Substitute driver — original assigned driver: {drivers.find((item) => item.id === remittance.original_assigned_driver)?.full_name || remittance.original_assigned_driver}, actual driver: {driver?.full_name || remittance.driver}, fee: {remittance.substitute_fee}</p> : null}
      {editButton('remittance', remittance.id, 'substitute_fee', remittance.substitute_fee)}
      {editControls('remittance', remittance.id, 'substitute_fee', <input type="number" min="0" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} />)}
    </div>
  }

  return <div style={{ maxWidth: '1100px', margin: '40px auto', fontFamily: 'sans-serif' }}>
    <h1>Daily Remittance History</h1>
    <p style={{ marginBottom: '16px' }}><Link to="/remittance">Remittance</Link></p>
    <div style={{ marginBottom: '16px' }}><label htmlFor="historyDate">Date</label><input id="historyDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ marginLeft: '8px', padding: '6px' }} /></div>
    {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
    {isLoading ? <p>Loading remittance history...</p> : null}
    {!isLoading && !error && remittances.length === 0 ? <p>No remittances recorded for this date.</p> : null}
    {!isLoading && remittances.length > 0 ? <>
      {Object.entries(remittances.reduce((groups, item) => {
        const terminal = terminals.find((entry) => entry.id === item.terminal)
        const key = terminal?.id || item.terminal
        if (!groups[key]) groups[key] = { name: terminal?.name || item.terminal, items: [] }
        groups[key].items.push(item)
        return groups
      }, {})).map(([key, group]) => {
        const totals = group.items.reduce((result, item) => ({ gross: result.gross + Number(item.gross || 0), terminal: result.terminal + Number(item.terminal_fee || 0), subtotal: result.subtotal + Number(item.subtotal || 0), netPay: result.netPay + Number(item.net_pay || 0) }), { gross: 0, terminal: 0, subtotal: 0, netPay: 0 })
        return <section key={key} style={{ marginBottom: '28px' }}>
          <h2>{group.name}</h2>
          <p>Day totals — Gross: {totals.gross.toFixed(2)}, Terminal Fees: {totals.terminal.toFixed(2)}, Subtotal: {totals.subtotal.toFixed(2)}, Net Pay: {totals.netPay.toFixed(2)}</p>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr><th>Driver</th><th>Vehicle</th><th>Gross</th><th>Terminal Fee</th><th>Subtotal</th><th>Status</th></tr></thead><tbody>
            {group.items.map((item) => {
              const vehicle = vehicles.find((entry) => entry.id === item.vehicle)
              const driver = drivers.find((entry) => entry.id === item.driver)
              return <Fragment key={item.id}>
                <tr onClick={() => toggleDetail(item.id)} style={{ cursor: 'pointer' }}><td>{driver?.full_name || item.driver}</td><td>{vehicle?.plate_number || item.vehicle}</td><td>{item.gross}</td><td>{item.terminal_fee}</td><td>{item.subtotal}</td><td>{item.is_finalized ? 'Finalized' : 'In Progress'}</td></tr>
                {expandedId === item.id ? <tr><td colSpan="6">{isLoadingDetail || !detail ? <p>Loading details...</p> : <>
                  {renderHeader(detail)}
                  <h3>Dispatch Rounds</h3>
                  <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr><th>Round</th><th>Amount</th><th>Time</th></tr></thead><tbody>{rounds.map((round) => <tr key={round.id}><td>{round.round_number}</td><td>{round.amount}{editButton('round', round.id, 'amount', round.amount)}</td><td>{round.departure_time}{editButton('round', round.id, 'departure_time', round.departure_time)}</td></tr>)}</tbody></table>
                  {rounds.map((round) => <Fragment key={`${round.id}-edit`}>{editControls('round', round.id, 'amount', <input type="number" min="0" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} />)}{editControls('round', round.id, 'departure_time', <input type="time" value={editValue} onChange={(event) => setEditValue(event.target.value)} />)}</Fragment>)}
                  <h3>Fees</h3>
                  <p><strong>Terminal Fee:</strong> {detail.terminal_fee} (computed)</p>
                  <p><strong>Net Pay:</strong> {detail.net_pay}</p>
                  {feeFields.map(([field, label]) => <p key={field}><strong>{label}:</strong> {detail[field]}{editButton('remittance', detail.id, field, detail[field])}</p>)}
                  {feeFields.map(([field]) => editControls('remittance', detail.id, field, <input type="number" min="0" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} />))}
                  <h3>Correction History</h3>
                  {corrections.length === 0 ? <p>No corrections have been made to this remittance.</p> : <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr><th>Field</th><th>Round</th><th>Old Value</th><th>New Value</th><th>Admin</th><th>When</th><th>Reason</th></tr></thead><tbody>{corrections.map((correction) => <tr key={correction.id}><td>{correction.field_name}</td><td>{correction.dispatch_round_number || 'Remittance'}</td><td>{correction.old_value}</td><td>{correction.new_value}</td><td>{correction.admin_username}</td><td>{correction.corrected_at}</td><td>{correction.reason}</td></tr>)}</tbody></table>}
                </>}</td></tr> : null}
              </Fragment>
            })}
          </tbody></table>
        </section>
      })}
    </> : null}
  </div>
}

export default DailyRemittanceHistoryPage
