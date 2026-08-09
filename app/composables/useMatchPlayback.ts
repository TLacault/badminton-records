import type { DerivedMatch, PlaybackState } from '~~/shared/badminton'
import { playbackAt } from '~~/shared/badminton'

/**
 * Reactive wrapper around `playbackAt`. The resolution logic itself is pure and
 * lives in shared/badminton, so it can be exercised without a component.
 */
export function useMatchPlayback(
  derived: Ref<DerivedMatch | null>,
  currentTime: Ref<number>,
) {
  return computed<PlaybackState>(() => playbackAt(derived.value, currentTime.value))
}
