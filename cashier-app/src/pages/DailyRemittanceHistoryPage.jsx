import { Fragment, useEffect, useState } from 'react'
import { Lock, LockOpen, Pencil } from 'lucide-react'
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

function DailyRemittanceHistoryPage() {
  const [date, setDate] = useState(getToday())
  const [remittances, setRemittances] = useState([])
  const [terminals, setTerminals] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
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
  const [adminCorrectionToggles, setAdminCorrectionToggles] = useState({})
  const [printedAt, setPrintedAt] = useState('')
  const isAdmin = localStorage.getItem('userRole') === 'admin'

  useEffect(() => {
    async function loadLookups() {
      try {
        const [terminalResponse, vehicleResponse, driverResponse] = await Promise.all([
          api.get('terminals/'),
          api.get('vehicles/?active_only=true'),
          api.get('drivers/'),
        ])
        setTerminals(getListData(terminalResponse.data))
        setVehicles(getListData(vehicleResponse.data))
        setDrivers(getListData(driverResponse.data))
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

  function handlePrint() {
    setPrintedAt(new Date().toLocaleString())
    window.setTimeout(() => window.print(), 0)
  }

  async function saveEdit() {
    if (!reason.trim()) {
      setEditError('Reason for correction is required.')
      return
    }
    setIsSaving(true)
    setEditError('')
    const payload = { reason: reason.trim(), [editing.field]: editValue }
    if (editing.field === 'terminal' || editing.field === 'driver') payload[editing.field] = Number(editValue)

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

  function editButton(remittanceId, type, id, field, value, ariaLabel) {
    if (!isAdmin || !detail?.is_finalized || !adminCorrectionToggles[remittanceId]) return null
    return <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(type, id, field, value) }} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', marginLeft: '6px', padding: 0 }} aria-label={ariaLabel} title={ariaLabel}><Pencil size={14} aria-hidden="true" /></button>
  }

  function editControls(type, id, field, input) {
    if (!editing || editing.type !== type || editing.id !== id || editing.field !== field) return null
    return <div onClick={(event) => event.stopPropagation()} style={{ marginTop: '6px' }}>
      {input}
      <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for correction" required className="input" style={{ display: 'block', width: '100%', marginTop: '6px' }} />
      {editError ? (
        <p>
          <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
          {editError}
        </p>
      ) : null}
      <button type="button" onClick={saveEdit} disabled={!reason.trim() || isSaving} className="btn-primary" style={{ marginTop: '6px' }}>{isSaving ? 'Saving...' : 'Save Correction'}</button>
      <button type="button" onClick={cancelEdit} disabled={isSaving} className="btn-secondary" style={{ marginLeft: '6px', marginTop: '6px' }}>Cancel</button>
    </div>
  }

  function renderHeader(remittance) {
    const terminal = terminals.find((item) => item.id === remittance.terminal)
    const vehicle = vehicles.find((item) => item.id === remittance.vehicle)
    const driver = drivers.find((item) => item.id === remittance.driver)
    return <div className="card" style={{ marginBottom: '16px' }} onClick={(event) => event.stopPropagation()}>
      <h2 style={{ margin: 0 }}>{terminal?.name || remittance.terminal} - {vehicle?.plate_number || remittance.vehicle}{editButton(remittance.id, 'remittance', remittance.id, 'terminal', remittance.terminal, 'Edit terminal (admin)')}</h2>
      {editControls('remittance', remittance.id, 'terminal', <select value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input">{terminals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>)}
      <p><strong>Cashier:</strong> {remittance.cashier_full_name || remittance.cashier_username} <span aria-hidden="true">&middot;</span> <strong>Driver:</strong> {driver?.full_name || remittance.driver}{editButton(remittance.id, 'remittance', remittance.id, 'driver', remittance.driver, 'Edit driver (admin)')} <span aria-hidden="true">&middot;</span> <strong>Date:</strong> {remittance.date}{editButton(remittance.id, 'remittance', remittance.id, 'date', remittance.date, 'Edit date (admin)')}</p>
      {editControls('remittance', remittance.id, 'driver', <select value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input">{drivers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select>)}
      {editControls('remittance', remittance.id, 'date', <input type="date" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input" />)}
    </div>
  }

  return <div className="ledger-page" style={{ width: '100%', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
      <h1 style={{ margin: 0 }}>Daily Remittance Ledger</h1>
      <div className="print-hidden" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" onClick={handlePrint} className="btn-secondary">Print</button>
        <SectionTabs activePath="/remittance" historyPath="/remittance/history" historyLabel="Ledger" compact />
      </div>
    </div>
    <div className="ledger-print-metadata print-only"><p><strong>Date:</strong> {date}</p><p>Printed on {printedAt || new Date().toLocaleString()}</p></div>
    <div className="print-hidden" style={{ marginBottom: '16px' }}><label htmlFor="historyDate">Date</label><input id="historyDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" style={{ marginLeft: '8px' }} /></div>
    {error ? (
      <p>
        <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
        {error}
      </p>
    ) : null}
    {isLoading ? <p>Loading remittance history...</p> : null}
    {!isLoading && !error && remittances.length === 0 ? <p>No remittances recorded for this date.</p> : null}
    {!isLoading && remittances.length > 0 ? <>
      {Object.entries(remittances.reduce((groups, item) => {
        const terminal = terminals.find((entry) => entry.id === item.terminal)
        const key = terminal?.id || item.terminal
        if (!groups[key]) groups[key] = { name: terminal?.name || item.terminal, items: [] }
        groups[key].items.push(item)
        return groups
      }, {})).map(([key, group], groupIndex) => {
        const terminalTagClass = groupIndex % 2 === 0 ? 'terminal-tag--a' : 'terminal-tag--b'
        return <section key={key} className="ledger-terminal-group" style={{ marginBottom: '28px' }}>
          <h2><span className={terminalTagClass} style={{ marginRight: '10px' }}>{group.name}</span></h2>
          <div className="ledger-table-scroll" style={{ overflowX: 'auto' }}>
            <table className="table ledger-table" style={{ minWidth: '1500px' }}><thead><tr><th>Driver</th><th>Vehicle</th><th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>Term. Fee</th><th style={{ textAlign: 'right' }}>Subtotal</th><th style={{ textAlign: 'right' }}>PS Fee</th><th style={{ textAlign: 'right' }}>Water Fee</th><th style={{ textAlign: 'right' }}>Dsp. Coll. Fee</th><th style={{ textAlign: 'right' }}>FTB</th><th style={{ textAlign: 'right' }}>Savings</th><th style={{ textAlign: 'right' }}>Trust Fund</th><th style={{ textAlign: 'right' }}>Net Pay</th><th>Status</th></tr></thead><tbody>
              {group.items.map((item) => {
                const vehicle = vehicles.find((entry) => entry.id === item.vehicle)
                const driver = drivers.find((entry) => entry.id === item.driver)
                return <Fragment key={item.id}>
                  <tr onClick={() => toggleDetail(item.id)} style={{ cursor: 'pointer' }}>
                    <td>{driver?.full_name || item.driver}</td>
                    <td>{vehicle?.plate_number || item.vehicle}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.gross}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.terminal_fee}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.subtotal}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.ps_fee}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.water_fee}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.dispatcher_collection_fee}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.ftb}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.savings}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.trust_fund}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{item.net_pay}</td>
                    <td>
                      <span className={`status-dot ${item.is_cancelled ? 'status-dot--danger' : item.is_finalized ? 'status-dot--success' : 'status-dot--pending'}`} style={{ marginRight: '6px' }} />
                      <span className={`badge ${item.is_cancelled ? 'badge--danger' : item.is_finalized ? 'badge--success' : 'badge--pending'}`}>{item.is_cancelled ? 'Cancelled' : item.is_finalized ? 'Finalized' : 'In Progress'}</span>
                    </td>
                  </tr>
                  {expandedId === item.id ? <tr><td colSpan="13">{isLoadingDetail || !detail ? <p>Loading details...</p> : <>
                  {isAdmin ? <button
                    type="button"
                    onClick={() => setAdminCorrectionToggles((currentToggles) => ({ ...currentToggles, [detail.id]: !currentToggles[detail.id] }))}
                    className={adminCorrectionToggles[detail.id] ? 'btn-primary' : 'btn-secondary'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 9px', fontSize: '0.85rem', marginBottom: '12px' }}
                    aria-pressed={Boolean(adminCorrectionToggles[detail.id])}
                  >{adminCorrectionToggles[detail.id] ? <LockOpen size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}Admin correction</button> : null}
                  {renderHeader(detail)}
                  <h3>Dispatch Rounds</h3>
                  <table className="table"><thead><tr><th>Round</th><th>Travel Pass</th><th>Dispatcher</th><th>Amount</th><th>Time</th></tr></thead><tbody>{rounds.map((round) => {
                    const usesDifferentTerminal = round.departure_terminal != null && String(round.departure_terminal) !== String(detail.terminal)
                    const travelPassLabel = round.source_trip ? `#${round.source_trip}` : 'Legacy'
                    const editingField = editing?.type === 'round' && editing.id === round.id ? editing.field : null
                    return <Fragment key={round.id}>
                      <tr style={round.is_excluded ? { color: 'var(--text-secondary)', textDecoration: 'line-through' } : undefined}>
                        <td className="numeric">{round.round_number}</td>
                        <td>{travelPassLabel}{usesDifferentTerminal && round.departure_terminal_name ? ` - ${round.departure_terminal_name}` : ''}{round.is_excluded ? <span className="badge badge--neutral" style={{ marginLeft: '8px', textDecoration: 'none' }}>Excluded</span> : null}</td>
                        <td>{round.dispatcher_name ?? '--'}</td>
                        <td className="numeric">{round.amount}{editButton(detail.id, 'round', round.id, 'amount', round.amount, `Edit dispatch round ${round.round_number} amount (admin)`)}</td>
                        <td className="numeric">{round.departure_time?.slice(0, 5) || '-'}{editButton(detail.id, 'round', round.id, 'departure_time', round.departure_time, `Edit dispatch round ${round.round_number} departure time (admin)`)}</td>
                      </tr>
                      {editingField ? <tr><td colSpan="5" style={{ background: 'var(--bg-elevated)' }}>
                        {editingField === 'amount'
                          ? editControls('round', round.id, 'amount', <input type="number" min="0" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input numeric" />)
                          : editControls('round', round.id, 'departure_time', <input type="time" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input" />)}
                      </td></tr> : null}
                    </Fragment>
                  })}</tbody></table>
                  <section className="card" style={{ maxWidth: '560px', marginTop: '20px' }}>
                    <h3 style={{ marginTop: 0 }}>Statement</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px' }}><span>Gross (dispatch rounds)</span><span className="numeric">{detail.gross}</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px' }}><span>Terminal fee ({detail.terminal_fee_percentage}%)</span><span className="numeric">{formatDeduction(detail.terminal_fee)}</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontWeight: 600 }}><span>Subtotal</span><span className="numeric">{detail.subtotal}</span></div>
                      {feeFields.map(([field, label]) => <Fragment key={field}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', color: 'var(--text-secondary)' }}><span>{label}</span><span className="numeric">{formatDeduction(detail[field])}{editButton(detail.id, 'remittance', detail.id, field, detail[field], `Edit ${label.toLowerCase()} (admin)`)}</span></div>
                        {editControls('remittance', detail.id, field, <input type="number" min="0" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input numeric" />)}
                      </Fragment>)}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', alignItems: 'baseline', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '1.35rem', fontWeight: 700 }}><span>Net pay</span><span className="numeric">{detail.net_pay}</span></div>
                      {detail.substitute_fee != null ? <Fragment>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '24px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}><span>Substitute fee (separate settlement)</span><span className="numeric">{detail.substitute_fee}{editButton(detail.id, 'remittance', detail.id, 'substitute_fee', detail.substitute_fee, 'Edit substitute fee (admin)')}</span></div>
                        {editControls('remittance', detail.id, 'substitute_fee', <input type="number" min="0" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="input numeric" />)}
                      </Fragment> : null}
                    </div>
                  </section>
                  <h3>Correction History</h3>
                  {corrections.length === 0 ? <p>No corrections have been made to this remittance.</p> : <table className="table"><thead><tr><th>Field</th><th>Round</th><th>Old Value</th><th>New Value</th><th>Admin</th><th>When</th><th>Reason</th></tr></thead><tbody>{corrections.map((correction) => <tr key={correction.id}><td>{correction.field_name}</td><td>{correction.dispatch_round_number || 'Remittance'}</td><td className="numeric">{correction.old_value}</td><td className="numeric">{correction.new_value}</td><td>{correction.admin_full_name || correction.admin_username}</td><td>{correction.corrected_at}</td><td>{correction.reason}</td></tr>)}</tbody></table>}
                  </>}</td></tr> : null}
                </Fragment>
              })}
            </tbody></table>
          </div>
        </section>
      })}
    </> : null}
  </div>
}

export default DailyRemittanceHistoryPage
