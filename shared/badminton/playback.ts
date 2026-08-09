import type { BreakInput, DerivedMatch, RallyState, Side, Slot } from './types'

export interface PlaybackState {
  /** The rally being played at this instant, or null before the first one. */
  rally: RallyState | null
  /** Scoreboard reading — what a spectator would see right now. */
  score: [number, number]
  gamesWon: [number, number]
  gameNumber: number
  servingSlot: Slot | null
  servingSide: Side | null
}

const EMPTY: PlaybackState = {
  rally: null,
  score: [0, 0],
  gamesWon: [0, 0],
  gameNumber: 1,
  servingSlot: null,
  servingSide: null,
}

/**
 * The rally spanning `t`, or null if `t` falls outside every rally.
 *
 * Half-open [start, end): a timestamp exactly on a boundary belongs to the
 * rally that is starting, not the one that just ended. Used to snap timeline
 * clicks to the start of the point clicked, since landing mid-rally is never
 * what the user wants.
 */
export function rallyAtTime(derived: DerivedMatch | null, t: number): RallyState | null {
  if (!derived) return null
  for (const s of derived.rallyStates) {
    if (t >= s.startsAtSeconds && t < s.endsAtSeconds) return s
  }
  return null
}

/** The break spanning `t`, or null. Half-open [start, end), like rallies. */
export function breakAtTime(
  breaks: readonly BreakInput[],
  t: number,
): BreakInput | null {
  for (const b of breaks) {
    if (t >= b.startsAtSeconds && (b.endsAtSeconds === null || t < b.endsAtSeconds)) {
      return b
    }
  }
  return null
}

/**
 * Where play actually resumes for a seek aimed at `t`.
 *
 * Rallies are contiguous and anchored at 0, so a rally's start can sit inside
 * dead time — the first point of a match "starts" at 0 even though the players
 * are still warming up, and the first point after a game break "starts" the
 * instant the previous game ended. Landing there means watching the pause.
 *
 * An open break has no resume point, so `t` is returned unchanged.
 */
export function resumeTimeAt(breaks: readonly BreakInput[], t: number): number {
  const during = breakAtTime(breaks, t)
  return during?.endsAtSeconds ?? t
}

/**
 * Resolves the match state at a point in the video.
 *
 * Rallies are contiguous — each starts where the last ended — so a timestamp
 * lands inside exactly one of them, except past the final rally. Mid-rally the
 * board shows `scoreBefore`: the point has not been awarded yet, which is what
 * a real scoreboard reads while the rally is in play.
 */
export function playbackAt(derived: DerivedMatch | null, t: number): PlaybackState {
  if (!derived || !derived.rallyStates.length) return { ...EMPTY }

  const states = derived.rallyStates

  // Last rally that has already begun.
  let current: RallyState | null = null
  let currentPos = -1
  for (let i = 0; i < states.length; i++) {
    const s = states[i]!
    if (s.startsAtSeconds > t) break
    current = s
    currentPos = i
  }

  if (!current) {
    // Defensive: deriveMatch anchors rally 0 at t=0, so with a non-empty log
    // this is unreachable for any t >= 0. It matters only if rally timing ever
    // stops starting at zero.
    const first = states[0]!
    return {
      ...EMPTY,
      gameNumber: first.gameNumber,
      servingSlot: first.servingSlot,
      servingSide: first.servingSide,
    }
  }

  // Only reachable past the final rally, since rallies are contiguous.
  const ended = t >= current.endsAtSeconds
  const next = ended ? states[currentPos + 1] ?? null : null

  // Games decided strictly before the rally on screen.
  const settledThrough = ended ? current.idx : current.idx - 1
  const gamesWon: [number, number] = [0, 0]
  for (const g of derived.games) {
    if (g.lastRallyIdx === null || g.lastRallyIdx > settledThrough) continue
    if (g.winnerSide === 1) gamesWon[0]++
    else if (g.winnerSide === 2) gamesWon[1]++
  }

  return {
    rally: current,
    score: ended ? current.scoreAfter : current.scoreBefore,
    gamesWon,
    gameNumber: current.gameNumber,
    servingSlot: next?.servingSlot ?? current.servingSlot,
    servingSide: next?.servingSide ?? current.servingSide,
  }
}
