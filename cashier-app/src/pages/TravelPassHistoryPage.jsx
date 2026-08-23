import { Fragment, useEffect, useState } from 'react'
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

function TravelPassHistoryPage() {
  const [date, setDate] = useState(getToday())
  const [travelPasses, setTravelPasses] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [detailPass, setDetailPass] = useState(null)
  const [corrections, setCorrections] = useState([])
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [reason, setReason] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const isAdmin = localStorage.getItem('userRole') === 'admin'

  useEffect(() => {
    async function fetchVehicles() {
      try {
        const response = await api.get('vehicles/')
        setVehicles(getListData(response.data))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load vehicles.')
      }
    }

    fetchVehicles()
  }, [])

  useEffect(() => {
    async function fetchTravelPasses() {
      if (!date) {
        return
      }

      setIsLoading(true)
      setError('')
      setExpandedId(null)
      setDetailPass(null)
      setCorrections([])

      try {
        const response = await api.get('manifests/', { params: { date } })
        setTravelPasses(getListData(response.data))
      } catch (requestError) {
        setTravelPasses([])
        setError(requestError.response?.data?.detail || 'Could not load Travel Pass history.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTravelPasses()
  }, [date])

  async function loadPassDetails(passId) {
    setIsLoadingDetail(true)
    setIsLoadingCorrections(true)
    setError('')

    try {
      const [manifestResponse, entriesResponse, correctionsResponse] = await Promise.all([
        api.get(`manifests/${passId}/`),
        api.get('manifest-entries/', { params: { manifest_trip: passId } }),
        api.get(`manifests/${passId}/corrections/`),
      ])
      const refreshedPass = {
        ...manifestResponse.data,
        entries: getListData(entriesResponse.data),
      }
      setDetailPass(refreshedPass)
      setTravelPasses((currentPasses) => currentPasses.map((pass) => (
        pass.id === passId ? { ...pass, ...manifestResponse.data } : pass
      )))
      setCorrections(getListData(correctionsResponse.data))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load Travel Pass details.')
    } finally {
      setIsLoadingDetail(false)
      setIsLoadingCorrections(false)
    }
  }

  function toggleExpanded(passId) {
    if (expandedId === passId) {
      setExpandedId(null)
      setDetailPass(null)
      setCorrections([])
      setEditing(null)
      return
    }

    setExpandedId(passId)
    setDetailPass(null)
    setCorrections([])
    setEditing(null)
    loadPassDetails(passId)
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

    setIsSavingEdit(true)
    setEditError('')
    const payload = { reason: reason.trim(), [editing.field]: editValue }

    if (editing.field === 'vehicle') {
      payload.vehicle = Number(editValue)
    }

    try {
      if (editing.type === 'trip') {
        await api.post(`manifests/${editing.id}/admin-correct/`, payload)
      } else {
        await api.post(`manifest-entries/${editing.id}/admin-correct/`, payload)
      }
      cancelEdit()
      await loadPassDetails(expandedId)
    } catch (requestError) {
      setEditError(requestError.response?.data?.error || 'Could not save correction.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  function renderEditControls(type, id, field, input) {
    if (!isAdmin || editing?.type !== type || editing.id !== id || editing.field !== field) {
      return null
    }

    return (
      <div style={{ marginTop: '6px' }} onClick={(event) => event.stopPropagation()}>
        {input}
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for correction"
          required
          style={{ display: 'block', marginTop: '6px', padding: '6px', width: '100%' }}
        />
        {editError ? <p style={{ color: 'crimson' }}>{editError}</p> : null}
        <button type="button" onClick={saveEdit} disabled={!reason.trim() || isSavingEdit} style={{ marginTop: '6px', padding: '6px 10px' }}>
          {isSavingEdit ? 'Saving...' : 'Save Correction'}
        </button>
        <button type="button" onClick={cancelEdit} disabled={isSavingEdit} style={{ marginLeft: '6px', padding: '6px 10px' }}>
          Cancel
        </button>
      </div>
    )
  }

  function renderAdminEditButton(type, id, field, value) {
    if (!isAdmin || (editing && !(editing.type === type && editing.id === id && editing.field === field))) {
      return null
    }

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          startEdit(type, id, field, value)
        }}
        style={{ marginLeft: '6px', padding: '3px 7px', fontSize: '0.85em' }}
      >
        Edit (Admin)
      </button>
    )
  }

  function renderTripHeader(pass) {
    const vehicle = vehicles.find((item) => item.id === pass.vehicle)
    const isEditingVehicle = editing?.type === 'trip' && editing.id === pass.id && editing.field === 'vehicle'
    const isEditingDate = editing?.type === 'trip' && editing.id === pass.id && editing.field === 'date'
    const isEditingDeparture = editing?.type === 'trip' && editing.id === pass.id && editing.field === 'departure_time'

    return (
      <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #ccc' }} onClick={(event) => event.stopPropagation()}>
        <p>
          <strong>Vehicle:</strong> {vehicle?.plate_number || pass.vehicle}
          {renderAdminEditButton('trip', pass.id, 'vehicle', pass.vehicle)}
        </p>
        {isEditingVehicle ? renderEditControls('trip', pass.id, 'vehicle', (
          <select value={editValue} onChange={(event) => setEditValue(event.target.value)} style={{ padding: '6px' }}>
            {vehicles.map((item) => <option key={item.id} value={item.id}>{item.plate_number} - {item.line_name}</option>)}
          </select>
        )) : null}
        <p>
          <strong>Date:</strong> {pass.date}
          {renderAdminEditButton('trip', pass.id, 'date', pass.date)}
        </p>
        {isEditingDate ? renderEditControls('trip', pass.id, 'date', <input type="date" value={editValue} onChange={(event) => setEditValue(event.target.value)} />) : null}
        <p>
          <strong>Departure:</strong> {pass.departure_time || 'Not yet finalized'}
          {renderAdminEditButton('trip', pass.id, 'departure_time', pass.departure_time || '')}
        </p>
        {isEditingDeparture ? renderEditControls('trip', pass.id, 'departure_time', <input type="time" value={editValue} onChange={(event) => setEditValue(event.target.value)} />) : null}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Travel Pass History</h1>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="historyDate">Date</label>
        <input id="historyDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ marginLeft: '8px', padding: '6px' }} />
      </div>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {isLoading ? <p>Loading Travel Pass history...</p> : null}
      {!isLoading && !error && travelPasses.length === 0 ? <p>No Travel Passes recorded for this date.</p> : null}

      {!isLoading && travelPasses.length > 0 ? (
        <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th>Vehicle</th><th>Cashier</th><th>Departure</th><th>Total Passengers</th><th>Total Fare</th><th>Status</th></tr></thead>
          <tbody>
            {travelPasses.map((travelPass) => {
              const isExpanded = expandedId === travelPass.id
              const vehicle = vehicles.find((item) => item.id === travelPass.vehicle)
              return (
                <Fragment key={travelPass.id}>
                  <tr onClick={() => toggleExpanded(travelPass.id)} style={{ cursor: 'pointer' }}>
                    <td>{vehicle?.plate_number || travelPass.vehicle}</td>
                    <td>{travelPass.cashier_username || travelPass.cashier}</td>
                    <td>{travelPass.departure_time || 'Not yet finalized'}</td>
                    <td>{travelPass.total_passengers}</td>
                    <td>{travelPass.total_fare}</td>
                    <td><span style={{ color: travelPass.is_finalized ? 'green' : '#9a6700' }}>{travelPass.is_finalized ? 'Finalized' : 'In Progress'}</span></td>
                  </tr>
                  {isExpanded ? (
                    <tr><td colSpan="6">
                      {isLoadingDetail || !detailPass ? <p>Loading Travel Pass details...</p> : (
                        <>
                          {detailPass.is_finalized && isAdmin ? renderTripHeader(detailPass) : (
                            <div style={{ marginBottom: '16px' }}>
                              <strong>Vehicle:</strong> {vehicle?.plate_number || detailPass.vehicle} {' | '}
                              <strong>Date:</strong> {detailPass.date} {' | '}
                              <strong>Departure:</strong> {detailPass.departure_time || 'Not yet finalized'}
                            </div>
                          )}
                          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead><tr><th>Destination</th><th>Passenger Count</th><th>Discount Count</th><th>Total Fare</th></tr></thead>
                            <tbody>
                              {detailPass.entries?.length ? detailPass.entries.map((entry) => {
                                const destinationName = entry.destination_details?.destination_name || entry.destination_name
                                return (
                                  <tr key={`${detailPass.id}-${entry.id || entry.destination}`}>
                                    <td>{destinationName}</td>
                                    <td>
                                      {entry.passenger_count}
                                      {detailPass.is_finalized ? renderAdminEditButton('entry', entry.id, 'passenger_count', entry.passenger_count) : null}
                                      {detailPass.is_finalized && editing?.type === 'entry' && editing.id === entry.id && editing.field === 'passenger_count' ? renderEditControls('entry', entry.id, 'passenger_count', <input type="number" min="0" value={editValue} onChange={(event) => setEditValue(event.target.value)} />) : null}
                                    </td>
                                    <td>
                                      {entry.discount_count}
                                      {detailPass.is_finalized ? renderAdminEditButton('entry', entry.id, 'discount_count', entry.discount_count) : null}
                                      {detailPass.is_finalized && editing?.type === 'entry' && editing.id === entry.id && editing.field === 'discount_count' ? renderEditControls('entry', entry.id, 'discount_count', <input type="number" min="0" value={editValue} onChange={(event) => setEditValue(event.target.value)} />) : null}
                                    </td>
                                    <td>{entry.total_fare}</td>
                                  </tr>
                                )
                              }) : <tr><td colSpan="4">No entries recorded.</td></tr>}
                            </tbody>
                          </table>

                          <section style={{ marginTop: '16px' }}>
                            <h3>Correction History</h3>
                            {isLoadingCorrections ? <p>Loading correction history...</p> : null}
                            {!isLoadingCorrections && corrections.length === 0 ? <p>No corrections have been made to this Travel Pass.</p> : null}
                            {!isLoadingCorrections && corrections.length > 0 ? (
                              <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead><tr><th>Field</th><th>Destination</th><th>Old Value</th><th>New Value</th><th>Admin</th><th>When</th><th>Reason</th></tr></thead>
                                <tbody>{corrections.map((correction) => <tr key={correction.id}><td>{correction.field_name}</td><td>{correction.destination_name || 'Travel Pass'}</td><td>{correction.old_value}</td><td>{correction.new_value}</td><td>{correction.admin_username}</td><td>{correction.corrected_at}</td><td>{correction.reason}</td></tr>)}</tbody>
                              </table>
                            ) : null}
                          </section>
                        </>
                      )}
                    </td></tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}

export default TravelPassHistoryPage
