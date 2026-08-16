const HIDE_KEY = 'ust-player-autohide-seconds'

/** Off is stored as 0 — one key, and "never" is just the bottom of the scale. */
const OFF = 0

export const AUTO_HIDE_MIN = 0.5
export const AUTO_HIDE_MAX = 5
export const AUTO_HIDE_STEP = 0.5

/** Every stop the segmented range offers, Off excluded. */
export const AUTO_HIDE_STOPS = Array.from(
  { length: Math.round((AUTO_HIDE_MAX - AUTO_HIDE_MIN) / AUTO_HIDE_STEP) + 1 },
  (_, i) => Number((AUTO_HIDE_MIN + i * AUTO_HIDE_STEP).toFixed(1)),
)

const DEFAULT_SECONDS = 2

/**
 * How long the chrome waits before it goes, and whether it goes at all.
 *
 * Two seconds was a constant inside the stage. It is the right default and the
 * wrong law: scrubbing a rally frame by frame wants the bar to stay, and
 * watching a match through wants it gone sooner than that. Held globally rather
 * than per page so the choice survives moving between a match and the tagger,
 * and in `localStorage` so it survives the tab.
 */
export function usePlayerSettings() {
  const autoHideSeconds = useState('player-autohide-seconds', () => DEFAULT_SECONDS)
  const loaded = useState('player-autohide-loaded', () => false)

  onMounted(() => {
    if (loaded.value) return
    loaded.value = true
    // Read as a string first and reject the absent key explicitly. `Number(null)`
    // is 0, which is the sentinel for "never hide" — so a viewer who had never
    // touched the setting was handed the one value they could not have chosen.
    const raw = localStorage.getItem(HIDE_KEY)
    if (raw === null) return
    const stored = Number(raw)
    if (stored === OFF || AUTO_HIDE_STOPS.includes(stored)) autoHideSeconds.value = stored
  })

  function remember(value: number) {
    try {
      localStorage.setItem(HIDE_KEY, String(value))
    }
    catch {
      // Storage denied: the choice still holds for this page.
    }
  }

  /** Off keeps the chrome up for good, which is what `autoHide` false means. */
  const autoHide = computed(() => autoHideSeconds.value !== OFF)
  const autoHideMs = computed(() => autoHideSeconds.value * 1000)

  /**
   * Set while something on the chrome is open and being read rather than
   * pointed at — the settings menu above all.
   *
   * The idle timer measures pointer movement, and reading a list of thirty
   * shortcuts involves none of it. Without this the menu fades out from under
   * the eyes of the person using it, two seconds after they stopped moving the
   * mouse to look at it.
   */
  const chromeHeld = useState('player-chrome-held', () => false)

  function setAutoHideSeconds(value: number) {
    autoHideSeconds.value = value
    remember(value)
  }

  /**
   * Turning it back on returns to the default rather than to whatever was set
   * before: the previous value is not stored separately, and two seconds is a
   * better guess than the bottom of the scale.
   */
  function setAutoHide(on: boolean) {
    setAutoHideSeconds(on ? (autoHideSeconds.value || DEFAULT_SECONDS) : OFF)
  }

  return { autoHideSeconds, autoHide, autoHideMs, chromeHeld, setAutoHideSeconds, setAutoHide }
}
