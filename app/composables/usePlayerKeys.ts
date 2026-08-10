import type { KeybindActionId } from './useKeybinds'

/** What a page hands over so the shared shortcuts can drive its player. */
export interface PlayerKeyTargets {
  toggle: () => void
  seekBy: (delta: number) => void
  seekTo: (seconds: number) => void
  changeVolume: (delta: number) => number
  stepRate: (direction: 1 | -1) => number
  toggleFullscreen: () => void
  /** Each returns the seconds to jump to, or null when there is none. */
  jump: Record<'prevPoint' | 'nextPoint' | 'prevSet' | 'nextSet' | 'prevHighlight' | 'nextHighlight', () => number | null>
  /** Called on every handled press, so the chrome can surface itself. */
  wake?: () => void
}

const SEEK_SECONDS = 5
const VOLUME_STEP = 5

/**
 * The shortcuts every player answers to, public page and tagger alike.
 *
 * It resolves through `useKeybinds` rather than reading `event.key` directly,
 * so a rebound key follows the viewer here too, and so the tagger cannot end
 * up with one key meaning two things.
 *
 * Returns a handler rather than registering its own listener: the tagger
 * already owns a `keydown` on the window for scoring, and two listeners
 * racing over the same press is how a key ends up both seeking and scoring.
 */
export function usePlayerKeys(targets: PlayerKeyTargets) {
  const { actionFor } = useKeybinds()
  const scoreboard = useScoreboardMode()
  const timeline = usePlayerTimeline()

  /** Transient readouts, the way a television acknowledges a button. */
  const volumeFlash = ref<number | null>(null)
  const rateFlash = ref<number | null>(null)
  const seekFlash = ref<-1 | 1 | null>(null)
  const jumpFlash = ref<string | null>(null)

  function flash<T>(target: Ref<T | null>, value: T, ms = 900) {
    target.value = value
    const held = setTimeout(() => {
      if (target.value === value) target.value = null
    }, ms)
    timers.push(held)
  }
  const timers: ReturnType<typeof setTimeout>[] = []
  onBeforeUnmount(() => timers.forEach(clearTimeout))

  /**
   * Seeking to a mark that is not there — "next highlight" in a match with
   * none — says so rather than doing nothing, which is indistinguishable from
   * a dead key.
   */
  function jumpTo(id: keyof PlayerKeyTargets['jump'], label: string) {
    const seconds = targets.jump[id]()
    if (seconds === null) {
      flash(jumpFlash, `No ${label}`)
      return
    }
    targets.seekTo(seconds)
    flash(jumpFlash, label)
  }

  /** True when the press was ours, so the caller stops looking. */
  function handle(event: KeyboardEvent): boolean {
    const action = actionFor(event) as KeybindActionId | null
    if (!action) return false

    switch (action) {
      case 'playPause': targets.toggle(); break
      case 'seekBack': targets.seekBy(-SEEK_SECONDS); flash(seekFlash, -1, 700); break
      case 'seekForward': targets.seekBy(SEEK_SECONDS); flash(seekFlash, 1, 700); break
      case 'volumeUp': flash(volumeFlash, targets.changeVolume(VOLUME_STEP), 1200); break
      case 'volumeDown': flash(volumeFlash, targets.changeVolume(-VOLUME_STEP), 1200); break
      case 'speedDown': flash(rateFlash, targets.stepRate(-1), 1200); break
      case 'speedUp': flash(rateFlash, targets.stepRate(1), 1200); break
      case 'prevPoint': jumpTo('prevPoint', 'Previous point'); break
      case 'nextPoint': jumpTo('nextPoint', 'Next point'); break
      case 'prevSet': jumpTo('prevSet', 'Previous set'); break
      case 'nextSet': jumpTo('nextSet', 'Next set'); break
      case 'prevHighlight': jumpTo('prevHighlight', 'Previous highlight'); break
      case 'nextHighlight': jumpTo('nextHighlight', 'Next highlight'); break
      case 'fullscreen': targets.toggleFullscreen(); break
      case 'toggleScoreboard': scoreboard.toggleVisible(); break
      case 'scoreboardSize': scoreboard.toggle(); break
      case 'toggleTimeline': timeline.toggle(); break
      default: return false
    }

    event.preventDefault()
    // Every shortcut counts as activity: pressing one and watching nothing
    // appear, because the pointer had gone idle, reads as a dead key.
    targets.wake?.()
    return true
  }

  return { handle, volumeFlash, rateFlash, seekFlash, jumpFlash }
}

/**
 * Whether the timeline overlay is armed. Global rather than per page so the
 * choice survives moving between a match and the tagger.
 */
export function usePlayerTimeline() {
  const visible = useState('player-timeline-visible', () => true)

  function toggle() {
    visible.value = !visible.value
  }

  return { visible, toggle }
}
