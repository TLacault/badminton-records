import type { ScoringRules, Side, Slot } from './types'

export const DEFAULT_RULES: ScoringRules = {
  bestOf: 3,
  pointsToWin: 21,
  winBy: 2,
  pointsCap: 30,
}

/** A game is over at pointsToWin with a winBy margin, or immediately at the cap. */
export function isGameOver(a: number, b: number, rules: ScoringRules): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (hi >= rules.pointsCap) return true
  return hi >= rules.pointsToWin && hi - lo >= rules.winBy
}

/**
 * Reads one side's score.
 *
 * Indexing a tuple with `side - 1` widens to `number | undefined` under
 * noUncheckedIndexedAccess, so every score access goes through here instead.
 */
export function scoreOf(score: readonly [number, number], side: Side): number {
  return side === 1 ? score[0] : score[1]
}

/** Returns a new score with one point added for `side`. */
export function addPoint(
  score: readonly [number, number],
  side: Side,
): [number, number] {
  return side === 1 ? [score[0] + 1, score[1]] : [score[0], score[1] + 1]
}

/** Would giving `side` one more point end the game? */
export function wouldEndGame(
  score: readonly [number, number],
  side: Side,
  rules: ScoringRules,
): boolean {
  const next = addPoint(score, side)
  return isGameOver(next[0], next[1], rules)
}

export function gamesNeeded(rules: ScoringRules): number {
  return Math.floor(rules.bestOf / 2) + 1
}

export function otherSide(side: Side): Side {
  return side === 1 ? 2 : 1
}

export function sideOfSlot(slot: Slot): Side {
  return slot <= 2 ? 1 : 2
}

export function partnerSlot(slot: Slot): Slot {
  if (slot === 1) return 2
  if (slot === 2) return 1
  if (slot === 3) return 4
  return 3
}

/** In singles only slots 1 and 3 are used. */
export function singlesSlot(side: Side): Slot {
  return side === 1 ? 1 : 3
}
