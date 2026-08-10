export type ScoreboardMode = 'compact' | 'expanded'

const MODE_KEY = 'ust-scoreboard-mode'
const VISIBLE_KEY = 'ust-scoreboard-visible'

/**
 * Compact (Us / Opponents) or expanded (all four names), plus whether the
 * overlay is shown at all — both remembered across matches.
 *
 * Compact is the default: on a phone-sized overlay four names cost more room
 * than they explain, and the names are printed under the video anyway. Shown
 * is the default because the scoreboard is the reason this player exists;
 * hiding it is for the one clip where it covers the shuttle.
 */
export function useScoreboardMode() {
  const mode = useState<ScoreboardMode>('scoreboard-mode', () => 'compact')
  const visible = useState('scoreboard-visible', () => true)
  const loaded = useState('scoreboard-mode-loaded', () => false)

  onMounted(() => {
    if (loaded.value) return
    loaded.value = true
    const stored = localStorage.getItem(MODE_KEY)
    if (stored === 'compact' || stored === 'expanded') mode.value = stored
    // Only an explicit 'false' hides it: an unset key means "never chosen",
    // which is not the same as "chosen to hide".
    visible.value = localStorage.getItem(VISIBLE_KEY) !== 'false'
  })

  function remember(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    }
    catch {
      // Storage denied: the choice still holds for this page.
    }
  }

  function toggle() {
    mode.value = mode.value === 'compact' ? 'expanded' : 'compact'
    remember(MODE_KEY, mode.value)
  }

  function toggleVisible() {
    visible.value = !visible.value
    remember(VISIBLE_KEY, String(visible.value))
  }

  return { mode, visible, toggle, toggleVisible }
}
