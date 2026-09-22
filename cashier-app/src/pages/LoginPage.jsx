import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import CalPassWordmark from '../components/CalPassWordmark'

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await api.post('login/', { username, password })
      localStorage.setItem('authToken', response.data.token)
      localStorage.setItem('userRole', response.data.role)
      localStorage.setItem('username', response.data.username)
      localStorage.setItem('fullName', response.data.full_name || '')
      navigate('/home')
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Login failed.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '420px', margin: '40px auto', fontFamily: 'var(--font-body)' }}>
      <div style={{ padding: '4px 0 20px' }}>
        <CalPassWordmark />
        <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fare collection and operations</p>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
        <h1 style={{ marginTop: 0 }}>Staff Login</h1>
      <form onSubmit={handleSubmit} className="card">
        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="input"
            style={{ width: '100%', marginTop: '4px' }}
            required
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            style={{ width: '100%', marginTop: '4px' }}
            required
          />
        </div>

        {error ? (
          <p>
            <span className="status-dot status-dot--danger" style={{ marginRight: '8px' }} />
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
      </div>
      <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>CALTRANSCO staff access only</p>
      <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Forgot your password? Contact your administrator.</p>
    </div>
  )
}

export default LoginPage
