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
 *
 * Where the Fullscreen API cannot take an element — Safari on an iPhone only
 * fullscreens a bare <video> — `pseudo` stands in: the wrapper is pinned over
 * the viewport with CSS, which is as full as a page can get there.
 *
 * On a touch screen, turning the phone sideways enters fullscreen and turning
 * it back leaves it. Chrome allows a fullscreen request from an orientation
 * change with no tap, which is what makes this possible at all.
 */
export function useFullscreen(target: Ref<HTMLElement | null>) {
  const native = ref(false)
  const pseudo = ref(false)
  const isFullscreen = computed(() => native.value || pseudo.value)

  /** Guards the exit→re-request handoff against re-entering itself. */
  let swapping = false

  function canNative() {
    return Boolean(document.fullscreenEnabled && target.value?.requestFullscreen)
  }

  function enter() {
    if (!canNative()) {
      pseudo.value = true
      return
    }
    target.value!.requestFullscreen().catch(() => {
      // Denied (no user gesture, or the browser said no): pin it instead.
      pseudo.value = true
    })
  }

  function exit() {
    pseudo.value = false
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
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

    native.value = active === wrapper
    if (native.value) pseudo.value = false
  }

  function toggle() {
    if (isFullscreen.value) exit()
    else enter()
  }

  function onOrientation() {
    if (!matchMedia('(pointer: coarse)').matches) return
    const landscape = screen.orientation
      ? screen.orientation.type.startsWith('landscape')
      : matchMedia('(orientation: landscape)').matches
    if (landscape && !isFullscreen.value) enter()
    else if (!landscape && isFullscreen.value) exit()
  }

  // `screen.orientation` where it exists; `orientationchange` for older iOS.
  const orientationTarget = () => (typeof screen !== 'undefined' && screen.orientation) || window

  onMounted(() => {
    document.addEventListener('fullscreenchange', onChange)
    orientationTarget().addEventListener(screen.orientation ? 'change' : 'orientationchange', onOrientation)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onChange)
    orientationTarget().removeEventListener(screen.orientation ? 'change' : 'orientationchange', onOrientation)
    pseudo.value = false
  })

  return { isFullscreen, pseudo, toggle }
}
