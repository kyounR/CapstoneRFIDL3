import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

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
      navigate('/topup')
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Login failed.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '420px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Cashier Login</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
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
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            required
          />
        </div>

        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

        <button type="submit" disabled={isSubmitting} style={{ padding: '8px 14px' }}>
          {isSubmitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage
