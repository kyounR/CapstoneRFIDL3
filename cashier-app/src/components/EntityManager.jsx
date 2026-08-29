import { useEffect, useState } from 'react'
import api from '../api/client'

function getListData(data) {
  return Array.isArray(data) ? data : data.results || []
}

function createFormValues(fields, record = {}) {
  return fields.reduce((values, field) => {
    if (field.type === 'checkbox') {
      values[field.key] = record[field.key] ?? field.default ?? false
    } else {
      values[field.key] = record[field.key] ?? field.default ?? ''
    }
    return values
  }, {})
}

function EntityManager({ endpoint, title, fields }) {
  const [records, setRecords] = useState([])
  const [relatedOptions, setRelatedOptions] = useState({})
  const [editingRecord, setEditingRecord] = useState(null)
  const [formValues, setFormValues] = useState(() => createFormValues(fields))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchRecords() {
    setIsLoading(true)
    try {
      const response = await api.get(endpoint)
      setRecords(getListData(response.data))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || `Could not load ${title.toLowerCase()}.`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()

    async function fetchRelatedOptions() {
      const relatedFields = fields.filter((field) => field.relatedEndpoint)
      if (!relatedFields.length) return

      try {
        const results = await Promise.all(relatedFields.map(async (field) => {
          const response = await api.get(field.relatedEndpoint)
          return [field.key, getListData(response.data)]
        }))
        setRelatedOptions(Object.fromEntries(results))
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load related records.')
      }
    }

    fetchRelatedOptions()
  }, [endpoint, fields, title])

  function getOptionLabel(field, option) {
    return option[field.optionLabel || 'name'] || option.full_name || option.uid || option.id
  }

  function getDisplayValue(record, field) {
    if (field.type === 'checkbox') return record[field.key] ? 'Yes' : 'No'
    if (field.type === 'select') {
      const option = (relatedOptions[field.key] || field.options || []).find((item) => String(item.value ?? item.id) === String(record[field.key]))
      return option ? (option.label || getOptionLabel(field, option)) : record[field.key] || '-'
    }
    return record[field.key] ?? '-'
  }

  function openAddForm() {
    setEditingRecord({})
    setFormValues(createFormValues(fields))
    setError('')
  }

  function openEditForm(record) {
    setEditingRecord(record)
    setFormValues(createFormValues(fields, record))
    setError('')
  }

  function closeForm() {
    setEditingRecord(null)
    setFormValues(createFormValues(fields))
  }

  function updateValue(field, value) {
    setFormValues((currentValues) => ({ ...currentValues, [field.key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')

    const payload = fields.reduce((values, field) => {
      const value = formValues[field.key]
      if (field.type === 'number' && value === '') {
        values[field.key] = null
      } else if (field.type === 'select' && value === '' && !field.required) {
        values[field.key] = null
      } else {
        values[field.key] = value
      }
      return values
    }, {})

    try {
      if (editingRecord.id) {
        await api.patch(`${endpoint}${editingRecord.id}/`, payload)
      } else {
        await api.post(endpoint, payload)
      }
      closeForm()
      fetchRecords()
    } catch (requestError) {
      const details = requestError.response?.data
      setError(typeof details === 'object' ? Object.values(details).flat().join(' ') : 'Could not save this record.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(record) {
    if (!window.confirm(`Delete this ${title.slice(0, -1).toLowerCase()}?`)) return

    setError('')
    try {
      await api.delete(`${endpoint}${record.id}/`)
      fetchRecords()
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.detail || 'Could not delete this record.')
    }
  }

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button type="button" onClick={openAddForm} className="btn-primary">Add New</button>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      {editingRecord ? (
        <form onSubmit={handleSubmit} style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0 }}>{editingRecord.id ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}</h3>
          {fields.filter((field) => !field.listOnly).map((field) => (
            <div key={field.key} style={{ marginBottom: '12px' }}>
              {field.type === 'checkbox' ? (
                <label>
                  <input type="checkbox" checked={formValues[field.key]} onChange={(event) => updateValue(field, event.target.checked)} /> {field.label}
                </label>
              ) : <>
                <label htmlFor={`${endpoint}-${field.key}`}>{field.label}</label>
                {field.type === 'select' ? (
                  <select id={`${endpoint}-${field.key}`} value={formValues[field.key]} onChange={(event) => updateValue(field, event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required={field.required}>
                    {!field.required ? <option value="">None</option> : <option value="">Select {field.label}</option>}
                    {(relatedOptions[field.key] || field.options || []).map((option) => <option key={option.value ?? option.id} value={option.value ?? option.id}>{option.label || getOptionLabel(field, option)}</option>)}
                  </select>
                ) : (
                  <input id={`${endpoint}-${field.key}`} type={field.type} value={formValues[field.key]} onChange={(event) => updateValue(field, event.target.value)} className={`input ${field.type === 'number' ? 'numeric' : ''}`} style={{ display: 'block', width: '100%', marginTop: '4px' }} required={field.required} step={field.type === 'number' ? '0.01' : undefined} min={field.type === 'number' ? '0' : undefined} />
                )}
              </>}
            </div>
          ))}
          <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={closeForm} disabled={isSaving} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
        </form>
      ) : null}

      {isLoading ? <p>Loading {title.toLowerCase()}...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}<th>Actions</th></tr></thead>
            <tbody>
              {records.length ? records.map((record) => (
                <tr key={record.id}>
                  {fields.map((field) => <td key={field.key} className={field.type === 'number' ? 'numeric' : undefined}>{getDisplayValue(record, field)}</td>)}
                  <td>
                    <button type="button" onClick={() => openEditForm(record)} className="btn-secondary">Edit</button>
                    <button type="button" onClick={() => handleDelete(record)} className="btn-secondary" style={{ marginLeft: '8px' }}>Delete</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={fields.length + 1}>No records found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default EntityManager
