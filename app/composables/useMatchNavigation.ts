import type { BreakInput, DerivedMatch } from '~~/shared/badminton'
import { resumeTimeAt } from '~~/shared/badminton'

/**
 * Jumping between the things a match is made of: points, sets, and the bits
 * worth watching twice.
 *
 * Every target is the moment play *starts*, pushed past any break covering it,
 * which is the same rule the timeline uses for a click. Landing mid-rally, or
 * on dead time, is never what "next point" means.
 */
export function useMatchNavigation(
  derived: Ref<DerivedMatch | null>,
  breaks: Ref<BreakInput[]>,
  currentTime: Ref<number>,
) {
  /**
   * A small margin, so "previous" during the first second of a point goes to
   * the one before rather than to the start of the point already playing —
   * and so "next" cannot be defeated by rounding.
   */
  const EPSILON = 0.75

  const rallyStarts = computed(() =>
    (derived.value?.rallyStates ?? []).map(s => s.startsAtSeconds),
  )

  const setStarts = computed(() => {
    const states = derived.value?.rallyStates ?? []
    return (derived.value?.sets ?? [])
      .map(set => states.find(s => s.idx === set.firstRallyIdx)?.startsAtSeconds)
      .filter((s): s is number => s !== undefined)
  })

  /** The first rally of each run of highlights, not every highlighted rally. */
  const highlightStarts = computed(() => {
    const out: number[] = []
    let previousEnd: number | null = null
    for (const state of derived.value?.rallyStates ?? []) {
      if (!state.isHighlight) {
        previousEnd = null
        continue
      }
      if (previousEnd === null || previousEnd !== state.startsAtSeconds) {
        out.push(state.startsAtSeconds)
      }
      previousEnd = state.endsAtSeconds
    }
    return out
  })

  function go(marks: number[], direction: 1 | -1): number | null {
    const now = currentTime.value
    const target = direction === 1
      ? marks.find(m => m > now + EPSILON)
      : [...marks].reverse().find(m => m < now - EPSILON)
    if (target === undefined) return null
    return resumeTimeAt(breaks.value, target)
  }

  return {
    /** Each returns the seconds to seek to, or null when there is no such mark. */
    prevPoint: () => go(rallyStarts.value, -1),
    nextPoint: () => go(rallyStarts.value, 1),
    prevSet: () => go(setStarts.value, -1),
    nextSet: () => go(setStarts.value, 1),
    prevHighlight: () => go(highlightStarts.value, -1),
    nextHighlight: () => go(highlightStarts.value, 1),
    hasHighlights: computed(() => highlightStarts.value.length > 0),
  }
}
