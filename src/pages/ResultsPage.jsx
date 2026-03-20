import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { stablefordPoints } from '../lib/scoring'

export default function ResultsPage() {
  const { roundId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [round, setRound] = useState(null)
  const [players, setPlayers] = useState([])
  const [scores, setScores] = useState([])
  const [holes, setHoles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [roundId])

  async function fetchAll() {
    const { data: roundData } = await supabase
      .from('rounds')
      .select('*, course:courses(name, holes(*))')
      .eq('id', roundId)
      .single()

    if (!roundData) { setLoading(false); return }
    setRound(roundData)
    const sorted = (roundData.course?.holes ?? []).sort((a, b) => a.hole_number - b.hole_number)
    setHoles(sorted)

    const { data: playerData } = await supabase
      .from('round_players')
      .select('*, profile:profiles(display_name)')
      .eq('round_id', roundId)
    setPlayers(playerData ?? [])

    if (playerData?.length) {
      const { data: scoreData } = await supabase
        .from('scores')
        .select('*, hole:holes(hole_number, par, stroke_index)')
        .in('round_player_id', playerData.map(p => p.id))
      setScores(scoreData ?? [])
    }

    setLoading(false)
  }

  function getPlayerStats(player) {
    const playerScores = scores.filter(s => s.round_player_id === player.id)
    let totalPoints = 0
    let totalGross = 0
    let holesPlayed = 0
    let bestHole = null
    let bestHolePts = -1

    playerScores.forEach(s => {
      if (!s.hole) return
      const pts = stablefordPoints(s.gross_score, s.hole.par, s.hole.stroke_index, player.playing_handicap)
      totalPoints += pts
      totalGross += s.gross_score
      holesPlayed++
      if (pts > bestHolePts) {
        bestHolePts = pts
        bestHole = { ...s.hole, pts, gross: s.gross_score }
      }
    })

    return { totalPoints, totalGross, holesPlayed, bestHole, scores: playerScores }
  }

  function getLeaderboard() {
    return players
      .map(p => ({ ...p, ...getPlayerStats(p) }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
  }

  const medals = ['🥇', '🥈', '🥉']
  const leaderboard = getLeaderboard()
  const winner = leaderboard[0]

  if (loading) return <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--gray-500)' }}>Loading results…</div>

  return (
    <div className="page" style={{ paddingTop: 24, paddingBottom: 40 }}>

      {/* Winner banner */}
      {winner && (
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 2 }}>
            {winner.profile?.display_name} wins!
          </h1>
          <p style={{ fontSize: 15, color: 'var(--gray-500)' }}>
            {round?.name} · {round?.course?.name}
          </p>
          <div style={{ display: 'inline-block', marginTop: 10, background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 20, padding: '4px 16px' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green-700)', fontFamily: 'var(--font-mono)' }}>
              {winner.totalPoints} pts
            </span>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Final standings</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {leaderboard.map((player, rank) => (
          <div
            key={player.id}
            className="card"
            style={{
              padding: '14px 16px',
              border: player.profile_id === user.id ? '1.5px solid var(--green-500)' : undefined,
              background: rank === 0 ? 'var(--green-50)' : 'white',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 22, width: 32, textAlign: 'center' }}>
                {medals[rank] ?? `${rank + 1}`}
              </div>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--green-700)', flexShrink: 0 }}>
                {player.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 500 }}>{player.profile?.display_name}</p>
                <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {player.holesPlayed} holes · hcp {player.playing_handicap}
                  {player.bestHole && ` · best: hole ${player.bestHole.hole_number} (${player.bestHole.pts} pts)`}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: rank === 0 ? 'var(--green-700)' : 'var(--gray-900)', lineHeight: 1 }}>
                  {player.totalPoints}
                </p>
                <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>pts</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full scorecard */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Full scorecard</h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--green-700)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Hole</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Par</th>
                {players.map(p => (
                  <th key={p.id} style={{ textAlign: 'center', padding: '10px 8px', color: 'white', fontWeight: 600, minWidth: 44 }}>
                    {p.profile?.display_name?.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holes.map((hole, i) => (
                <tr key={hole.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)', borderBottom: '0.5px solid var(--gray-100)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{hole.hole_number}</td>
                  <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--gray-500)' }}>{hole.par}</td>
                  {players.map(p => {
                    const s = scores.find(sc => sc.round_player_id === p.id && sc.hole?.hole_number === hole.hole_number)
                    const pts = s ? stablefordPoints(s.gross_score, hole.par, hole.stroke_index, p.playing_handicap) : null
                    return (
                      <td key={p.id} style={{ padding: '8px 8px', textAlign: 'center' }}>
                        {s ? (
                          <div>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{s.gross_score}</span>
                            <span style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 2 }}>({pts})</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--gray-300)' }}>–</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr style={{ background: 'var(--green-50)', borderTop: '1px solid var(--green-200)' }}>
                <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--green-800)' }}>Total pts</td>
                {leaderboard.map(p => (
                  <td key={p.id} style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green-700)', fontSize: 15 }}>
                    {p.totalPoints}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <button
        className="btn btn-secondary"
        onClick={() => navigate('/')}
        style={{ width: '100%', marginTop: 24 }}
      >
        Back to home
      </button>
    </div>
  )
}
