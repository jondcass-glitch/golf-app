/**
 * Calculate strokes received on a hole based on playing handicap and stroke index.
 */
export function strokesReceived(playingHandicap, strokeIndex) {
  return (
    Math.floor(playingHandicap / 18) +
    (strokeIndex <= playingHandicap % 18 ? 1 : 0)
  )
}

/**
 * Calculate Stableford points for a single hole.
 */
export function stablefordPoints(grossScore, holePar, strokeIndex, playingHandicap) {
  const strokes = strokesReceived(playingHandicap, strokeIndex)
  const netScore = grossScore - strokes
  return Math.max(0, 2 + holePar - netScore)
}

/**
 * Calculate total Stableford points for a player across all scored holes.
 * scores: array of { gross_score, hole: { par, stroke_index } }
 */
export function totalStablefordPoints(scores, playingHandicap) {
  return scores.reduce((total, s) => {
    return total + stablefordPoints(
      s.gross_score,
      s.hole.par,
      s.hole.stroke_index,
      playingHandicap
    )
  }, 0)
}

/**
 * Calculate playing handicap from exact handicap, allowance %, and optional override.
 */
export function resolvePlayingHandicap(exactHandicap, allowancePercent, override = null) {
  if (override !== null && override !== undefined) return override
  return Math.round(exactHandicap * allowancePercent / 100)
}

/**
 * Return a label for a score relative to par (Eagle, Birdie, Par, etc.)
 */
export function scoreLabel(grossScore, par) {
  const diff = grossScore - par
  const labels = {
    '-3': 'Albatross',
    '-2': 'Eagle',
    '-1': 'Birdie',
     '0': 'Par',
     '1': 'Bogey',
     '2': 'Double bogey',
     '3': 'Triple bogey',
  }
  return labels[String(diff)] ?? (diff > 0 ? `+${diff}` : `${diff}`)
}
