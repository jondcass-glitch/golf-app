import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { resolvePlayingHandicap } from '../lib/scoring'

export default function JoinRoundPage() {
  const { roundId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const bettingState = location.state ?? {}

  const [round, setRound] = useState(null)
  const [alreadyJoined, setAlreadyJoined] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [exactHandicap, setExactHandicap] = useState('')
  const [override, setOverride] = useState('')
  const [useOverride, setUseOverride] = useState(false)

  useEffect(() => { fetchRound() }, [roundId])

  async function fetchRound() {
    const { data, error } = await supabase
      .from('rounds')
      .select('*, course:courses(name, location)')
      .eq('id', roundId)
      .single()

    if (error || !data) { setError('Round not found.'); setLoading(false); return }
    setRound(data)

    if (profile?.default_handicap) setExactHandicap(String(profile.default_handicap))

    const { data: existing } = await supabase
      .from('round_players')
      .select('id')
      .eq('round_id', roundId)
      .eq('profile_id', user.id)
      .single()

    if (existing) { navigate(`/round/${roundId}`); return }

    // Save betting details if coming from betting setup
    if (bettingState.bettingFormat !== undefined) {
      await supabase
        .from('rounds')
        .update({
          stake_pence: bettingState.stakePence ?? 0,
          betting_format: bettingState.bettingFormat ?? 'none',
        })
        .eq('id', roundId)
    }

    setLoading(false)
  }

  const calculatedHandicap = exactHandicap
    ? resolvePlayingHandicap(parseFloat(exactHandicap), round?.handicap_allowance ?? 100)
    : null

  const playingHandicap = useOverride && override !== ''
    ? parseInt(override)
    : calculatedHandicap

  async function handleJoin(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const exact = parseFloat(exactHandicap)
    const calculated = resolvePlayingHandicap(exact, round.handicap_allowance)
    const overrideVal = useOverride && override !== '' ? parseInt(override) : null
    const playing = overrideVal ?? calculated

    const { error } = await supabase
      .from('round_players')
      .insert({
        round_id: roundId,
        profile_id: user.id,
        exact_handicap: exact,
        calculated_handicap: calculated,
        handicap_override: overrideVal,
        playing_handicap: playing,
      })

    if (error) { setError(error.message); setSaving(false); return }
    navigate(round.status === 'active' ? `/round/${roundId}/play` : `/round/${roundId}`)
  }

  if (loading) return <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  if (error) return <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--red-500)' }}>{error}</div>

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 20, paddingLeft: 0 }}>
        ← Back
      </button>

      {/* Round summary */}
      <div className="card" style={{ background: 'var(--green-700)', border: 'none', color: 'white', marginBottom: round.status === 'active' ? 12 : 24 }}>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {round.status === 'active' ? 'Round in progress' : 'Joining'}
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 2 }}>{round.name}</h1>
        <p style={{ fontSize: 14, opacity: 0.8 }}>{round.course?.name}</p>
        {round.handicap_allowance < 100 && (
          <div style={{ marginTop: 10, display: 'inline-block', background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>
            {round.handicap_allowance}% handicap allowance
          </div>
        )}
      </div>

      {/* Late joiner notice */}
      {round.status === 'active' && (
        <div style={{ background: 'var(--amber-100)', border: '1px solid var(--amber-400)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--amber-500)', marginBottom: 2 }}>Joining a round in progress</p>
          <p style={{ fontSize: 12, color: 'var(--amber-500)' }}>Enter your handicap below then you can score all 18 holes including any already played.</p>
        </div>
      )}

      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Your handicap</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        Enter your exact WHS handicap index. Your playing handicap will be calculated automatically.
      </p>

      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label className="label">Exact handicap index</label>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              max="54"
              placeholder="e.g. 14.3"
              value={exactHandicap}
              onChange={e => setExactHandicap(e.target.value)}
              required
              style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}
            />
          </div>

          {calculatedHandicap !== null && (
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--green-100)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
              <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 2 }}>Calculated playing handicap</p>
              <p style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {calculatedHandicap}
              </p>
              <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>
                {exactHandicap} × {round.handicap_allowance}% = {calculatedHandicap}
              </p>
            </div>
          )}

          {/* Override toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useOverride}
              onChange={e => setUseOverride(e.target.checked)}
              style={{ accentColor: 'var(--green-600)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Override with a course-specific handicap</span>
          </label>

          {useOverride && (
            <div>
              <label className="label">Course handicap override</label>
              <input
                className="input"
                type="number"
                min="0"
                max="54"
                placeholder="e.g. 16"
                value={override}
                onChange={e => setOverride(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                This overrides the calculated value and is what will be used for scoring.
              </p>
            </div>
          )}
        </div>

        {/* Playing handicap summary */}
        {playingHandicap !== null && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Playing handicap for this round</p>
              <p style={{ fontSize: 28, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{playingHandicap}</p>
            </div>
            {useOverride && override !== '' && (
              <span style={{ fontSize: 12, background: 'var(--amber-100)', color: 'var(--amber-500)', padding: '4px 10px', borderRadius: 20, fontWeight: 500 }}>
                Manual override
              </span>
            )}
          </div>
        )}

        {error && <p style={{ fontSize: 13, color: 'var(--red-500)' }}>{error}</p>}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={saving || !exactHandicap || (useOverride && !override)}
          style={{ width: '100%' }}
        >
          {saving ? 'Joining…' : "Join round →"}
        </button>
      </form>
    </div>
  )
}
