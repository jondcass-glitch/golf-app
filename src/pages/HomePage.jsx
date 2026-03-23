import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [activeRound, setActiveRound] = useState(null)

  const isGuest = user?.is_anonymous === true

  useEffect(() => {
    if (profile?.id) checkForActiveRound()
  }, [profile])

  async function checkForActiveRound() {
    const { data } = await supabase
      .from('round_players')
      .select('round_id, joined_at, rounds!inner(id, name, status, course:courses(name))')
      .eq('profile_id', profile.id)
      .in('rounds.status', ['active', 'lobby'])
      .order('joined_at', { ascending: false })
      .limit(1)

    if (data?.length) setActiveRound(data[0].rounds)
  }

  async function handleJoin(e) {
    e.preventDefault()
    setJoining(true)
    setJoinError(null)

    const { data, error } = await supabase
      .from('rounds')
      .select('id, status')
      .eq('join_code', joinCode.toUpperCase().trim())
      .single()

    if (error || !data) {
      setJoinError('Round not found. Check the code and try again.')
      setJoining(false)
      return
    }
    if (data.status === 'completed') {
      setJoinError('This round has already finished.')
      setJoining(false)
      return
    }
    navigate(`/round/${data.id}/join`)
  }

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>
            Hey, {profile?.display_name?.split(' ')[0] ?? 'golfer'} 👋
          </h1>
          <p style={{ fontSize: 14, color: 'var(--gray-500)' }}>Ready to play?</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/profile')} style={{ fontSize: 13 }}>Profile</button>
          <button className="btn btn-ghost" onClick={signOut} style={{ fontSize: 13 }}>Sign out</button>
        </div>
      </div>

      {activeRound && (
        <div
          className="card"
          style={{ background: 'var(--green-50)', border: '1.5px solid var(--green-500)', marginBottom: 16, cursor: 'pointer' }}
          onClick={() => navigate(activeRound.status === 'active' ? `/round/${activeRound.id}/play` : `/round/${activeRound.id}`)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green-500)' }} />
                <p style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 500 }}>
                  {activeRound.status === 'active' ? 'Round in progress' : 'In lobby'}
                </p>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--green-800)' }}>{activeRound.name}</p>
              <p style={{ fontSize: 13, color: 'var(--green-700)' }}>{activeRound.course?.name}</p>
            </div>
            <span style={{ fontSize: 20, color: 'var(--green-600)' }}>→</span>
          </div>
        </div>
      )}

      {/* Guest upgrade banner */}
      {isGuest && (
        <div className="card" style={{ background: 'var(--amber-100,#fef3c7)', border: '1px solid #fde68a', marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#92400e', marginBottom: 4 }}>You're signed in as a guest</p>
          <p style={{ fontSize: 13, color: '#b45309', marginBottom: 10 }}>Create a full account to create rounds, track history and keep your handicap saved.</p>
          <button className="btn btn-primary" onClick={signOut} style={{ fontSize: 13, padding: '8px 16px' }}>
            Sign in with Google or email →
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Create round — hidden for guests */}
        {!isGuest && (
        <div className="card" style={{ background: 'var(--green-700)', border: 'none', color: 'white' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Create a round</h2>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>Set up a new round and invite your group with a 6-digit code.</p>
          <button className="btn" onClick={() => navigate('/round/new')} style={{ background: 'white', color: 'var(--green-700)', width: '100%' }}>
            Create round
          </button>
        </div>
        )}

        {/* Join round */}
        <div className="card">
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>Enter the 6-character code shared by the organiser.</p>
          <form onSubmit={handleJoin}>
            <input
              className="input"
              placeholder="e.g. GX7K2P"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              maxLength={6}
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)', fontSize: 18, marginBottom: 12, textAlign: 'center' }}
            />
            {joinError && <p style={{ fontSize: 13, color: 'var(--red-500)', marginBottom: 10 }}>{joinError}</p>}
            <button className="btn btn-primary" type="submit" disabled={joining || joinCode.length < 6} style={{ width: '100%' }}>
              {joining ? 'Finding round…' : 'Join round'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
