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

function getErrorMessage(requestError, fallbackMessage) {
  const details = requestError.response?.data
  if (details && typeof details === 'object') {
    return Object.values(details).flat().join(' ')
  }
  return fallbackMessage
}

function UserManager() {
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'cashier' })
  const [editingUser, setEditingUser] = useState(null)
  const [editValues, setEditValues] = useState({ role: 'cashier', is_active: true })
  const [resetUser, setResetUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function fetchUsers() {
    setIsLoading(true)
    try {
      const response = await api.get('users/')
      setUsers(Array.isArray(response.data) ? response.data : response.data.results || [])
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load users.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  function resetFeedback() {
    setError('')
    setMessage('')
  }

  async function handleCreateUser(event) {
    event.preventDefault()
    setIsSaving(true)
    resetFeedback()
    try {
      await api.post('users/', newUser)
      setNewUser({ username: '', password: '', role: 'cashier' })
      setShowAddForm(false)
      setMessage('User created.')
      fetchUsers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not create user.'))
    } finally {
      setIsSaving(false)
    }
  }

  function openEditUser(user) {
    resetFeedback()
    setEditingUser(user)
    setEditValues({ role: user.role, is_active: user.is_active })
  }

  async function handleEditUser(event) {
    event.preventDefault()
    setIsSaving(true)
    resetFeedback()
    try {
      await api.patch(`users/${editingUser.id}/`, editValues)
      setEditingUser(null)
      setMessage('User updated.')
      fetchUsers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not update user.'))
    } finally {
      setIsSaving(false)
    }
  }

  function openResetPassword(user) {
    resetFeedback()
    setResetUser(user)
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleResetPassword(event) {
    event.preventDefault()
    resetFeedback()
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setIsSaving(true)
    try {
      const response = await api.post(`users/${resetUser.id}/reset-password/`, { new_password: newPassword })
      setResetUser(null)
      setNewPassword('')
      setConfirmPassword('')
      setMessage(response.data.message || 'Password reset successfully.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not reset password.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <button type="button" onClick={() => { resetFeedback(); setShowAddForm(true) }} className="btn-primary">Add New User</button>
      </div>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {message ? <p style={{ color: 'var(--success)' }}>{message}</p> : null}

      {showAddForm ? <form onSubmit={handleCreateUser} style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0 }}>Add New User</h3>
        <div style={{ marginBottom: '12px' }}><label htmlFor="newUsername">Username</label><input id="newUsername" type="text" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required /></div>
        <div style={{ marginBottom: '12px' }}><label htmlFor="newPassword">Password</label><input id="newPassword" type="password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required /></div>
        <div style={{ marginBottom: '12px' }}><label htmlFor="newUserRole">Role</label><select id="newUserRole" value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value }))} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }}><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
        <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Creating...' : 'Create User'}</button>
        <button type="button" onClick={() => setShowAddForm(false)} disabled={isSaving} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
      </form> : null}

      {editingUser ? <form onSubmit={handleEditUser} style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0 }}>Edit {editingUser.username}</h3>
        <div style={{ marginBottom: '12px' }}><label htmlFor="editUserRole">Role</label><select id="editUserRole" value={editValues.role} onChange={(event) => setEditValues((current) => ({ ...current, role: event.target.value }))} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }}><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
        <label><input type="checkbox" checked={editValues.is_active} onChange={(event) => setEditValues((current) => ({ ...current, is_active: event.target.checked }))} /> Active</label>
        <div style={{ marginTop: '16px' }}><button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save Changes'}</button><button type="button" onClick={() => setEditingUser(null)} disabled={isSaving} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button></div>
      </form> : null}

      {resetUser ? <form onSubmit={handleResetPassword} style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0 }}>Reset Password for {resetUser.username}</h3>
        <div style={{ marginBottom: '12px' }}><label htmlFor="resetPassword">New Password</label><input id="resetPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required /></div>
        <div style={{ marginBottom: '12px' }}><label htmlFor="confirmPassword">Confirm New Password</label><input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input" style={{ display: 'block', width: '100%', marginTop: '4px' }} required /></div>
        <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Resetting...' : 'Reset Password'}</button><button type="button" onClick={() => setResetUser(null)} disabled={isSaving} className="btn-secondary" style={{ marginLeft: '8px' }}>Cancel</button>
      </form> : null}

      {isLoading ? <p>Loading users...</p> : <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Date Joined</th><th>Actions</th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td>{user.username}</td><td>{user.role}</td><td><span className={`badge ${user.is_active ? 'badge--success' : 'badge--danger'}`}><span className={`status-dot ${user.is_active ? 'status-dot--success' : 'status-dot--danger'}`} style={{ marginRight: '6px' }} />{user.is_active ? 'Active' : 'Inactive'}</span></td><td>{new Date(user.date_joined).toLocaleString()}</td><td><button type="button" onClick={() => openEditUser(user)} className="btn-secondary">Edit</button><button type="button" onClick={() => openResetPassword(user)} className="btn-secondary" style={{ marginLeft: '8px' }}>Reset Password</button></td></tr>) : <tr><td colSpan="5">No users found.</td></tr>}</tbody></table></div>}
    </section>
  )
}

const AUDIT_ACTION_STYLES = {
  created: { badge: 'badge--success', dot: 'status-dot--success' },
  updated: { badge: 'badge--pending', dot: 'status-dot--pending' },
  deleted: { badge: 'badge--danger', dot: 'status-dot--danger' },
}

const AUDIT_MODEL_NAMES = [
  'Vehicle',
  'Destination',
  'Line',
  'Terminal',
  'Driver',
  'Dispatcher',
  'Passenger',
  'Card',
  'User',
  'FeeSettings',
  'ManifestTrip',
  'DailyRemittance',
]

function AuditLogManager() {
  const [logs, setLogs] = useState([])
  const [modelName, setModelName] = useState('')
  const [date, setDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchAuditLogs() {
      setIsLoading(true)
      setError('')
      try {
        const response = await api.get('audit-log/', {
          params: {
            ...(modelName ? { model_name: modelName } : {}),
            ...(date ? { date } : {}),
          },
        })
        setLogs(Array.isArray(response.data) ? response.data : response.data.results || [])
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Could not load the audit log.'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchAuditLogs()
  }, [modelName, date])

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Audit Log</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label htmlFor="auditModelName">Model</label>
          <select id="auditModelName" value={modelName} onChange={(event) => setModelName(event.target.value)} className="input" style={{ display: 'block', marginTop: '4px' }}>
            <option value="">All models</option>
            {AUDIT_MODEL_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="auditDate">Date</label>
          <input id="auditDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" style={{ display: 'block', marginTop: '4px' }} />
        </div>
      </div>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {isLoading ? <p>Loading audit log...</p> : <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Model</th><th>Record</th><th>Changes</th></tr></thead>
          <tbody>
            {logs.length ? logs.map((log) => {
              const actionStyle = AUDIT_ACTION_STYLES[log.action] || AUDIT_ACTION_STYLES.updated
              return <tr key={log.id}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>{log.actor_username || 'System'}</td>
                <td><span className={`badge ${actionStyle.badge}`}><span className={`status-dot ${actionStyle.dot}`} style={{ marginRight: '6px' }} />{log.action}</span></td>
                <td>{log.model_name}</td>
                <td>{log.object_repr}</td>
                <td>{log.action === 'updated' && log.changes ? <details><summary>View changes</summary><div style={{ marginTop: '8px' }}>{Object.entries(log.changes).map(([field, [oldValue, newValue]]) => <div key={field} className="numeric">{field}: {String(oldValue)} -&gt; {String(newValue)}</div>)}</div></details> : '-'}</td>
              </tr>
            }) : <tr><td colSpan="6">No audit entries found.</td></tr>}
          </tbody>
        </table>
      </div>}
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
        <button type="button" onClick={() => setActiveTab('Users')} className={activeTab === 'Users' ? 'btn-primary' : 'btn-secondary'}>Users</button>
        <button type="button" onClick={() => setActiveTab('Fee Settings')} className={activeTab === 'Fee Settings' ? 'btn-primary' : 'btn-secondary'}>Fee Settings</button>
        <button type="button" onClick={() => setActiveTab('Audit Log')} className={activeTab === 'Audit Log' ? 'btn-primary' : 'btn-secondary'}>Audit Log</button>
      </nav>
      {activeTab === 'Fee Settings' ? <FeeSettingsForm /> : activeTab === 'Users' ? <UserManager /> : activeTab === 'Audit Log' ? <AuditLogManager /> : <EntityManager key={selectedTab.label} endpoint={selectedTab.endpoint} title={selectedTab.label} fields={selectedTab.fields} />}
    </div>
  )
}

export default AdminManagementPage
