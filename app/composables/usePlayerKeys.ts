import type { KeybindActionId } from './useKeybinds'

/** What a page hands over so the shared shortcuts can drive its player. */
export interface PlayerKeyTargets {
  toggle: () => void
  /** Stepping a frame stops the video first; a frame is meaningless in motion. */
  pause: () => void
  seekBy: (delta: number) => void
  seekTo: (seconds: number) => void
  changeVolume: (delta: number) => number
  stepRate: (direction: 1 | -1) => number
  toggleFullscreen: () => void
  /**
   * Hold the play/pause key to run at double speed.
   *
   * The stage owns the boost, because the same gesture arrives there as a
   * finger held on the video. `releaseBoost` says whether the press had
   * actually become a hold, which is what decides whether letting go is also
   * a play/pause.
   */
  holdBoost?: () => void
  releaseBoost?: () => boolean
  /** Each returns the seconds to jump to, or null when there is none. */
  jump: Record<'prevPoint' | 'nextPoint' | 'prevSet' | 'nextSet' | 'prevHighlight' | 'nextHighlight', () => number | null>
  /** Called on every handled press, so the chrome can surface itself. */
  wake?: () => void
}

const VOLUME_STEP = 5

/**
 * One frame at 60fps, which is what the rig films and uploads. YouTube gives
 * no way to ask a video for its frame rate, so this is a constant rather than
 * a reading: on a 30fps upload it steps half a frame, and the picture moves on
 * every second press instead of every one.
 */
const FRAME_SECONDS = 1 / 60

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
  // How far a jump goes is the viewer's, set in the settings menu: reviewing a
  // rally and watching a match through want very different distances.
  const { skipSeconds } = usePlayerSettings()

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

  /**
   * Jump by the configured distance, and say so.
   *
   * Shared with the stage's double-tap zones rather than duplicated there: one
   * place decides how far a jump goes and what it looks like when it lands, so
   * the edge of the video and the seek key can never disagree.
   */
  function nudge(direction: -1 | 1) {
    targets.seekBy(direction * skipSeconds.value)
    flash(seekFlash, direction, 700)
    targets.wake?.()
  }

  /** Pauses, then nudges by a frame — the way a video editor scrubs. */
  function stepFrame(direction: 1 | -1, label: string) {
    targets.pause()
    targets.seekBy(direction * FRAME_SECONDS)
    flash(jumpFlash, label, 700)
  }

  /** True when the press was ours, so the caller stops looking. */
  function handle(event: KeyboardEvent): boolean {
    const action = actionFor(event) as KeybindActionId | null
    if (!action) return false

    switch (action) {
      // Held rather than pressed: the key starts the boost clock and the
      // release decides what it was. A page that has not wired the boost up
      // keeps the old behaviour, since a play/pause key that waits for a keyup
      // nobody listens for is a dead key.
      case 'playPause':
        if (!targets.releaseBoost) targets.toggle()
        else if (!event.repeat) targets.holdBoost?.()
        break
      case 'seekBack': nudge(-1); break
      case 'seekForward': nudge(1); break
      // The toast, not the seek arrows beside it: those are drawn with "5s" on
      // them. A frame moves the picture too little to be sure the key landed.
      case 'prevFrame': stepFrame(-1, 'Frame back'); break
      case 'nextFrame': stepFrame(1, 'Frame forward'); break
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

  /**
   * The other half of the play/pause key: let go, and either the boost ends or
   * the video is toggled — never both.
   *
   * Deciding on the release costs nothing that can be felt. A tap lasts eighty
   * milliseconds, and eighty milliseconds is not a delay; half a second of
   * holding is a different gesture, and this is the only moment at which the
   * two can be told apart.
   */
  function handleUp(event: KeyboardEvent): boolean {
    if (actionFor(event) !== 'playPause' || !targets.releaseBoost) return false
    event.preventDefault()
    if (!targets.releaseBoost()) targets.toggle()
    targets.wake?.()
    return true
  }

  return { handle, handleUp, nudge, volumeFlash, rateFlash, seekFlash, jumpFlash }
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
