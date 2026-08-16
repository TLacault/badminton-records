import type { BreakInput, RallyInput } from './types'

/**
 * Below this, a break is a double press rather than a pause: nobody leaves the
 * court for half a second, and the key that ends a break is easy to hit twice.
 * Also the width under which a clamped break is not worth keeping.
 */
export const MIN_BREAK_SECONDS = 1

/**
 * The one rule that keeps the log honest:
 *
 *   A break may not contain any rally's end timestamp.
 *
 * Rallies are contiguous — each starts where the last ended — so a break
 * naturally sits INSIDE the span of the rally that follows it. Cross a rally
 * end and the break claims the players were resting at the very instant a
 * point was recorded, which is how an inserted point ends up buried: the
 * timeline paints the break over it, `resumeTimeAt` skips past it, and
 * `withoutBreaks` cuts it out of the highlights.
 *
 * The gaps between consecutive rally ends are therefore the only windows a
 * break may occupy, and clamping is how a break gets back into one.
 */
function rallyStops(rallies: readonly RallyInput[]): number[] {
  return rallies.map(r => r.endedAtSeconds).sort((a, b) => a - b)
}

/**
 * Clamp `b` into the single rally gap it belongs in, holding `anchor` fixed.
 *
 * `anchor: 'end'` keeps the end and walks the start forwards — a break tagged
 * 3:30→4:00 that a newly inserted point ends inside at 3:44 becomes 3:44→4:00.
 * That is the physically true reading: play was still on until 3:44, so the
 * pause began there. It is also the edge the tagger actually observed, since a
 * break is recorded by one press as play resumes.
 *
 * `anchor: 'start'` is the mirror, for an end typed past the next point.
 *
 * An open break has no end, so it runs to wherever the video does and only its
 * start can move.
 *
 * Returns null when the clamp leaves nothing worth keeping, so the caller can
 * drop the break rather than store a sliver.
 */
export function clampBreak(
  rallies: readonly RallyInput[],
  b: BreakInput,
  anchor: 'start' | 'end',
): BreakInput | null {
  const stops = rallyStops(rallies)

  if (b.endsAtSeconds === null) {
    // Open: the end is the end of the video, so the gap is whatever follows the
    // last stop at or before the start. Only a stop strictly inside the break
    // can move it, and for an open break that means any stop past the start.
    const crossing = stops.filter(s => s > b.startsAtSeconds)
    const startsAtSeconds = crossing.length ? crossing[crossing.length - 1]! : b.startsAtSeconds
    return { ...b, startsAtSeconds }
  }

  let { startsAtSeconds, endsAtSeconds } = b

  if (anchor === 'end') {
    // The latest stop strictly before the end: the floor of the end's own gap.
    for (const s of stops) {
      if (s < endsAtSeconds && s > startsAtSeconds) startsAtSeconds = s
    }
  }
  else {
    // The earliest stop strictly after the start: the ceiling of its gap.
    for (const s of stops) {
      if (s > startsAtSeconds && s < endsAtSeconds) {
        endsAtSeconds = s
        break
      }
    }
  }

  if (endsAtSeconds - startsAtSeconds < MIN_BREAK_SECONDS) return null
  return { ...b, startsAtSeconds, endsAtSeconds }
}

/**
 * Every break put back inside a gap, with the ones that collapsed dropped.
 *
 * Anchored on the end throughout: this runs after the rally log moved under the
 * breaks — a point inserted, retimed, or deleted — and the end of a break is
 * the half that was actually tagged.
 */
export function clampBreaks(
  rallies: readonly RallyInput[],
  breaks: readonly BreakInput[],
): BreakInput[] {
  const kept: BreakInput[] = []
  for (const b of breaks) {
    const clamped = clampBreak(rallies, b, 'end')
    if (clamped) kept.push(clamped)
  }
  return kept
}
