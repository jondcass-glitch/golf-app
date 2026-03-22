// test-betting.mjs
// Run with: node test-betting.mjs
//
// Tests the calculateBettingResults function with mock data.
// No browser, no Supabase needed.

import { calculateBettingResults, formatPounds } from './src/lib/betting.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHoles() {
  // Par and stroke index for a standard 18 hole course
  const data = [
    { n:  1, par: 4, si: 11 }, { n:  2, par: 4, si:  3 },
    { n:  3, par: 3, si: 15 }, { n:  4, par: 4, si:  7 },
    { n:  5, par: 4, si:  1 }, { n:  6, par: 3, si: 17 },
    { n:  7, par: 4, si:  5 }, { n:  8, par: 4, si: 13 },
    { n:  9, par: 4, si:  9 }, { n: 10, par: 4, si: 10 },
    { n: 11, par: 3, si: 16 }, { n: 12, par: 4, si:  4 },
    { n: 13, par: 4, si:  8 }, { n: 14, par: 4, si:  2 },
    { n: 15, par: 3, si: 18 }, { n: 16, par: 4, si: 12 },
    { n: 17, par: 4, si:  6 }, { n: 18, par: 5, si: 14 },
  ]
  return data.map((h, i) => ({ id: `hole-${i+1}`, hole_number: h.n, par: h.par, stroke_index: h.si }))
}

function makePlayer(id, name, handicap) {
  return { id, profile: { display_name: name }, playing_handicap: handicap }
}

function makeScore(playerId, holeNumber, gross, holes) {
  const hole = holes.find(h => h.hole_number === holeNumber)
  return {
    id: `score-${playerId}-${holeNumber}`,
    round_player_id: playerId,
    hole_id: hole.id,
    gross_score: gross,
    hole: { hole_number: hole.hole_number, par: hole.par, stroke_index: hole.stroke_index },
  }
}

function makeRound(format, stakePounds) {
  return {
    betting_format: format,
    stake_pence: Math.round(stakePounds * 100),
  }
}

// ── Print result ─────────────────────────────────────────────────────────────

function printResults(label, results) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${label}`)
  console.log('═'.repeat(60))
  console.log(`  Format: ${results.format}`)
  console.log(`  Stake: ${formatPounds(results.stakePence)} | Total pot: ${formatPounds(results.totalPotPence)}`)

  results.results.forEach(r => {
    console.log(`\n  ── ${r.pot} pot (${formatPounds(r.potPence)}) ──`)
    if (r.rolledInto) {
      console.log(`     ⚠ Tied — rolled into Overall`)
    } else {
      console.log(`     Winners: ${r.winners.map(w => w.profile.display_name).join(', ')}`)
      console.log(`     Winning pts: ${r.winningPoints}`)
      console.log(`     Each wins: ${formatPounds(r.winningsEachPence)}`)
      if (r.wasCountback) console.log(`     ✓ Won on countback`)
      if (r.wasSplit)     console.log(`     ⚠ Split equally after countback`)
      if (r.rolledFrom)   console.log(`     + Rolled in from: ${r.rolledFrom.join(', ')}`)
    }
  })

  console.log('\n  Per player net:')
  const players = results.results.flatMap(r => r.winners)
  const seen = new Set()
  const allPlayers = results.results.flatMap(r => r.winners).filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })

  // Get all players from all results
  const allIds = new Set()
  results.results.forEach(r => r.winners.forEach(w => allIds.add(w.id)))

  // We need all players not just winners — pass them in
  results._allPlayers?.forEach(p => {
    const winnings = results.results
      .filter(r => !r.rolledInto && r.winners.some(w => w.id === p.id))
      .reduce((sum, r) => sum + r.winningsEachPence, 0)
    const net = winnings - results.stakePence
    const sign = net > 0 ? '+' : ''
    console.log(`     ${p.profile.display_name.padEnd(15)} ${sign}${formatPounds(net)}`)
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

const holes = makeHoles()

// Players
const alice = makePlayer('p1', 'Alice',  12)
const bob   = makePlayer('p2', 'Bob',    18)
const carol = makePlayer('p3', 'Carol',   8)
const dave  = makePlayer('p4', 'Dave',   24)
const players = [alice, bob, carol, dave]

function attachPlayers(results, players) {
  results._allPlayers = players
  return results
}

// ─────────────────────────────────────────────
// TEST 1: Overall only — clear winner
// ─────────────────────────────────────────────
{
  const scores = [
    // Alice scores par on everything = 2pts/hole (hcp 12, gets strokes on SI 1-12)
    ...Array.from({length:18}, (_, i) => makeScore('p1', i+1, holes[i].par, holes)),
    // Bob scores one over on everything
    ...Array.from({length:18}, (_, i) => makeScore('p2', i+1, holes[i].par + 1, holes)),
    // Carol scores one under on everything
    ...Array.from({length:18}, (_, i) => makeScore('p3', i+1, holes[i].par - 1, holes)),
    // Dave scores two over on everything
    ...Array.from({length:18}, (_, i) => makeScore('p4', i+1, holes[i].par + 2, holes)),
  ]
  const round = makeRound('overall_only', 10)
  const results = attachPlayers(calculateBettingResults(round, players, scores, holes), players)
  printResults('TEST 1: Overall only — clear winner (Carol should win)', results)
}

// ─────────────────────────────────────────────
// TEST 2: Overall only — genuine tie, split after countback
// Alice and Bob have identical handicap-adjusted scores on all holes
// ─────────────────────────────────────────────
{
  // Give both players hcp 0 so no strokes interfere — pure gross score tie
  const aliceZero = makePlayer('p1', 'Alice', 0)
  const bobZero   = makePlayer('p2', 'Bob',   0)
  const carolZero = makePlayer('p3', 'Carol', 0)
  const daveZero  = makePlayer('p4', 'Dave',  0)
  const zeroPlayers = [aliceZero, bobZero, carolZero, daveZero]

  const scores = [
    // Alice and Bob score identically on every hole — genuine tie, should split
    ...Array.from({length:18}, (_, i) => makeScore('p1', i+1, holes[i].par, holes)),
    ...Array.from({length:18}, (_, i) => makeScore('p2', i+1, holes[i].par, holes)),
    // Carol and Dave score worse
    ...Array.from({length:18}, (_, i) => makeScore('p3', i+1, holes[i].par + 1, holes)),
    ...Array.from({length:18}, (_, i) => makeScore('p4', i+1, holes[i].par + 2, holes)),
  ]
  const round = makeRound('overall_only', 10)
  const results = attachPlayers(calculateBettingResults(round, zeroPlayers, scores, holes), zeroPlayers)
  printResults('TEST 2: Overall only — genuine tie after all countbacks (Alice & Bob should SPLIT)', results)
}

// ─────────────────────────────────────────────
// TEST 3: Front/Back/Overall — clean winners each
// ─────────────────────────────────────────────
{
  const scores = [
    // Alice dominates front 9
    ...Array.from({length:9},  (_, i) => makeScore('p1', i+1,    holes[i].par - 1, holes)),
    ...Array.from({length:9},  (_, i) => makeScore('p1', i+10,   holes[i+9].par + 1, holes)),
    // Bob dominates back 9
    ...Array.from({length:9},  (_, i) => makeScore('p2', i+1,    holes[i].par + 1, holes)),
    ...Array.from({length:9},  (_, i) => makeScore('p2', i+10,   holes[i+9].par - 1, holes)),
    // Carol mediocre all round
    ...Array.from({length:18}, (_, i) => makeScore('p3', i+1,    holes[i].par, holes)),
    // Dave poor all round
    ...Array.from({length:18}, (_, i) => makeScore('p4', i+1,    holes[i].par + 2, holes)),
  ]
  const round = makeRound('front_back_overall', 10)
  const results = attachPlayers(calculateBettingResults(round, players, scores, holes), players)
  printResults('TEST 3: Front/Back/Overall — Alice wins F9, Bob wins B9, Carol wins Overall', results)
}

// ─────────────────────────────────────────────
// TEST 4: Front 9 tie — pot rolls to Overall
// ─────────────────────────────────────────────
{
  // Use hcp 0 so no strokes interfere with the tie
  const aliceZero = makePlayer('p1', 'Alice', 0)
  const bobZero   = makePlayer('p2', 'Bob',   0)
  const carolZero = makePlayer('p3', 'Carol', 0)
  const daveZero  = makePlayer('p4', 'Dave',  0)
  const zeroPlayers = [aliceZero, bobZero, carolZero, daveZero]

  const scores = [
    // Alice and Bob tie on front 9 (all par), Alice wins back 9
    ...Array.from({length:9},  (_, i) => makeScore('p1', i+1,  holes[i].par, holes)),
    ...Array.from({length:9},  (_, i) => makeScore('p1', i+10, holes[i+9].par - 1, holes)),
    ...Array.from({length:9},  (_, i) => makeScore('p2', i+1,  holes[i].par, holes)),
    ...Array.from({length:9},  (_, i) => makeScore('p2', i+10, holes[i+9].par + 1, holes)),
    ...Array.from({length:18}, (_, i) => makeScore('p3', i+1,  holes[i].par + 1, holes)),
    ...Array.from({length:18}, (_, i) => makeScore('p4', i+1,  holes[i].par + 2, holes)),
  ]
  const round = makeRound('front_back_overall', 10)
  const results = attachPlayers(calculateBettingResults(round, zeroPlayers, scores, holes), zeroPlayers)
  printResults('TEST 4: F9 tied — pot rolls into Overall (Alice wins Overall + rolled F9 pot)', results)
}

// ─────────────────────────────────────────────
// TEST 4b: Front 9 AND countback both tie — rolls to Overall
// ─────────────────────────────────────────────
{
  const aliceZero = makePlayer('p1', 'Alice', 0)
  const bobZero   = makePlayer('p2', 'Bob',   0)
  const zeroPlayers2 = [aliceZero, bobZero]

  const scores = [
    // Alice and Bob identical on holes 1-9 (F9 tie) and 13-18 (countback tie)
    // Alice birdies hole 10 making her the Overall winner
    ...Array.from({length:9},  (_, i) => makeScore('p1', i+1,  holes[i].par,     holes)), // F9: identical
    makeScore('p1', 10, holes[9].par - 1, holes),                                          // Alice birdie 10
    ...Array.from({length:8},  (_, i) => makeScore('p1', i+11, holes[i+10].par,  holes)), // 11-18: identical
    ...Array.from({length:18}, (_, i) => makeScore('p2', i+1,  holes[i].par,     holes)), // Bob: all par
  ]
  const round = makeRound('front_back_overall', 10)
  const results = attachPlayers(calculateBettingResults(round, zeroPlayers2, scores, holes), zeroPlayers2)
  printResults('TEST 4b: F9 tied + countback tied — F9 rolls to Overall (Alice wins Overall via hole 10 birdie)', results)
}
{
  const round = makeRound('none', 0)
  const results = attachPlayers(calculateBettingResults(round, players, [], holes), players)
  printResults('TEST 5: No betting', results)
}

console.log('\n' + '═'.repeat(60))
console.log('  All tests complete')
console.log('═'.repeat(60) + '\n')
