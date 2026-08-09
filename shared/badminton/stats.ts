import type { BreakInput, DerivedMatch, RallyState, Side } from './types'
import { sideOfSlot } from './rules'

/**
 * Summaries of a tagged match, for the panels under the video.
 *
 * Everything here is read off the derived rally log — nothing is stored, and
 * nothing is asked of the tagger beyond what they already press. Lets are
 * excluded throughout: a let scores nothing and belongs to nobody, so counting
 * it would inflate rally totals and dilute every average.
 */

export interface PlayerScoring {
  slot: number
  playerId: string | null
  /** Rallies this player was credited with ending. */
  pointsScored: number
  /** Share of their own side's points, 0–1. Zero when the side never scored. */
  shareOfSide: number
  highlights: number
  /** Longest run of consecutive side points credited to this player. */
  bestRun: number
}

export interface SideTotals {
  side: Side
  points: number
  /** Points credited to a named player. The rest were tagged without a scorer. */
  attributed: number
  highlights: number
  /** Longest run of consecutive points won by this side, across the match. */
  bestRun: number
  /** Points won while this side was serving. */
  wonOnServe: number
}

export interface MatchStats {
  rallies: number
  lets: number
  /** Rally time only — dead time between points is not counted. */
  playedSeconds: number
  /** Time inside tagged breaks. Open breaks contribute nothing. */
  breakSeconds: number
  meanRallySeconds: number
  longestRally: { seconds: number, idx: number } | null
  sides: [SideTotals, SideTotals]
  /** Final (or running) score of each set, in order. */
  sets: { number: number, score: [number, number], winnerSide: Side | null }[]
}

/** Scored rallies only: lets are not points and skew every total. */
function scoringRallies(derived: DerivedMatch): RallyState[] {
  return derived.rallyStates.filter(r => !r.isLet)
}

function duration(rally: RallyState): number {
  return Math.max(0, rally.endsAtSeconds - rally.startsAtSeconds)
}

/**
 * Per-player scoring, one row per occupied slot.
 *
 * `slotToPlayerId` decides which slots exist: a singles match maps two, a
 * doubles match four. Slots with no player are skipped rather than reported
 * empty, so callers can render the result directly.
 */
export function playerScoring(
  derived: DerivedMatch,
  slotToPlayerId: Record<number, string | null | undefined>,
): PlayerScoring[] {
  const rallies = scoringRallies(derived)

  const sidePoints: Record<Side, number> = { 1: 0, 2: 0 }
  for (const r of rallies) {
    const winner = r.scoreAfter[0] > r.scoreBefore[0] ? 1 : 2
    sidePoints[winner]++
  }

  return Object.entries(slotToPlayerId)
    .filter(([, playerId]) => Boolean(playerId))
    .map(([slotKey, playerId]) => {
      const slot = Number(slotKey)
      const side = sideOfSlot(slot as 1 | 2 | 3 | 4)
      const mine = rallies.filter(r => r.scoredByPlayerId === playerId)

      // A run is consecutive *credited* points: any rally scored by someone
      // else — either side — ends it. Two of my points either side of my
      // partner's is not a run of three.
      let bestRun = 0
      let run = 0
      for (const r of rallies) {
        if (r.scoredByPlayerId === playerId) {
          run++
          if (run > bestRun) bestRun = run
        }
        else {
          run = 0
        }
      }

      return {
        slot,
        playerId: playerId ?? null,
        pointsScored: mine.length,
        shareOfSide: sidePoints[side] ? mine.length / sidePoints[side] : 0,
        highlights: mine.filter(r => r.isHighlight).length,
        bestRun,
      }
    })
    .sort((a, b) => a.slot - b.slot)
}

function totalsFor(side: Side, rallies: RallyState[]): SideTotals {
  const won = rallies.filter(r =>
    (r.scoreAfter[0] > r.scoreBefore[0] ? 1 : 2) === side,
  )

  let bestRun = 0
  let run = 0
  for (const r of rallies) {
    if ((r.scoreAfter[0] > r.scoreBefore[0] ? 1 : 2) === side) {
      run++
      if (run > bestRun) bestRun = run
    }
    else {
      run = 0
    }
  }

  return {
    side,
    points: won.length,
    attributed: won.filter(r => r.scoredByPlayerId).length,
    highlights: won.filter(r => r.isHighlight).length,
    bestRun,
    wonOnServe: won.filter(r => r.servingSide === side).length,
  }
}

/** Whole-match totals: the grid printed under the two side columns. */
export function matchStats(
  derived: DerivedMatch,
  breaks: readonly BreakInput[] = [],
): MatchStats {
  const rallies = scoringRallies(derived)
  const playedSeconds = rallies.reduce((sum, r) => sum + duration(r), 0)

  let longestRally: MatchStats['longestRally'] = null
  for (const r of rallies) {
    const seconds = duration(r)
    if (!longestRally || seconds > longestRally.seconds) {
      longestRally = { seconds, idx: r.idx }
    }
  }

  return {
    rallies: rallies.length,
    lets: derived.rallyStates.length - rallies.length,
    playedSeconds,
    // An open break has no end yet, so it has no measurable length.
    breakSeconds: breaks.reduce(
      (sum, b) => sum + (b.endsAtSeconds === null ? 0 : b.endsAtSeconds - b.startsAtSeconds),
      0,
    ),
    meanRallySeconds: rallies.length ? playedSeconds / rallies.length : 0,
    longestRally,
    sides: [totalsFor(1, rallies), totalsFor(2, rallies)],
    sets: derived.sets.map(g => ({
      number: g.number,
      score: g.score,
      winnerSide: g.winnerSide,
    })),
  }
}
