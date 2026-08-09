/**
 * Fullscreen for a wrapper element rather than the video inside it.
 *
 * The score overlay is our DOM sitting beside YouTube's iframe. When the
 * iframe alone goes fullscreen — which is what YouTube's own button does —
 * the overlay stays behind on the page and vanishes from view. So when we
 * catch the iframe entering fullscreen, we hand fullscreen to the wrapper
 * instead; the player is a child of it, so it comes along, and the overlay
 * comes with it.
 *
 * The swap costs one frame of flicker on YouTube's button. Ours goes straight
 * to the wrapper and shows none.
 */
export function useFullscreen(target: Ref<HTMLElement | null>) {
  const isFullscreen = ref(false)

  /** Guards the exit→re-request handoff against re-entering itself. */
  let swapping = false

  function request() {
    target.value?.requestFullscreen?.().catch(() => {
      // Denied (no user gesture, or the browser said no). Nothing to undo.
    })
  }

  async function onChange() {
    const active = document.fullscreenElement
    const wrapper = target.value

    if (active && wrapper && active !== wrapper && wrapper.contains(active)) {
      // YouTube fullscreened its own iframe. Take it back to the wrapper.
      if (swapping) return
      swapping = true
      try {
        await document.exitFullscreen()
        await wrapper.requestFullscreen?.()
      }
      catch {
        // If the handoff fails we simply stay as YouTube left us: the video
        // is fullscreen, only the overlay is missing.
      }
      finally {
        swapping = false
      }
      return
    }

    isFullscreen.value = active === wrapper
  }

  function toggle() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else request()
  }

  onMounted(() => document.addEventListener('fullscreenchange', onChange))
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onChange))

  return { isFullscreen, toggle }
}
