import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to all scores and players in a round.
 * Updates in real time as any player records a score.
 */
export function useRound(roundId) {
  const [round, setRound] = useState(null)
  const [players, setPlayers] = useState([])
  const [scores, setScores] = useState([])
  const [holes, setHoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!roundId) return
    setLoading(true)
    fetchAll()

    // Realtime: new or updated scores
    const scoresSub = supabase
      .channel(`round-scores-${roundId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scores',
      }, () => fetchScores())
      .subscribe()

    // Realtime: players joining or updating handicap
    const playersSub = supabase
      .channel(`round-players-${roundId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'round_players',
        filter: `round_id=eq.${roundId}`
      }, () => fetchPlayers())
      .subscribe()

    // Realtime: round status changes (lobby → active → completed)
    const roundSub = supabase
      .channel(`round-${roundId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rounds',
        filter: `id=eq.${roundId}`
      }, (payload) => setRound(payload.new))
      .subscribe()

    return () => {
      supabase.removeChannel(scoresSub)
      supabase.removeChannel(playersSub)
      supabase.removeChannel(roundSub)
    }
  }, [roundId])

  async function fetchAll() {
    try {
      await Promise.all([fetchRound(), fetchPlayers(), fetchScores()])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRound() {
    const { data, error } = await supabase
      .from('rounds')
      .select('*, course:courses(*, holes(*))')
      .eq('id', roundId)
      .single()
    if (error) throw error
    setRound(data)
    setHoles(data.course?.holes?.sort((a, b) => a.hole_number - b.hole_number) ?? [])
  }

  async function fetchPlayers() {
    const { data, error } = await supabase
      .from('round_players')
      .select('*, profile:profiles(id, display_name, avatar_url)')
      .eq('round_id', roundId)
    if (error) throw error
    setPlayers(data ?? [])
  }

  async function fetchScores() {
    const { data, error } = await supabase
      .from('scores')
      .select('*, hole:holes(hole_number, par, stroke_index)')
      .in('round_player_id', players.length ? players.map(p => p.id) : ['none'])
    if (error) throw error
    setScores(data ?? [])
  }

  return { round, players, scores, holes, loading, error, refetch: fetchAll }
}
