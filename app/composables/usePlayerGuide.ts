const SEEN_KEY = 'ust-player-guide-seen'

/**
 * The player tour: opens by itself on a first visit, and from the guide button
 * in the control bar whenever asked. Closing it, finished or hidden, counts as
 * seen, so it never comes back on its own.
 */
export function usePlayerGuide() {
  const open = useState('player-guide-open', () => false)

  function start() {
    open.value = true
  }

  function close() {
    open.value = false
    try {
      localStorage.setItem(SEEN_KEY, '1')
    }
    catch {
      // Storage denied: it will offer itself again next visit, which is fine.
    }
  }

  function startIfNew() {
    try {
      if (!localStorage.getItem(SEEN_KEY)) open.value = true
    }
    catch {
      // Storage denied: no way to remember a dismissal, so do not nag.
    }
  }

  return { open, start, close, startIfNew }
}
