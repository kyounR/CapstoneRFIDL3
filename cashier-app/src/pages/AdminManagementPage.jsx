import { useEffect, useState } from 'react'
import EntityManager from '../components/EntityManager'
import api from '../api/client'

const MANAGEMENT_TABS = [
  { label: 'Vehicles', endpoint: 'vehicles/', fields: [
    { key: 'plate_number', label: 'Plate Number', type: 'text', required: true },
    { key: 'line', label: 'Line', type: 'select', relatedEndpoint: 'lines/', required: true },
    { key: 'is_light_vehicle', label: 'Light Vehicle', type: 'checkbox' },
    { key: 'passenger_capacity', label: 'Passenger Capacity', type: 'number' },
    { key: 'assigned_driver', label: 'Assigned Driver', type: 'select', relatedEndpoint: 'drivers/', optionLabel: 'full_name' },
    { key: 'is_active', label: 'Active', type: 'checkbox', default: true },
  ] },
  { label: 'Destinations', endpoint: 'destinations/', fields: [
    { key: 'destination_name', label: 'Destination', type: 'text', required: true },
    { key: 'base_fare', label: 'Base Fare', type: 'number', required: true },
    { key: 'discount_exempt', label: 'Discount Exempt', type: 'checkbox' },
    { key: 'capacity_limit', label: 'Capacity Limit', type: 'number' },
    { key: 'is_active', label: 'Active', type: 'checkbox', default: true },
  ] },
  { label: 'Lines', endpoint: 'lines/', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
  ] },
  { label: 'Terminals', endpoint: 'terminals/', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
  ] },
  { label: 'Drivers', endpoint: 'drivers/', fields: [
    { key: 'full_name', label: 'Full Name', type: 'text', required: true },
    { key: 'contact_number', label: 'Contact Number', type: 'text' },
  ] },
  { label: 'Dispatchers', endpoint: 'dispatchers/', fields: [
    { key: 'full_name', label: 'Full Name', type: 'text', required: true },
    { key: 'contact_number', label: 'Contact Number', type: 'text' },
  ] },
  { label: 'Passengers', endpoint: 'passengers/', fields: [
    { key: 'full_name', label: 'Full Name', type: 'text', required: true },
    { key: 'contact_number', label: 'Contact Number', type: 'text' },
    { key: 'discount_type', label: 'Discount Type', type: 'select', required: true, default: 'regular', options: [
      { value: 'regular', label: 'Regular' },
      { value: 'student', label: 'Student' },
      { value: 'senior', label: 'Senior' },
      { value: 'pwd', label: 'PWD' },
    ] },
  ] },
  { label: 'Cards', endpoint: 'cards/', fields: [
    { key: 'uid', label: 'Card UID', type: 'text', required: true },
    { key: 'passenger', label: 'Passenger', type: 'select', relatedEndpoint: 'passengers/', optionLabel: 'full_name' },
    { key: 'status', label: 'Status', type: 'select', required: true, default: 'active', options: [
      { value: 'active', label: 'Active' },
      { value: 'lost', label: 'Lost' },
      { value: 'deactivated', label: 'Deactivated' },
    ] },
    { key: 'balance', label: 'Balance', type: 'number', listOnly: true },
  ] },
]

const FEE_FIELDS = [
  { key: 'terminal_fee_percentage', label: 'Terminal Fee Percentage' },
  { key: 'ps_fee', label: 'PS Fee' },
  { key: 'water_fee', label: 'Water Fee' },
  { key: 'dispatcher_collection_fee', label: 'Dispatcher Collection Fee' },
  { key: 'ftb', label: 'FTB' },
  { key: 'savings', label: 'Savings' },
  { key: 'trust_fund', label: 'Trust Fund' },
]

function FeeSettingsForm() {
  const [values, setValues] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await api.get('fee-settings/')
        setValues(response.data)
      } catch (requestError) {
        setError(requestError.response?.data?.detail || 'Could not load fee settings.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchSettings()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api.patch('fee-settings/', values)
      setValues(response.data)
      setMessage('Fee settings saved.')
    } catch (requestError) {
      const details = requestError.response?.data
      setError(typeof details === 'object' ? Object.values(details).flat().join(' ') : 'Could not save fee settings.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Fee Settings</h2>
      {isLoading ? <p>Loading fee settings...</p> : (
        <form onSubmit={handleSubmit}>
          {FEE_FIELDS.map((field) => (
            <div key={field.key} style={{ marginBottom: '12px' }}>
              <label htmlFor={field.key}>{field.label}</label>
              <input id={field.key} type="number" step="0.01" min="0" value={values[field.key] ?? ''} onChange={(event) => setValues((currentValues) => ({ ...currentValues, [field.key]: event.target.value }))} className="input numeric" style={{ display: 'block', width: '100%', marginTop: '4px' }} required />
            </div>
          ))}
          {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
          {message ? <p style={{ color: 'var(--success)' }}>{message}</p> : null}
          <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save Fee Settings'}</button>
        </form>
      )}
    </section>
  )
}

function AdminManagementPage() {
  const [activeTab, setActiveTab] = useState(MANAGEMENT_TABS[0].label)
  const selectedTab = MANAGEMENT_TABS.find((tab) => tab.label === activeTab)

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', fontFamily: 'var(--font-body)' }}>
      <h1>Admin Management</h1>
      <nav aria-label="Management sections" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {MANAGEMENT_TABS.map((tab) => <button key={tab.label} type="button" onClick={() => setActiveTab(tab.label)} className={activeTab === tab.label ? 'btn-primary' : 'btn-secondary'}>{tab.label}</button>)}
        <button type="button" onClick={() => setActiveTab('Fee Settings')} className={activeTab === 'Fee Settings' ? 'btn-primary' : 'btn-secondary'}>Fee Settings</button>
      </nav>
      {activeTab === 'Fee Settings' ? <FeeSettingsForm /> : <EntityManager key={selectedTab.label} endpoint={selectedTab.endpoint} title={selectedTab.label} fields={selectedTab.fields} />}
    </div>
  )
}

export default AdminManagementPage
