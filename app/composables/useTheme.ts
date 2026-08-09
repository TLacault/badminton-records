export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'ust-theme'

/**
 * Dark/light switch.
 *
 * The class on <html> is set by the inline script in nuxt.config before first
 * paint, so *that* is the source of truth on the client and this state syncs
 * from it on mount. Seeding the ref from the DOM during setup instead would
 * mismatch hydration, because the server has no idea what the visitor stored.
 */
export function useTheme() {
  const theme = useState<Theme>('ust-theme', () => 'dark')

  onMounted(() => {
    theme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })

  function set(next: Theme) {
    theme.value = next
    if (!import.meta.client) return
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.style.colorScheme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    }
    catch {
      // Private-browsing quota errors must not take the toggle down with them.
    }
  }

  function toggle() {
    set(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, set, toggle }
}
