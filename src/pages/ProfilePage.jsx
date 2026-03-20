import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProfilePage() {
  const { profile, updateProfile } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [defaultHandicap, setDefaultHandicap] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setDefaultHandicap(profile.default_handicap != null ? String(profile.default_handicap) : '')
    }
  }, [profile])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error } = await updateProfile({
      display_name: displayName.trim(),
      default_handicap: defaultHandicap !== '' ? parseFloat(defaultHandicap) : null,
    })

    if (error) setError(error.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <button
        className="btn btn-ghost"
        onClick={() => navigate('/')}
        style={{ marginBottom: 20, paddingLeft: 0 }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Your profile</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>
        Your display name and handicap are shown to other players in a round.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Avatar preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--green-100)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 600, color: 'var(--green-700)',
              flexShrink: 0,
            }}>
              {displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 500 }}>{displayName || 'Your name'}</p>
              <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                {defaultHandicap !== '' ? `Handicap ${defaultHandicap}` : 'No handicap set'}
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Tom Johnson"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                maxLength={40}
              />
            </div>

            <div>
              <label className="label">
                Default handicap index{' '}
                <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>(optional)</span>
              </label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="0"
                max="54"
                placeholder="e.g. 14.3"
                value={defaultHandicap}
                onChange={e => setDefaultHandicap(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}
              />
              <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>
                This pre-fills the handicap field when you join a round — you can always change it.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red-500)' }}>{error}</p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={saving || !displayName.trim()}
          style={{ width: '100%' }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
