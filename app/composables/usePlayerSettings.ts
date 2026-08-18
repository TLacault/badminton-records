const HIDE_KEY = 'ust-player-autohide-seconds'
const SKIP_KEY = 'ust-player-skip-seconds'

/** Off is stored as 0 — one key, and "never" is just past the end of the scale. */
const OFF = 0

const RANGE_MIN = 0.5
const RANGE_MAX = 5
const RANGE_STEP = 0.5

/** Every stop the segmented ranges offer. Shared: both choose a duration. */
export const RANGE_STOPS = Array.from(
  { length: Math.round((RANGE_MAX - RANGE_MIN) / RANGE_STEP) + 1 },
  (_, i) => Number((RANGE_MIN + i * RANGE_STEP).toFixed(1)),
)

/**
 * One stop past the top of the scale, where auto-hide turns off.
 *
 * "Never" used to be a button beside the slider. It is a stop on the slider
 * now: it is the same question — how long do I want the chrome to stay? — and
 * the longest possible answer belongs at the long end of the scale rather than
 * in a control of its own.
 */
export const NEVER_STOP = Number((RANGE_MAX + RANGE_STEP).toFixed(1))

const DEFAULT_HIDE_SECONDS = 2
const DEFAULT_SKIP_SECONDS = 5

function readStored(key: string, fallback: number, allowOff: boolean) {
  // Read as a string first and reject the absent key explicitly. `Number(null)`
  // is 0, which is the sentinel for "never hide" — so a viewer who had never
  // touched the setting was handed the one value they could not have chosen.
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  const stored = Number(raw)
  if (allowOff && stored === OFF) return stored
  return RANGE_STOPS.includes(stored) ? stored : fallback
}

function remember(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  }
  catch {
    // Storage denied: the choice still holds for this page.
  }
}

/**
 * How the player behaves rather than what it is playing: how long the chrome
 * waits before it goes, and how far a seek key jumps.
 *
 * Both were constants — two seconds and five — which are the right defaults and
 * the wrong law. Scrubbing a rally frame by frame wants the bar to stay and a
 * shorter jump; watching a match through wants the opposite. Held globally so
 * the choice survives moving between a match and the tagger, and in
 * `localStorage` so it survives the tab.
 */
export function usePlayerSettings() {
  const autoHideSeconds = useState('player-autohide-seconds', () => DEFAULT_HIDE_SECONDS)
  const skipSeconds = useState('player-skip-seconds', () => DEFAULT_SKIP_SECONDS)
  const loaded = useState('player-settings-loaded', () => false)

  onMounted(() => {
    if (loaded.value) return
    loaded.value = true
    autoHideSeconds.value = readStored(HIDE_KEY, DEFAULT_HIDE_SECONDS, true)
    skipSeconds.value = readStored(SKIP_KEY, DEFAULT_SKIP_SECONDS, false)
  })

  /** Off keeps the chrome up for good, which is what `autoHide` false means. */
  const autoHide = computed(() => autoHideSeconds.value !== OFF)
  const autoHideMs = computed(() => autoHideSeconds.value * 1000)

  /**
   * Where the auto-hide slider sits. Off lives at `NEVER_STOP`, one step past
   * the top, so the thumb has somewhere to be when the chrome never hides.
   */
  const autoHideStop = computed(() => autoHide.value ? autoHideSeconds.value : NEVER_STOP)

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

  /**
   * Whether the settings menu is up.
   *
   * Global because the gesture layer has to know: a press on the video with the
   * menu open is a press that closes the menu and nothing else. Kept here
   * rather than in the bar that owns the gear, because the stage cannot reach
   * into the overlay it was handed.
   */
  const menuOpen = useState('player-settings-open', () => false)

  function setAutoHideStop(value: number) {
    const next = value >= NEVER_STOP ? OFF : value
    autoHideSeconds.value = next
    remember(HIDE_KEY, next)
  }

  function setSkipSeconds(value: number) {
    skipSeconds.value = value
    remember(SKIP_KEY, value)
  }

  return {
    autoHideSeconds,
    autoHideStop,
    autoHide,
    autoHideMs,
    skipSeconds,
    chromeHeld,
    menuOpen,
    setAutoHideStop,
    setSkipSeconds,
  }
}
