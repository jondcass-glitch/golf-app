import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { stablefordPoints } from '../lib/scoring'
import { calculateBettingResults, formatPounds } from '../lib/betting'

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
    let totalPoints = 0, totalGross = 0, holesPlayed = 0
    let bestHole = null, bestHolePts = -1
    playerScores.forEach(s => {
      if (!s.hole) return
      const pts = stablefordPoints(s.gross_score, s.hole.par, s.hole.stroke_index, player.playing_handicap)
      totalPoints += pts
      totalGross += s.gross_score
      holesPlayed++
      if (pts > bestHolePts) { bestHolePts = pts; bestHole = { ...s.hole, pts, gross: s.gross_score } }
    })
    return { totalPoints, totalGross, holesPlayed, bestHole, scores: playerScores }
  }

  function getLeaderboard() {
    return players.map(p => ({ ...p, ...getPlayerStats(p) })).sort((a, b) => b.totalPoints - a.totalPoints)
  }

  const medals = ['🥇', '🥈', '🥉']
  const leaderboard = getLeaderboard()
  const winner = leaderboard[0]
  const bettingResults = round ? calculateBettingResults(round, players, scores, holes) : null

  if (loading) return <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--gray-500)' }}>Loading results…</div>

  return (
    <div className="page" style={{ paddingTop: 24, paddingBottom: 40 }}>

      {/* Winner banner */}
      {winner && (
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 2 }}>{winner.profile?.display_name} wins!</h1>
          <p style={{ fontSize: 15, color: 'var(--gray-500)' }}>{round?.name} · {round?.course?.name}</p>
          <div style={{ display: 'inline-block', marginTop: 10, background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 20, padding: '4px 16px' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green-700)', fontFamily: 'var(--font-mono)' }}>{winner.totalPoints} pts</span>
          </div>
        </div>
      )}

      {/* Betting results */}
      {bettingResults && bettingResults.format !== 'none' && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Betting results</h2>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              Total pot: <span style={{ fontWeight: 600, color: 'var(--green-700)' }}>{formatPounds(bettingResults.totalPotPence)}</span>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bettingResults.results.map(result => (
              <div key={result.pot} className="card" style={{
                background: result.rolledInto ? 'var(--gray-50)' : result.wasSplit ? '#fef3c7' : 'var(--green-50)',
                border: `1px solid ${result.rolledInto ? 'var(--gray-200)' : result.wasSplit ? '#fde68a' : 'var(--green-200)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{result.pot} pot</p>
                      {result.rolledFrom && (
                        <span style={{ fontSize: 11, background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '1px 8px', borderRadius: 10, fontWeight: 500 }}>
                          +{result.rolledFrom.join(' & ')} rolled in
                        </span>
                      )}
                      {result.rolledInto && (
                        <span style={{ fontSize: 11, background: 'var(--gray-100)', color: 'var(--gray-500)', border: '1px solid var(--gray-200)', padding: '1px 8px', borderRadius: 10 }}>
                          rolled into Overall
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                      {formatPounds(result.potPence)} pot · {result.winningPoints} pts
                      {result.wasCountback && ' · won on countback'}
                    </p>
                  </div>
                  {!result.rolledInto && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>each wins</p>
                      <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: result.wasSplit ? '#d97706' : 'var(--green-700)', lineHeight: 1 }}>
                        {formatPounds(result.winningsEachPence)}
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {result.winners.map(w => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', borderRadius: 20, padding: '4px 10px', border: '1px solid var(--gray-200)' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--green-700)' }}>
                        {w.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{w.profile?.display_name}</span>
                    </div>
                  ))}
                </div>
                {result.wasSplit && !result.rolledInto && (
                  <p style={{ fontSize: 12, color: '#d97706', marginTop: 8, fontWeight: 500 }}>Tied after countback — pot split equally</p>
                )}
              </div>
            ))}
          </div>

          {/* Per player net summary */}
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--gray-700)' }}>Per player summary</p>
            {players.map(p => {
              const winnings = bettingResults.results
                .filter(r => !r.rolledInto && r.winners.some(w => w.id === p.id))
                .reduce((sum, r) => sum + r.winningsEachPence, 0)
              const net = winnings - bettingResults.stakePence
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid var(--gray-100)' }}>
                  <span style={{ fontSize: 14 }}>{p.profile?.display_name}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: net > 0 ? 'var(--green-600)' : net < 0 ? 'var(--red-500)' : 'var(--gray-500)' }}>
                      {net > 0 ? '+' : ''}{formatPounds(net)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 6 }}>
                      {net > 0 ? 'profit' : net < 0 ? 'loss' : 'break even'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Final standings */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Final standings</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {leaderboard.map((player, rank) => (
          <div key={player.id} className="card" style={{ padding: '14px 16px', border: player.profile_id === user.id ? '1.5px solid var(--green-500)' : undefined, background: rank === 0 ? 'var(--green-50)' : 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{medals[rank] ?? `${rank + 1}`}</div>
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
                <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: rank === 0 ? 'var(--green-700)' : 'var(--gray-900)', lineHeight: 1 }}>{player.totalPoints}</p>
                <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>pts</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ width: '100%', marginTop: 24 }}>
        Back to home
      </button>
    </div>
  )
}
