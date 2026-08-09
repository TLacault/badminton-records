import type { DerivedMatch, RallyState, Side, Slot } from './types'

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
