import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { stablefordPoints, scoreLabel, strokesReceived } from '../lib/scoring'

const TABS = ['Leaderboard', 'Scorecard', 'Enter']

export default function PlayPage() {
  const { roundId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('Enter')
  const [round, setRound] = useState(null)
  const [holes, setHoles] = useState([])
  const [players, setPlayers] = useState([])
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)

  const [isOrganiser, setIsOrganiser] = useState(false)
  const [ending, setEnding] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [selectedHole, setSelectedHole] = useState(1)
  const [grossScore, setGrossScore] = useState(4)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    fetchAll()
  }, [roundId])

  // Re-subscribe to realtime whenever players list changes
  useEffect(() => {
    if (!players.length) return

    const sub = supabase
      .channel(`play-scores-${roundId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchScores(players))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` }, fetchAll)
      .subscribe()

    // Reconnect when tab becomes visible again (mobile fix)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchScores(players)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Poll every 15s as a fallback for mobile browsers that kill websockets
    const poll = setInterval(() => fetchScores(players), 15000)

    return () => {
      supabase.removeChannel(sub)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(poll)
    }
  }, [players])

  // When hole changes, pre-fill with par or existing score
  useEffect(() => {
    const hole = holes.find(h => h.hole_number === selectedHole)
    if (!hole) return
    const myPlayer = players.find(p => p.profile_id === user.id)
    if (!myPlayer) return
    const existing = scores.find(s => s.round_player_id === myPlayer.id && s.hole?.hole_number === selectedHole)
    setGrossScore(existing ? existing.gross_score : hole.par)
  }, [selectedHole, holes, scores, players])

  async function fetchAll() {
    const [, fetchedPlayers] = await Promise.all([fetchRound(), fetchPlayersAndScores()])
    setLoading(false)
  }

  async function fetchRound() {
    const { data } = await supabase
      .from('rounds')
      .select('*, course:courses(name, par, holes(*))')
      .eq('id', roundId)
      .single()
    if (data) {
      setRound(data)
      setIsOrganiser(data.created_by === user.id)
      if (data.status === 'completed') navigate(`/round/${roundId}/results`)
      const sorted = (data.course?.holes ?? []).sort((a, b) => a.hole_number - b.hole_number)
      setHoles(sorted)
      if (sorted.length) setGrossScore(sorted[0].par)
    }
  }

  async function fetchPlayersAndScores() {
    const { data: playerData } = await supabase
      .from('round_players')
      .select('*, profile:profiles(display_name)')
      .eq('round_id', roundId)
    if (!playerData?.length) return
    setPlayers(playerData)
    await fetchScores(playerData)
  }

  async function fetchScores(currentPlayers) {
    if (!currentPlayers?.length) return
    const { data } = await supabase
      .from('scores')
      .select('*, hole:holes(hole_number, par, stroke_index)')
      .in('round_player_id', currentPlayers.map(p => p.id))
    setScores(data ?? [])
  }

  async function saveScore() {
    const myPlayer = players.find(p => p.profile_id === user.id)
    const hole = holes.find(h => h.hole_number === selectedHole)
    if (!myPlayer || !hole) return

    setSaving(true)
    setSaveMsg('')

    const existing = scores.find(
      s => s.round_player_id === myPlayer.id && s.hole?.hole_number === selectedHole
    )

    const payload = {
      round_player_id: myPlayer.id,
      hole_id: hole.id,
      gross_score: grossScore,
    }

    let error
    if (existing) {
      ({ error } = await supabase.from('scores').update({ gross_score: grossScore }).eq('id', existing.id))
    } else {
      ({ error } = await supabase.from('scores').insert(payload))
    }

    if (!error) {
      await fetchScores(players)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2000)
      if (selectedHole < 18) setSelectedHole(h => h + 1)
    }
    setSaving(false)
  }

  async function endRound() {
    setEnding(true)
    await supabase.from('rounds').update({ status: 'completed' }).eq('id', roundId)
    navigate(`/round/${roundId}/results`)
  }

  // Compute leaderboard
  function getPlayerStats(player) {
    const playerScores = scores.filter(s => s.round_player_id === player.id)
    let totalPoints = 0
    let front9Points = 0
    let back9Points = 0
    let totalGross = 0
    let holesPlayed = 0

    playerScores.forEach(s => {
      if (!s.hole) return
      const pts = stablefordPoints(s.gross_score, s.hole.par, s.hole.stroke_index, player.playing_handicap)
      totalPoints += pts
      totalGross += s.gross_score
      holesPlayed++
      if (s.hole.hole_number <= 9) front9Points += pts
      else back9Points += pts
    })

    return { totalPoints, front9Points, back9Points, totalGross, holesPlayed, scores: playerScores }
  }

  function getLeaderboard() {
    return players
      .map(p => ({ ...p, ...getPlayerStats(p) }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
  }

  function getScoreStyle(gross, par) {
    const diff = gross - par
    if (diff <= -2) return { color: '#1D9E75', fontWeight: 600 }           // eagle or better — green
    if (diff === -1) return { color: '#dc2626', fontWeight: 600 }           // birdie — red
    if (diff === 0)  return { color: 'var(--gray-900)', fontWeight: 500 }   // par — black
    if (diff === 1)  return { color: '#185FA5', fontWeight: 500 }           // bogey — blue
    return { color: 'var(--gray-900)', fontWeight: 700 }                    // double bogey+ — bold black
  }

  const myPlayer = players.find(p => p.profile_id === user.id)
  const currentHole = holes.find(h => h.hole_number === selectedHole)
  const leaderboard = getLeaderboard()

  if (loading) return (
    <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--gray-500)' }}>
      Loading round…
    </div>
  )

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: 'var(--green-700)', padding: '16px 16px 0', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>{round?.course?.name}</p>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>{round?.name}</h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, opacity: 0.7 }}>your points</p>
              <p style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                {myPlayer ? getPlayerStats(myPlayer).totalPoints : 0}
              </p>
            </div>
            {isOrganiser && !showEndConfirm && (
              <button
                onClick={() => setShowEndConfirm(true)}
                style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '3px 10px', borderRadius: 12, cursor: 'pointer' }}
              >
                End round
              </button>
            )}
            {isOrganiser && showEndConfirm && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setShowEndConfirm(false)}
                  style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '3px 10px', borderRadius: 12, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={endRound}
                  disabled={ending}
                  style={{ fontSize: 11, background: 'rgba(220,38,38,0.8)', border: 'none', color: 'white', padding: '3px 10px', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}
                >
                  {ending ? 'Ending…' : 'Confirm end'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '8px 0',
                fontSize: 13,
                fontWeight: 500,
                background: 'none',
                border: 'none',
                color: tab === t ? 'white' : 'rgba(255,255,255,0.6)',
                borderBottom: tab === t ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* LEADERBOARD TAB */}
        {tab === 'Leaderboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaderboard.map((player, rank) => (
              <div
                key={player.id}
                className="card"
                style={{
                  padding: '12px 16px',
                  border: player.profile_id === user.id ? '1.5px solid var(--green-500)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--gray-300)', width: 24 }}>
                    {rank + 1}
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--green-700)', flexShrink: 0 }}>
                    {player.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{player.profile?.display_name}</span>
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      {player.holesPlayed} hole{player.holesPlayed !== 1 ? 's' : ''} · hcp {player.playing_handicap}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {player.holesPlayed > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 2 }}>
                          {player.holesPlayed > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                              <span style={{ color: 'var(--gray-500)', fontWeight: 500 }}>F</span> {player.front9Points}
                            </span>
                          )}
                          {player.holesPlayed > 9 && (
                            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                              <span style={{ color: 'var(--gray-500)', fontWeight: 500 }}>B</span> {player.back9Points}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green-700)', lineHeight: 1 }}>
                        {player.totalPoints}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>pts</p>
                    </div>
                  </div>
                </div>

                {/* Mini hole-by-hole dots */}
                {player.holesPlayed > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 10, flexWrap: 'wrap' }}>
                    {holes.map(hole => {
                      const s = player.scores.find(sc => sc.hole?.hole_number === hole.hole_number)
                      const pts = s ? stablefordPoints(s.gross_score, hole.par, hole.stroke_index, player.playing_handicap) : null
                      return (
                        <div
                          key={hole.hole_number}
                          title={`Hole ${hole.hole_number}: ${s ? `${s.gross_score} (${pts} pts)` : 'not played'}`}
                          style={{
                            width: 22, height: 22,
                            borderRadius: 4,
                            background: pts === null ? 'var(--gray-100)' : pts >= 3 ? '#1D9E75' : pts === 2 ? 'var(--green-100)' : pts === 1 ? 'var(--amber-100)' : 'var(--red-100)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 600,
                            color: pts === null ? 'var(--gray-300)' : pts >= 3 ? 'white' : pts === 2 ? 'var(--green-700)' : pts === 1 ? 'var(--amber-500)' : 'var(--red-500)',
                          }}
                        >
                          {pts !== null ? pts : '·'}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* SCORECARD TAB */}
        {tab === 'Scorecard' && (
          <div style={{ margin: '0 -16px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--green-700)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 8px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Hole</th>
                    <th style={{ textAlign: 'center', padding: '8px 6px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Par</th>
                    <th style={{ textAlign: 'center', padding: '8px 6px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>SI</th>
                    {players.map(p => (
                      <th key={p.id} colSpan={2} style={{ textAlign: 'center', padding: '8px 6px', color: p.profile_id === user.id ? 'white' : 'rgba(255,255,255,0.85)', fontWeight: 600, borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
                        {p.profile?.display_name?.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background: 'var(--green-800, #0f2419)' }}>
                    <th style={{ padding: '4px 8px' }} />
                    <th style={{ padding: '4px 6px' }} />
                    <th style={{ padding: '4px 6px' }} />
                    {players.map(p => (
                      <>
                        <th key={p.id + '-g'} style={{ textAlign: 'center', padding: '4px 4px', color: 'rgba(255,255,255,0.6)', fontWeight: 400, fontSize: 11, borderLeft: '1px solid rgba(255,255,255,0.15)' }}>Gross</th>
                        <th key={p.id + '-p'} style={{ textAlign: 'center', padding: '4px 4px', color: 'rgba(255,255,255,0.6)', fontWeight: 400, fontSize: 11 }}>Pts</th>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holes.map((hole, i) => (
                    <tr key={hole.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)', borderBottom: '0.5px solid var(--gray-100)' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 500 }}>{hole.hole_number}</td>
                      <td style={{ padding: '7px 6px', textAlign: 'center', color: 'var(--gray-500)' }}>{hole.par}</td>
                      <td style={{ padding: '7px 6px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>{hole.stroke_index}</td>
                      {players.map(p => {
                        const s = scores.find(sc => sc.round_player_id === p.id && sc.hole?.hole_number === hole.hole_number)
                        const pts = s ? stablefordPoints(s.gross_score, hole.par, hole.stroke_index, p.playing_handicap) : null
                        return (
                          <>
                            <td key={p.id + '-g'} style={{ padding: '7px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)', ...( s ? getScoreStyle(s.gross_score, hole.par) : { color: 'var(--gray-300)' }), borderLeft: '1px solid var(--gray-100)' }}>
                              {s ? s.gross_score : '–'}
                            </td>
                            <td key={p.id + '-p'} style={{ padding: '7px 4px', textAlign: 'center', fontSize: 12, fontWeight: 500, color: pts === null ? 'var(--gray-300)' : pts >= 3 ? 'var(--green-600)' : pts === 2 ? 'var(--gray-600)' : pts === 1 ? 'var(--amber-500)' : 'var(--red-500)' }}>
                              {pts !== null ? pts : '–'}
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  ))}

                  {/* Divider before totals */}
                  <tr style={{ background: 'var(--gray-100)' }}>
                    <td colSpan={3 + players.length * 2} style={{ padding: '2px 0' }} />
                  </tr>

                  {/* Total par row */}
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <td colSpan={2} style={{ padding: '8px 8px', fontWeight: 600, fontSize: 12, color: 'var(--gray-600)' }}>Course par</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gray-700)' }}>
                      {holes.reduce((sum, h) => sum + h.par, 0)}
                    </td>
                    {players.map(p => (
                      <>
                        <td key={p.id + '-par'} colSpan={2} style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 12, borderLeft: '1px solid var(--gray-100)' }}>—</td>
                      </>
                    ))}
                  </tr>

                  {/* Total gross row */}
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <td colSpan={3} style={{ padding: '8px 8px', fontWeight: 600, fontSize: 12, color: 'var(--gray-600)' }}>Total gross</td>
                    {players.map(p => {
                      const playerScores = scores.filter(s => s.round_player_id === p.id)
                      const totalGross = playerScores.reduce((sum, s) => sum + s.gross_score, 0)
                      return (
                        <>
                          <td key={p.id + '-tg'} style={{ padding: '8px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gray-700)', borderLeft: '1px solid var(--gray-100)' }}>
                            {totalGross || '–'}
                          </td>
                          <td key={p.id + '-tg2'} style={{ padding: '8px 4px' }} />
                        </>
                      )
                    })}
                  </tr>

                  {/* Total points row */}
                  <tr style={{ background: 'var(--green-50)', borderTop: '1px solid var(--green-200)' }}>
                    <td colSpan={3} style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--green-800)' }}>Total pts</td>
                    {players.map(p => (
                      <>
                        <td key={p.id + '-tp'} style={{ padding: '10px 4px', borderLeft: '1px solid var(--green-200)' }} />
                        <td key={p.id + '-tp2'} style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green-700)', fontSize: 15 }}>
                          {getPlayerStats(p).totalPoints}
                        </td>
                      </>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ENTER SCORE TAB */}
        {tab === 'Enter' && myPlayer && (
          <div>
            {/* Hole selector */}
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>Select hole</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
              {holes.map(hole => {
                const s = scores.find(sc => sc.round_player_id === myPlayer.id && sc.hole?.hole_number === hole.hole_number)
                const isSelected = hole.hole_number === selectedHole
                return (
                  <button
                    key={hole.id}
                    onClick={() => setSelectedHole(hole.hole_number)}
                    style={{
                      width: 36, height: 36,
                      borderRadius: 8,
                      border: isSelected ? '2px solid var(--green-600)' : '1px solid var(--gray-300)',
                      background: isSelected ? 'var(--green-600)' : s ? 'var(--green-50)' : 'white',
                      color: isSelected ? 'white' : s ? 'var(--green-700)' : 'var(--gray-700)',
                      fontSize: 13,
                      fontWeight: isSelected || s ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {hole.hole_number}
                  </button>
                )
              })}
            </div>

            {/* Hole info */}
            {currentHole && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <div className="card" style={{ flex: 1, textAlign: 'center', padding: '10px' }}>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>PAR</p>
                  <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{currentHole.par}</p>
                </div>
                <div className="card" style={{ flex: 1, textAlign: 'center', padding: '10px' }}>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>STROKE INDEX</p>
                  <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{currentHole.stroke_index}</p>
                </div>
                <div className="card" style={{ flex: 1, textAlign: 'center', padding: '10px' }}>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>STROKES REC.</p>
                  <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green-600)' }}>
                    +{strokesReceived(myPlayer.playing_handicap, currentHole.stroke_index)}
                  </p>
                </div>
              </div>
            )}

            {/* Score adjuster */}
            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12, textAlign: 'center' }}>
                Hole {selectedHole} — your gross score
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 8 }}>
                <button
                  onClick={() => setGrossScore(s => Math.max(1, s - 1))}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--gray-300)', background: 'white', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  −
                </button>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 56, fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1, ...(currentHole ? getScoreStyle(grossScore, currentHole.par) : { color: 'var(--gray-900)' }) }}>
                    {grossScore}
                  </p>
                </div>
                <button
                  onClick={() => setGrossScore(s => Math.min(20, s + 1))}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--gray-300)', background: 'white', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  +
                </button>
              </div>
              {currentHole && (
                <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--gray-500)', marginBottom: 4 }}>
                  {scoreLabel(grossScore, currentHole.par)}
                </p>
              )}
              {currentHole && myPlayer && (
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--green-600)', fontWeight: 500 }}>
                  {stablefordPoints(grossScore, currentHole.par, currentHole.stroke_index, myPlayer.playing_handicap)} Stableford point{stablefordPoints(grossScore, currentHole.par, currentHole.stroke_index, myPlayer.playing_handicap) !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <button
              className="btn btn-primary"
              onClick={saveScore}
              disabled={saving}
              style={{ width: '100%', marginBottom: 8 }}
            >
              {saving ? 'Saving…' : `Save score for hole ${selectedHole}`}
            </button>
            {saveMsg && (
              <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--green-600)', fontWeight: 500 }}>{saveMsg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
