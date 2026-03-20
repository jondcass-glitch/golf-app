import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signInWithEmail(email)
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Check your email</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 15 }}>
          We sent a magic link to <strong>{email}</strong>.<br />
          Tap it to sign in — no password needed.
        </p>
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh' }}>
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⛳</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--green-700)', marginBottom: 6 }}>Golf Betting</h1>
        <p style={{ color: 'var(--gray-500)', fontSize: 15 }}>Live scoring · Stableford · Real time</p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Sign in</h2>
        <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 20 }}>We'll email you a magic link — no password needed.</p>

        <form onSubmit={handleSubmit}>
          <label className="label">Email address</label>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ marginBottom: 16 }}
          />
          {error && (
            <p style={{ fontSize: 13, color: 'var(--red-500)', marginBottom: 12 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !email}
            style={{ width: '100%' }}
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      </div>
    </div>
  )
}
