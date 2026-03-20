import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function RoundPage() {
  const { roundId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [round, setRound] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOrganiser, setIsOrganiser] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    fetchRound()

    const sub = supabase
      .channel(`lobby-${roundId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` }, fetchPlayers)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` }, (payload) => {
        setRound(payload.new)
        if (payload.new.status === 'active') navigate(`/round/${roundId}/play`)
      })
      .subscribe()

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') fetchPlayers()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const poll = setInterval(fetchPlayers, 15000)

    return () => {
      supabase.removeChannel(sub)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(poll)
    }
  }, [roundId])

  async function fetchRound() {
    const { data } = await supabase
      .from('rounds')
      .select('*, course:courses(name, location)')
      .eq('id', roundId)
      .single()
    if (data) {
      setRound(data)
      setIsOrganiser(data.created_by === user.id)
      if (data.status === 'active') navigate(`/round/${roundId}/play`)
    }
    await fetchPlayers()
    setLoading(false)
  }

  async function fetchPlayers() {
    const { data, error } = await supabase
      .from('round_players')
      .select('*, profile:profiles(display_name)')
      .eq('round_id', roundId)
    console.log('fetchPlayers result:', data, error)
    setPlayers(data ?? [])
  }

  async function startRound() {
    setStarting(true)
    await supabase.from('rounds').update({ status: 'active' }).eq('id', roundId)
    setStarting(false)
  }

  if (loading) return <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="card" style={{ background: 'var(--green-700)', border: 'none', color: 'white', marginBottom: 24 }}>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lobby</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 2 }}>{round?.name}</h1>
        <p style={{ fontSize: 14, opacity: 0.8 }}>{round?.course?.name}</p>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Join code</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, letterSpacing: '0.15em', background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: 8 }}>
            {round?.join_code}
          </span>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        Players joined ({players.length})
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {players.map(p => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--green-700)' }}>
                {p.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{p.profile?.display_name}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Playing hcp</p>
              <p style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--green-700)' }}>{p.playing_handicap}</p>
            </div>
          </div>
        ))}
        {players.length === 0 && (
          <p style={{ fontSize: 14, color: 'var(--gray-500)', textAlign: 'center', padding: '20px 0' }}>
            Waiting for players to join…
          </p>
        )}
      </div>

      {isOrganiser && (
        <button
          className="btn btn-primary"
          onClick={startRound}
          disabled={starting || players.length === 0}
          style={{ width: '100%' }}
        >
          {starting ? 'Starting…' : `Start round with ${players.length} player${players.length !== 1 ? 's' : ''}`}
        </button>
      )}
      {!isOrganiser && (
        <p style={{ fontSize: 14, color: 'var(--gray-500)', textAlign: 'center' }}>
          Waiting for the organiser to start the round…
        </p>
      )}
    </div>
  )
}
