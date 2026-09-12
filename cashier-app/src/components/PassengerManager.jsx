import { useEffect, useState } from 'react'
import api from '../api/client'

const PASSENGER_FIELDS = [
  { key: 'full_name', label: 'Full Name', type: 'text', required: true },
  { key: 'contact_number', label: 'Contact Number', type: 'text' },
  { key: 'discount_type', label: 'Discount Type', type: 'select', required: true, default: 'regular', options: [
    { value: 'regular', label: 'Regular' },
    { value: 'student', label: 'Student' },
    { value: 'senior', label: 'Senior' },
    { value: 'pwd', label: 'PWD' },
  ] },
]

function getListData(data) {
  return Array.isArray(data) ? data : data.results || []
}

function getErrorMessage(requestError, fallbackMessage) {
  const details = requestError.response?.data
  if (details && typeof details === 'object') {
    return Object.values(details).flat().join(' ')
  }
  return fallbackMessage
}

function createFormValues(record = {}) {
  return PASSENGER_FIELDS.reduce((values, field) => {
    values[field.key] = record[field.key] ?? field.default ?? ''
    return values
  }, {})
}

function PassengerManager() {
  const [passengers, setPassengers] = useState([])
  const [editingPassenger, setEditingPassenger] = useState(null)
  const [formValues, setFormValues] = useState(() => createFormValues())
  const [issueCard, setIssueCard] = useState(false)
  const [cardUid, setCardUid] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchText, setSearchText] = useState('')

  async function fetchPassengers() {
    setIsLoading(true)
    try {
      const response = await api.get('passengers/')
      setPassengers(getListData(response.data))
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load passengers.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPassengers()
  }, [])

  function getDisplayValue(record, field) {
    if (field.type === 'select') {
      const option = field.options.find((item) => String(item.value) === String(record[field.key]))
      return option ? option.label : record[field.key] || '-'
    }
    return record[field.key] ?? '-'
  }

  const normalizedSearchText = searchText.trim().toLowerCase()
  const visiblePassengers = normalizedSearchText
    ? passengers.filter((passenger) => PASSENGER_FIELDS.some((field) => String(getDisplayValue(passenger, field)).toLowerCase().includes(normalizedSearchText)))
    : passengers

  function resetFeedback() {
    setError('')
    setMessage('')
  }

  function openAddForm() {
    resetFeedback()
    setEditingPassenger({})
    setFormValues(createFormValues())
    setIssueCard(false)
    setCardUid('')
  }

  function openEditForm(passenger) {
    resetFeedback()
    setEditingPassenger(passenger)
    setFormValues(createFormValues(passenger))
    setIssueCard(false)
    setCardUid('')
  }

  function closeForm() {
    setEditingPassenger(null)
    setFormValues(createFormValues())
    setIssueCard(false)
    setCardUid('')
  }

  function updateValue(field, value) {
    setFormValues((currentValues) => ({ ...currentValues, [field.key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    resetFeedback()

    try {
      if (editingPassenger.id) {
        await api.patch(`passengers/${editingPassenger.id}/`, formValues)
        closeForm()
        setMessage('Passenger updated.')
        fetchPassengers()
        return
      }

      const passengerResponse = await api.post('passengers/', formValues)
      const passenger = passengerResponse.data

      if (issueCard) {
        try {
          await api.post('cards/', {
            uid: cardUid.trim(),
            passenger: passenger.id,
            status: 'active',
          })
          closeForm()
          setMessage('Passenger and card created.')
        } catch (cardError) {
          closeForm()
          setError(`Passenger was created successfully, but the card could not be issued: ${getErrorMessage(cardError, 'Could not issue the card.')}`)
        }
      } else {
        closeForm()
        setMessage('Passenger created.')
      }
      fetchPassengers()
    } catch (passengerError) {
      setError(getErrorMessage(passengerError, 'Could not save passenger.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(passenger) {
    if (!window.confirm('Delete this passenger?')) return

    resetFeedback()
    try {
      await api.delete(`passengers/${passenger.id}/`)
      fetchPassengers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not delete passenger.'))
    }
  }

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Passengers</h2>
        <button type="button" onClick={openAddForm} className="btn-primary">Add New</button>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {message ? <p style={{ color: 'var(--success)' }}>{message}</p> : null}

      {editingPassenger ? (
        <form onSubmit={handleSubmit} style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0 }}>{editingPassenger.id ? `Edit Passenger` : 'Add Passenger'}</h3>
          {PASSENGER_FIELDS.map((field) => (
            <div key={field.key} style={{ marginBottom: '12px' }}>
              <label htmlFor={`passengers-${field.key}`}>{field.label}</label>
              {field.type === 'select' ? (
                <select id={`passengers-${field.key}`} value={formValues[field.key]} onChange={(event) => updateValue(field, event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required={field.required}>
                  <option value="">Select {field.label}</option>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input id={`passengers-${field.key}`} type={field.type} value={formValues[field.key]} onChange={(event) => updateValue(field, event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required={field.required} />
              )}
            </div>
          ))}
          {!editingPassenger.id ? (
            <>
              <label style={{ display: 'block', marginBottom: '12px' }}>
                <input type="checkbox" checked={issueCard} onChange={(event) => setIssueCard(event.target.checked)} /> Issue a card now
              </label>
              {issueCard ? (
                <div style={{ marginBottom: '12px' }}>
                  <label htmlFor="passenger-card-uid">Card UID</label>
                  <input id="passenger-card-uid" type="text" value={cardUid} onChange={(event) => setCardUid(event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required />
                </div>
              ) : null}
            </>
          ) : null}
          <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={closeForm} disabled={isSaving} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
        </form>
      ) : null}

      {isLoading ? <p>Loading passengers...</p> : (
        <>
          <input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search passengers..." aria-label="Search Passengers" className="input" style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr>{PASSENGER_FIELDS.map((field) => <th key={field.key}>{field.label}</th>)}<th>Actions</th></tr></thead>
              <tbody>
                {visiblePassengers.length ? visiblePassengers.map((passenger) => (
                  <tr key={passenger.id}>
                    {PASSENGER_FIELDS.map((field) => <td key={field.key}>{getDisplayValue(passenger, field)}</td>)}
                    <td>
                      <button type="button" onClick={() => openEditForm(passenger)} className="btn-secondary">Edit</button>
                      <button type="button" onClick={() => handleDelete(passenger)} className="btn-secondary" style={{ marginLeft: '8px' }}>Delete</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan={PASSENGER_FIELDS.length + 1}>{normalizedSearchText ? 'No matching records found.' : 'No records found.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

export default PassengerManager
