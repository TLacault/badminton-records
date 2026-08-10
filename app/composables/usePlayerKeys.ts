import type { KeybindActionId } from './useKeybinds'

/** What a page hands over so the shared shortcuts can drive its player. */
export interface PlayerKeyTargets {
  toggle: () => void
  seekBy: (delta: number) => void
  changeVolume: (delta: number) => number
  toggleFullscreen: () => void
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

  /** The last volume set by a shortcut, for the on-screen readout. */
  const volumeFlash = ref<number | null>(null)
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  function flashVolume(value: number) {
    volumeFlash.value = value
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (volumeFlash.value = null), 1200)
  }
  onBeforeUnmount(() => {
    if (flashTimer) clearTimeout(flashTimer)
  })

  /** True when the press was ours, so the caller stops looking. */
  function handle(event: KeyboardEvent): boolean {
    const action = actionFor(event) as KeybindActionId | null
    if (!action) return false

    switch (action) {
      case 'playPause': targets.toggle(); break
      case 'seekBack': targets.seekBy(-SEEK_SECONDS); break
      case 'seekForward': targets.seekBy(SEEK_SECONDS); break
      case 'volumeUp': flashVolume(targets.changeVolume(VOLUME_STEP)); break
      case 'volumeDown': flashVolume(targets.changeVolume(-VOLUME_STEP)); break
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

  return { handle, volumeFlash }
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
