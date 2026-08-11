import type { BreakInput, DerivedMatch, RallyState, Side, Slot } from './types'

export interface PlaybackState {
  /** The rally being played at this instant, or null before the first one. */
  rally: RallyState | null
  /** Scoreboard reading — what a spectator would see right now. */
  score: [number, number]
  setsWon: [number, number]
  setNumber: number
  servingSlot: Slot | null
  servingSide: Side | null
}

const EMPTY: PlaybackState = {
  rally: null,
  score: [0, 0],
  setsWon: [0, 0],
  setNumber: 1,
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

/**
 * The rally on screen at `t`: the last one to have begun.
 *
 * Not the same question as `rallyAtTime`, which asks whether `t` falls inside a
 * rally and answers null past the final one. A timestamp beyond the end of the
 * log — where tagging lives, a beat after the point was pressed — still resolves
 * to the last rally recorded here, because that is what is being watched.
 */
export function currentRallyAt(derived: DerivedMatch | null, t: number): RallyState | null {
  if (!derived) return null
  let current: RallyState | null = null
  for (const s of derived.rallyStates) {
    if (s.startsAtSeconds > t) break
    current = s
  }
  return current
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
 * are still warming up, and the first point after a set break "starts" the
 * instant the previous set ended. Landing there means watching the pause.
 *
 * An open break has no resume point, so `t` is returned unchanged.
 */
export function resumeTimeAt(breaks: readonly BreakInput[], t: number): number {
  let at = t
  // Breaks can abut — a second one tagged with no rally between it and the
  // first starts exactly where the first ended — so clearing one break can
  // land inside the next. Each pass moves strictly forwards, past a break it
  // will never meet again, so the log's length bounds the walk.
  for (let hops = 0; hops <= breaks.length; hops++) {
    const during = breakAtTime(breaks, at)
    if (!during || during.endsAtSeconds === null) return at
    at = during.endsAtSeconds
  }
  return at
}

/** A stretch of video, in seconds. Half-open [from, to), like rallies. */
export interface Span {
  from: number
  to: number
}

/**
 * `span` with every break cut out of it — nothing, one piece, or several.
 *
 * A break is not only ever at the front of the span it touches. Deleting or
 * retiming a point moves the rally boundary the break was tagged against and
 * leaves it stranded mid-rally, and an open break covers everything after it,
 * which is how the timeline paints one. So the only reliable answer is to
 * subtract them all rather than to push the start past the first.
 */
function withoutBreaks(span: Span, breaks: readonly BreakInput[]): Span[] {
  let pieces: Span[] = [span]

  for (const b of breaks) {
    // An open break has no end: it runs to wherever the video does.
    const from = b.startsAtSeconds
    const to = b.endsAtSeconds ?? Number.POSITIVE_INFINITY
    const kept: Span[] = []
    for (const piece of pieces) {
      if (to <= piece.from || from >= piece.to) kept.push(piece)
      else {
        if (from > piece.from) kept.push({ from: piece.from, to: from })
        if (to < piece.to) kept.push({ from: to, to: piece.to })
      }
    }
    pieces = kept
  }

  return pieces
}

/**
 * The passages worth watching twice: runs of highlighted rallies, as play time.
 *
 * Rallies are contiguous, so a rally's span reaches back over any break in
 * front of it and covers any break left inside it. Drawn or replayed raw, a
 * passage tagged after a pause would begin where the players walked off the
 * court, and a break between two highlighted points would be swallowed by the
 * merge into one passage that is mostly interval. Nobody tagged the dead time,
 * so it is cut out — which can leave a single point as two passages, with the
 * pause that interrupted it between them.
 *
 * Adjacent highlights with no break between them still merge, so a great
 * exchange tagged across three points reads as one passage rather than three.
 */
export function highlightSpans(
  states: readonly RallyState[],
  breaks: readonly BreakInput[] = [],
): Span[] {
  const runs: Span[] = []

  for (const s of states) {
    if (!s.isHighlight) continue
    const open = runs.at(-1)
    if (open && open.to === s.startsAtSeconds) open.to = s.endsAtSeconds
    else runs.push({ from: s.startsAtSeconds, to: s.endsAtSeconds })
  }

  return runs.flatMap(run => withoutBreaks(run, breaks))
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
  const current = currentRallyAt(derived, t)
  const currentPos = current ? states.indexOf(current) : -1

  if (!current) {
    // Defensive: deriveMatch anchors rally 0 at t=0, so with a non-empty log
    // this is unreachable for any t >= 0. It matters only if rally timing ever
    // stops starting at zero.
    const first = states[0]!
    return {
      ...EMPTY,
      setNumber: first.setNumber,
      servingSlot: first.servingSlot,
      servingSide: first.servingSide,
    }
  }

  // Only reachable past the final rally, since rallies are contiguous.
  const ended = t >= current.endsAtSeconds
  const next = ended ? states[currentPos + 1] ?? null : null

  // Sets decided strictly before the rally on screen.
  const settledThrough = ended ? current.idx : current.idx - 1
  const setsWon: [number, number] = [0, 0]
  for (const g of derived.sets) {
    if (g.lastRallyIdx === null || g.lastRallyIdx > settledThrough) continue
    if (g.winnerSide === 1) setsWon[0]++
    else if (g.winnerSide === 2) setsWon[1]++
  }

  return {
    rally: current,
    score: ended ? current.scoreAfter : current.scoreBefore,
    setsWon,
    setNumber: current.setNumber,
    servingSlot: next?.servingSlot ?? current.servingSlot,
    servingSide: next?.servingSide ?? current.servingSide,
  }
}
