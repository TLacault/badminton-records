export type ScoreboardMode = 'compact' | 'expanded'

const STORAGE_KEY = 'ust-scoreboard-mode'

/**
 * Compact (Us / Opponents) or expanded (all four names), remembered across
 * matches. Compact is the default: on a phone-sized overlay four names cost
 * more room than they explain, and the names are printed under the video
 * anyway.
 */
export function useScoreboardMode() {
  const mode = useState<ScoreboardMode>('scoreboard-mode', () => 'compact')
  const loaded = useState('scoreboard-mode-loaded', () => false)

  onMounted(() => {
    if (loaded.value) return
    loaded.value = true
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'compact' || stored === 'expanded') mode.value = stored
  })

  function toggle() {
    mode.value = mode.value === 'compact' ? 'expanded' : 'compact'
    try {
      localStorage.setItem(STORAGE_KEY, mode.value)
    }
    catch {
      // Storage denied: the choice still holds for this page.
    }
  }

  return { mode, toggle }
}
