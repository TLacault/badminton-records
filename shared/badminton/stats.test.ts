import type { MatchConfig, RallyInput } from './types'
import { describe, expect, it } from 'vitest'
import { deriveMatch } from './derive'
import { matchStats, playerScoring } from './stats'

const P1 = 'player-1'
const P2 = 'player-2'
const P3 = 'player-3'

const CONFIG: MatchConfig = {
  format: 'doubles',
  rules: { bestOf: 3, pointsToWin: 5, winBy: 2, pointsCap: 7 },
  initialServerSide: 1,
  side1RightCourtSlot: 1,
  side2RightCourtSlot: 3,
  setStarts: [],
}

const SLOTS = { 1: P1, 2: P2, 3: P3, 4: null }

/** One rally per entry, five seconds apart, so durations are predictable. */
function log(
  entries: { winner: 1 | 2 | null, by?: string | null, highlight?: boolean, seconds?: number }[],
): RallyInput[] {
  let t = 0
  return entries.map((e, idx) => {
    t += e.seconds ?? 5
    return {
      idx,
      winnerSide: e.winner,
      isLet: e.winner === null,
      isHighlight: e.highlight ?? false,
      scoredByPlayerId: e.by ?? null,
      endedAtSeconds: t,
    }
  })
}

describe('playerScoring', () => {
  it('credits points and shares them against the player\'s own side', () => {
    const derived = deriveMatch(CONFIG, log([
      { winner: 1, by: P1 },
      { winner: 1, by: P2 },
      { winner: 1, by: P1 },
      { winner: 2, by: P3 },
    ]))

    const rows = playerScoring(derived, SLOTS)
    const p1 = rows.find(r => r.playerId === P1)!
    const p3 = rows.find(r => r.playerId === P3)!

    expect(p1.pointsScored).toBe(2)
    // Two of side 1's three points, not two of the match's four.
    expect(p1.shareOfSide).toBeCloseTo(2 / 3)
    expect(p3.shareOfSide).toBe(1)
  })

  it('skips empty slots', () => {
    const derived = deriveMatch(CONFIG, log([{ winner: 1, by: P1 }]))
    expect(playerScoring(derived, SLOTS).map(r => r.slot)).toEqual([1, 2, 3])
  })

  it('breaks a run on any point scored by someone else', () => {
    const derived = deriveMatch(CONFIG, log([
      { winner: 1, by: P1 },
      { winner: 1, by: P1 },
      { winner: 1, by: P2 },
      { winner: 1, by: P1 },
    ]))
    expect(playerScoring(derived, SLOTS).find(r => r.playerId === P1)!.bestRun).toBe(2)
  })

  it('counts only the highlights the player scored', () => {
    const derived = deriveMatch(CONFIG, log([
      { winner: 1, by: P1, highlight: true },
      { winner: 1, by: P2, highlight: true },
      { winner: 1, by: P1 },
    ]))
    expect(playerScoring(derived, SLOTS).find(r => r.playerId === P1)!.highlights).toBe(1)
  })

  it('reports zeroes rather than dividing by zero on an empty log', () => {
    const rows = playerScoring(deriveMatch(CONFIG, []), SLOTS)
    expect(rows.every(r => r.pointsScored === 0 && r.shareOfSide === 0)).toBe(true)
  })
})

describe('matchStats', () => {
  it('excludes lets from rally counts and averages', () => {
    const derived = deriveMatch(CONFIG, log([
      { winner: 1, by: P1, seconds: 10 },
      { winner: null, seconds: 30 },
      { winner: 2, by: P3, seconds: 10 },
    ]))
    const stats = matchStats(derived)

    expect(stats.rallies).toBe(2)
    expect(stats.lets).toBe(1)
    // The 30s let is dead time, not a 30s rally.
    expect(stats.meanRallySeconds).toBe(10)
    expect(stats.longestRally?.seconds).toBe(10)
  })

  it('splits points by side and counts those won on serve', () => {
    // Side 1 serves first, so its opening point is won on serve; side 2's
    // reply is won while receiving.
    const derived = deriveMatch(CONFIG, log([
      { winner: 1, by: P1 },
      { winner: 2, by: P3 },
      { winner: 2, by: P3 },
    ]))
    const [us, them] = matchStats(derived).sides

    expect(us.points).toBe(1)
    expect(us.wonOnServe).toBe(1)
    expect(them.points).toBe(2)
    expect(them.wonOnServe).toBe(1)
    expect(them.bestRun).toBe(2)
  })

  it('counts closed breaks and ignores an open one', () => {
    const derived = deriveMatch(CONFIG, log([{ winner: 1, by: P1 }]))
    const stats = matchStats(derived, [
      { idx: 0, startsAtSeconds: 10, endsAtSeconds: 70 },
      { idx: 1, startsAtSeconds: 200, endsAtSeconds: null },
    ])
    expect(stats.breakSeconds).toBe(60)
  })

  it('reports how many points were left without a scorer', () => {
    const derived = deriveMatch(CONFIG, log([
      { winner: 1, by: P1 },
      { winner: 1 },
    ]))
    const [us] = matchStats(derived).sides
    expect(us.points).toBe(2)
    expect(us.attributed).toBe(1)
  })

  it('is empty but well-formed for an untagged match', () => {
    const stats = matchStats(deriveMatch(CONFIG, []))
    expect(stats.rallies).toBe(0)
    expect(stats.meanRallySeconds).toBe(0)
    expect(stats.longestRally).toBeNull()
    expect(stats.sides.map(s => s.points)).toEqual([0, 0])
  })

  it('lists every set with its score', () => {
    // 5 points wins; side 1 takes set 1 outright.
    const derived = deriveMatch(CONFIG, log(
      Array.from({ length: 5 }, () => ({ winner: 1 as const, by: P1 })),
    ))
    const stats = matchStats(derived)
    expect(stats.sets[0]).toEqual({ number: 1, score: [5, 0], winnerSide: 1 })
  })
})
