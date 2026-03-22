import { stablefordPoints } from './scoring.js'

/**
 * Get Stableford points for a player on a specific set of hole numbers.
 */
function pointsForHoles(player, scores, holes, holeNumbers) {
  return holeNumbers.reduce((total, holeNum) => {
    const hole = holes.find(h => h.hole_number === holeNum)
    if (!hole) return total
    const score = scores.find(s => s.round_player_id === player.id && s.hole?.hole_number === holeNum)
    if (!score) return total
    return total + stablefordPoints(score.gross_score, hole.par, hole.stroke_index, player.playing_handicap)
  }, 0)
}

/**
 * Run countback tiebreaker between tied players.
 * Checks holes 13-18, then 16-18, then 18 only.
 * Returns array of winners (may still be multiple if all countbacks tie).
 */
function countback(tiedPlayers, scores, holes) {
  const countbackGroups = [
    [13, 14, 15, 16, 17, 18],
    [16, 17, 18],
    [18],
  ]

  let remaining = tiedPlayers

  for (const holeGroup of countbackGroups) {
    if (remaining.length <= 1) break

    const withPoints = remaining.map(p => ({
      ...p,
      cbPoints: pointsForHoles(p, scores, holes, holeGroup),
    }))

    const maxPoints = Math.max(...withPoints.map(p => p.cbPoints))
    const winners = withPoints.filter(p => p.cbPoints === maxPoints)

    // Only narrow down if it actually breaks the tie
    if (winners.length < remaining.length) {
      remaining = winners
    }
  }

  return remaining
}

/**
 * Find winner(s) for a set of holes with countback tiebreaker.
 * Returns { winners: [...players], wasCountback: bool, wasSplit: bool }
 */
function findWinner(players, scores, holes, holeNumbers) {
  if (!players.length) return { winners: [], wasCountback: false, wasSplit: false }

  const withPoints = players.map(p => ({
    ...p,
    pts: pointsForHoles(p, scores, holes, holeNumbers),
  }))

  const maxPoints = Math.max(...withPoints.map(p => p.pts))
  const tied = withPoints.filter(p => p.pts === maxPoints)

  if (tied.length === 1) {
    return { winners: tied, wasCountback: false, wasSplit: false, winningPoints: maxPoints }
  }

  // Run countback
  const afterCountback = countback(tied, scores, holes)

  return {
    winners: afterCountback,
    wasCountback: true,
    wasSplit: afterCountback.length > 1,
    winningPoints: maxPoints,
  }
}

/**
 * Main function — calculate all betting results for a round.
 *
 * Returns:
 * {
 *   format: 'overall_only' | 'front_back_overall' | 'none',
 *   stakePence: number,
 *   totalPotPence: number,
 *   results: [
 *     {
 *       pot: 'Overall' | 'Front 9' | 'Back 9',
 *       potPence: number,
 *       winners: [...players],
 *       winningPoints: number,
 *       wasCountback: bool,
 *       wasSplit: bool,
 *       rolledFrom: [...potNames] | null,
 *     }
 *   ]
 * }
 */
export function calculateBettingResults(round, players, scores, holes) {
  const { betting_format: format, stake_pence: stakePence } = round
  const playerCount = players.length
  const totalPotPence = stakePence * playerCount

  if (!format || format === 'none' || !stakePence) {
    return { format: 'none', stakePence: 0, totalPotPence: 0, results: [] }
  }

  const front9Holes = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const back9Holes  = [10, 11, 12, 13, 14, 15, 16, 17, 18]
  const allHoles    = [...front9Holes, ...back9Holes]

  if (format === 'overall_only') {
    const overall = findWinner(players, scores, holes, allHoles)
    const winningsEach = overall.wasSplit
      ? Math.floor(totalPotPence / overall.winners.length)
      : totalPotPence

    return {
      format,
      stakePence,
      totalPotPence,
      results: [{
        pot: 'Overall',
        potPence: totalPotPence,
        winningsEachPence: winningsEach,
        winners: overall.winners,
        winningPoints: overall.winningPoints,
        wasCountback: overall.wasCountback,
        wasSplit: overall.wasSplit,
        rolledFrom: null,
      }],
    }
  }

  if (format === 'front_back_overall') {
    const basePotPence = Math.floor(totalPotPence / 3)
    const remainder = totalPotPence - basePotPence * 3

    const front9Result = findWinner(players, scores, holes, front9Holes)
    const back9Result  = findWinner(players, scores, holes, back9Holes)

    // Calculate overall pot — may include rolled-in pots
    let overallPotPence = basePotPence + remainder
    const rolledFrom = []

    if (front9Result.wasSplit || front9Result.winners.length > 1) {
      overallPotPence += basePotPence
      rolledFrom.push('Front 9')
    }
    if (back9Result.wasSplit || back9Result.winners.length > 1) {
      overallPotPence += basePotPence
      rolledFrom.push('Back 9')
    }

    const overallResult = findWinner(players, scores, holes, allHoles)
    const overallWinningsEach = overallResult.wasSplit
      ? Math.floor(overallPotPence / overallResult.winners.length)
      : overallPotPence

    const results = []

    // Front 9
    if (!front9Result.wasSplit && front9Result.winners.length === 1) {
      results.push({
        pot: 'Front 9',
        potPence: basePotPence,
        winningsEachPence: basePotPence,
        winners: front9Result.winners,
        winningPoints: front9Result.winningPoints,
        wasCountback: front9Result.wasCountback,
        wasSplit: false,
        rolledFrom: null,
      })
    } else {
      results.push({
        pot: 'Front 9',
        potPence: basePotPence,
        winningsEachPence: 0,
        winners: front9Result.winners,
        winningPoints: front9Result.winningPoints,
        wasCountback: false,
        wasSplit: true,
        rolledFrom: null,
        rolledInto: 'Overall',
      })
    }

    // Back 9
    if (!back9Result.wasSplit && back9Result.winners.length === 1) {
      results.push({
        pot: 'Back 9',
        potPence: basePotPence,
        winningsEachPence: basePotPence,
        winners: back9Result.winners,
        winningPoints: back9Result.winningPoints,
        wasCountback: back9Result.wasCountback,
        wasSplit: false,
        rolledFrom: null,
      })
    } else {
      results.push({
        pot: 'Back 9',
        potPence: basePotPence,
        winningsEachPence: 0,
        winners: back9Result.winners,
        winningPoints: back9Result.winningPoints,
        wasCountback: false,
        wasSplit: true,
        rolledFrom: null,
        rolledInto: 'Overall',
      })
    }

    // Overall
    results.push({
      pot: 'Overall',
      potPence: overallPotPence,
      winningsEachPence: overallWinningsEach,
      winners: overallResult.winners,
      winningPoints: overallResult.winningPoints,
      wasCountback: overallResult.wasCountback,
      wasSplit: overallResult.wasSplit,
      rolledFrom: rolledFrom.length ? rolledFrom : null,
    })

    return { format, stakePence, totalPotPence, results }
  }

  return { format: 'none', stakePence: 0, totalPotPence: 0, results: [] }
}

/**
 * Format pence as £ string.
 */
export function formatPounds(pence) {
  return `£${(pence / 100).toFixed(2)}`
}
