/**
 * Hold to run at double speed; let go and it drops back.
 *
 * The gesture is the same on both ends of the device range — a finger held on
 * the video, a thumb held on the play/pause key — so the rule that decides
 * when a press stops being a press lives in one place. A hold shorter than
 * `BOOST_HOLD_MS` never boosts at all, which is what leaves the tap and the
 * keypress free to mean what they always meant.
 */

/** Where a held press takes the speed. Twice is the one everyone knows. */
export const BOOST_RATE = 2

/** How long a press has to last before it becomes a hold. */
export const BOOST_HOLD_MS = 500

export interface BoostControl {
  rate: () => number
  setRate: (rate: number) => void
  /**
   * A hold on a paused video is not a request for double speed — it is a
   * finger resting on the screen — so the clock only runs while play does.
   */
  isPlaying: () => boolean
}

export function useSpeedBoost(control: BoostControl) {
  /**
   * Global, because the two gestures drive one player and the "2×" pill that
   * says what is happening is drawn once, by the stage: the touch layer and
   * the keyboard must be able to raise the same flag.
   */
  const boosting = useState('player-speed-boost', () => false)

  let timer: ReturnType<typeof setTimeout> | null = null
  /** The speed to come back to — the viewer's own, not an assumed 1×. */
  let previous = 1

  function engage() {
    timer = null
    if (boosting.value) return
    previous = control.rate()
    control.setRate(BOOST_RATE)
    boosting.value = true
  }

  /** Starts the clock on a press that may yet turn into a hold. */
  function arm() {
    if (timer || boosting.value || !control.isPlaying()) return
    timer = setTimeout(engage, BOOST_HOLD_MS)
  }

  /**
   * Lets go, and says whether the press had become a hold.
   *
   * That answer is the whole point: a press that boosted has already done its
   * job, and the tap or keypress it would otherwise have been must not fire
   * on top of it.
   */
  function release(): boolean {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!boosting.value) return false
    boosting.value = false
    control.setRate(previous)
    return true
  }

  /**
   * A key held while the window loses focus never sends its keyup, and the
   * video would be left running at double speed with nothing on screen to say
   * why. Letting go on blur is the same rule as letting go of the key.
   */
  onMounted(() => window.addEventListener('blur', release))
  onBeforeUnmount(() => {
    window.removeEventListener('blur', release)
    release()
  })

  return { boosting, arm, release }
}
