import { useEffect, useState } from 'react'
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

function DailyRemittancePage() {
  const [pageState, setPageState] = useState(0)
  const [remittances, setRemittances] = useState([])
  const [terminals, setTerminals] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [terminalId, setTerminalId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState(getToday())
  const [substituteFee, setSubstituteFee] = useState('')
  const [remittance, setRemittance] = useState(null)
  const [rounds, setRounds] = useState([])
  const [roundAmount, setRoundAmount] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [feeValues, setFeeValues] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  async function fetchPickerData() {
    setIsLoading(true)
    setError('')
    try {
      const [remittanceResponse, terminalResponse, vehicleResponse, driverResponse] = await Promise.all([
        api.get('remittances/', { params: { is_finalized: false } }),
        api.get('terminals/'),
        api.get('vehicles/'),
        api.get('drivers/'),
      ])
      setRemittances(getListData(remittanceResponse.data))
      setTerminals(getListData(terminalResponse.data))
      setVehicles(getListData(vehicleResponse.data))
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

  function resetForm() {
    setTerminalId('')
    setVehicleId('')
    setDriverId('')
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
    setFeeValues(Object.fromEntries(feeFields.map(([field]) => [field, selectedRemittance[field] ?? '0.00'])))
    setPageState(2)
    loadRemittanceDetails(selectedRemittance.id)
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
      setFeeValues(Object.fromEntries(feeFields.map(([field]) => [field, remittanceResponse.data[field] ?? '0.00'])))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load remittance details.')
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    setBusyAction('create')
    setError('')
    const payload = { terminal: Number(terminalId), vehicle: Number(vehicleId), driver: Number(driverId), date }
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

  async function handleAddRound(event) {
    event.preventDefault()
    if (rounds.length >= 5) {
      setError('A remittance can have no more than 5 dispatch rounds.')
      return
    }
    setBusyAction('round')
    setError('')
    try {
      const response = await api.post(`remittances/${remittance.id}/rounds/`, {
        round_number: rounds.length + 1,
        amount: roundAmount,
        departure_time: departureTime,
      })
      setRounds((currentRounds) => [...currentRounds, response.data.round])
      setRemittance(response.data.remittance)
      setRoundAmount('')
      setDepartureTime('')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not add dispatch round.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleFeeUpdate(event) {
    event.preventDefault()
    setBusyAction('fees')
    setError('')
    try {
      const response = await api.patch(`remittances/${remittance.id}/`, feeValues)
      setRemittance(response.data)
      setFeeValues(Object.fromEntries(feeFields.map(([field]) => [field, response.data[field] ?? '0.00'])))
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save fee fields.')
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

  return (
    <div style={{ maxWidth: '900px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Daily Remittance</h1>
      <p style={{ marginBottom: '16px' }}><Link to="/topup">Back to top-up</Link> {' | '}<Link to="/travel-pass">Travel Pass</Link></p>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {pageState === 0 ? (
        <section>
          <h2>Active Remittances</h2>
          {isLoading ? <p>Loading remittances...</p> : null}
          {!isLoading && remittances.length === 0 ? <p>No active remittances. Start a new one below.</p> : null}
          {remittances.map((item) => {
            const vehicle = vehicles.find((entry) => entry.id === item.vehicle)
            const driver = drivers.find((entry) => entry.id === item.driver)
            return <button key={item.id} type="button" onClick={() => selectRemittance(item)} style={{ display: 'block', width: '100%', marginBottom: '10px', padding: '12px', textAlign: 'left' }}><strong>{driver?.full_name || item.driver}</strong> - {vehicle?.plate_number || item.vehicle} - {item.date}</button>
          })}
          <button type="button" onClick={() => setPageState(1)} style={{ padding: '8px 14px' }}>Start New Remittance</button>
        </section>
      ) : null}

      {pageState === 1 ? (
        <form onSubmit={handleCreate}>
          <h2>Start New Remittance</h2>
          <label htmlFor="terminal">Terminal</label>
          <select id="terminal" value={terminalId} onChange={(event) => setTerminalId(event.target.value)} required style={{ display: 'block', width: '100%', padding: '8px', margin: '4px 0 12px' }}>
            <option value="">Select a terminal</option>
            {terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}
          </select>
          <label htmlFor="vehicle">Vehicle</label>
          <select id="vehicle" value={vehicleId} onChange={handleVehicleChange} required style={{ display: 'block', width: '100%', padding: '8px', margin: '4px 0 12px' }}>
            <option value="">Select a vehicle</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number} - {vehicle.line_name}</option>)}
          </select>
          <label htmlFor="driver">Driver</label>
          <select id="driver" value={driverId} onChange={(event) => setDriverId(event.target.value)} required style={{ display: 'block', width: '100%', padding: '8px', margin: '4px 0 12px' }}>
            <option value="">Select a driver</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}
          </select>
          {isSubstitution ? <div style={{ marginBottom: '12px' }}><label htmlFor="substituteFee">Substitute fee</label><input id="substituteFee" type="number" min="0" step="0.01" value={substituteFee} onChange={(event) => setSubstituteFee(event.target.value)} style={{ display: 'block', padding: '8px', marginTop: '4px' }} /><p>Fee owed by the substitute driver to the assigned driver.</p></div> : null}
          <label htmlFor="remittanceDate">Date</label>
          <input id="remittanceDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} required style={{ display: 'block', padding: '8px', margin: '4px 0 12px' }} />
          <button type="submit" disabled={busyAction === 'create'} style={{ padding: '8px 14px' }}>{busyAction === 'create' ? 'Creating...' : 'Start Remittance'}</button>
          <button type="button" onClick={() => setPageState(0)} style={{ marginLeft: '8px', padding: '8px 14px' }}>Cancel</button>
        </form>
      ) : null}

      {pageState === 2 && remittance ? (
        <section>
          <button type="button" onClick={switchRemittance} style={{ marginBottom: '12px', padding: '6px 10px' }}>Switch Remittance</button>
          <div style={{ padding: '12px', border: '1px solid #ccc', marginBottom: '20px' }}>
            <h2>{detailTerminal?.name || remittance.terminal} - {detailVehicle?.plate_number || remittance.vehicle}</h2>
            <p><strong>Driver:</strong> {detailDriver?.full_name || remittance.driver}</p>
            <p><strong>Date:</strong> {remittance.date}</p>
            {detailVehicle?.is_light_vehicle ? <span style={{ padding: '3px 6px', border: '1px solid #999' }}>Light vehicle</span> : null}
            {remittance.substitute_fee != null ? <p>Substitute driver — original assigned driver: {originalAssignedDriver?.full_name || remittance.original_assigned_driver}, fee: {remittance.substitute_fee}</p> : null}
          </div>

          <h3>Dispatch Rounds</h3>
          {rounds.length > 0 ? <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '12px' }}><thead><tr><th>Round</th><th>Amount</th><th>Departure Time</th></tr></thead><tbody>{rounds.map((round) => <tr key={round.id}><td>{round.round_number}</td><td>{round.amount}</td><td>{round.departure_time}</td></tr>)}</tbody></table> : <p>No rounds added yet.</p>}
          {!remittance.is_finalized ? (rounds.length < 5 ? <form onSubmit={handleAddRound} style={{ marginBottom: '20px' }}><input type="number" min="0" step="0.01" placeholder="Amount" value={roundAmount} onChange={(event) => setRoundAmount(event.target.value)} required style={{ padding: '7px', marginRight: '8px' }} /><input type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} required style={{ padding: '7px', marginRight: '8px' }} /><button type="submit" disabled={busyAction === 'round'} style={{ padding: '7px 10px' }}>{busyAction === 'round' ? 'Adding...' : `Add Round ${rounds.length + 1}`}</button></form> : <p>All 5 dispatch rounds have been added.</p>) : null}

          <h3>Computed Figures</h3>
          <p>Gross: {remittance.gross}</p>
          <p>Terminal Fee ({remittance.terminal_fee_percentage}%): {remittance.terminal_fee}</p>
          <p>Subtotal: {remittance.subtotal}</p>

          <h3>Fees</h3>
          {!remittance.is_finalized ? <>
            <form onSubmit={handleFeeUpdate}>
              <p><strong>Terminal Fee:</strong> {remittance.terminal_fee} (computed)</p>
              {feeFields.map(([field, label]) => <div key={field} style={{ marginBottom: '8px' }}><label htmlFor={field}>{label}</label><input id={field} type="number" min="0" step="0.01" value={feeValues[field] ?? ''} onChange={(event) => setFeeValues((current) => ({ ...current, [field]: event.target.value }))} style={{ display: 'block', padding: '6px', marginTop: '3px' }} /></div>)}
              <button type="submit" disabled={busyAction === 'fees'} style={{ padding: '8px 14px' }}>{busyAction === 'fees' ? 'Saving...' : 'Save Fees'}</button>
            </form>
            <button type="button" onClick={handleFinalize} disabled={busyAction !== ''} style={{ marginTop: '20px', padding: '8px 14px' }}>Finalize Remittance</button>
          </> : null}
        </section>
      ) : null}
    </div>
  )
}

export default DailyRemittancePage
