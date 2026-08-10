let apiPromise: Promise<void> | null = null

function loadIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      resolve()
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiPromise
}

export function useYouTubePlayer(
  host: Ref<HTMLElement | null>,
  videoId: Ref<string | null>,
  options: {
    /**
     * Pull keyboard focus back out of the iframe after any click on it.
     * The tagging tool needs this: its A/Z/R/P bindings live on `window`, and
     * a focused iframe would swallow every keystroke until you clicked away.
     */
    restoreFocus?: boolean
  } = {},
) {
  const player = shallowRef<YT.Player | null>(null)
  const ready = ref(false)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  /** 0–100, YouTube's own scale. Mirrors the player so the OSD can show it. */
  const volume = ref(100)
  const muted = ref(false)
  let frame = 0

  function tick() {
    const p = player.value
    if (p?.getCurrentTime) currentTime.value = p.getCurrentTime()
    frame = requestAnimationFrame(tick)
  }

  async function mount() {
    if (!import.meta.client || !host.value || !videoId.value) return
    await loadIframeApi()
    if (!window.YT || !host.value) return

    player.value = new window.YT.Player(host.value, {
      videoId: videoId.value,
      playerVars: {
        // Native controls, for the settings menu (quality / playback speed).
        // disablekb:1 still applies: YouTube must not act on keystrokes, since
        // the same keys drive tagging.
        //
        // The branding cannot be turned off from here. modestbranding was
        // deprecated in 2023 and is ignored; the title bar, share/watch-later,
        // "Plus de vidéos" and the logo are part of the embed and unreachable
        // from this origin. rel:0 at least keeps end-cards to this channel.
        controls: 1,
        disablekb: 1,
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1,
      },
      events: {
        onReady: (e) => {
          ready.value = true
          duration.value = e.target.getDuration()
          // Read rather than assume: YouTube restores the viewer's own volume,
          // and starting our indicator at 100 would lie about it.
          volume.value = Math.round(e.target.getVolume?.() ?? 100)
          muted.value = e.target.isMuted?.() ?? false
          frame = requestAnimationFrame(tick)
        },
        onStateChange: (e) => {
          isPlaying.value = e.data === window.YT?.PlayerState.PLAYING
        },
      },
    })
  }

  /**
   * Clicking anywhere in the iframe — including a native control — moves focus
   * into it, and the page stops receiving keydown. There is no click event to
   * listen for across origins, but the window blurring while the iframe becomes
   * activeElement is a reliable proxy. The blur runs on a macrotask so the
   * click it followed has already been handled inside the player.
   */
  function onWindowBlur() {
    setTimeout(() => {
      const active = document.activeElement
      if (active instanceof HTMLIFrameElement) {
        active.blur()
        window.focus()
      }
    }, 0)
  }

  onMounted(() => {
    mount()
    if (options.restoreFocus) window.addEventListener('blur', onWindowBlur)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    if (options.restoreFocus) window.removeEventListener('blur', onWindowBlur)
    player.value?.destroy()
    player.value = null
  })

  /** Synchronous read — use this for rally timestamps, not `currentTime`. */
  function getTime(): number {
    return player.value?.getCurrentTime?.() ?? 0
  }

  function play() {
    player.value?.playVideo()
  }
  function pause() {
    player.value?.pauseVideo()
  }
  function toggle() {
    if (isPlaying.value) pause()
    else play()
  }
  function seekTo(seconds: number) {
    player.value?.seekTo(Math.max(0, seconds), true)
  }
  function seekBy(delta: number) {
    seekTo(getTime() + delta)
  }

  /**
   * Nudges the volume and reports where it landed.
   *
   * Raising the volume unmutes: a viewer pressing "louder" on a muted video
   * means "let me hear it", and leaving it silent while the number climbs is
   * the kind of thing that gets blamed on the site.
   */
  function changeVolume(delta: number): number {
    const p = player.value
    if (!p?.setVolume) return volume.value
    // Stepped from our own value, not from getVolume(): the player does not
    // apply setVolume synchronously, so holding the key re-read a stale level
    // and three presses out of eight vanished.
    const next = Math.min(100, Math.max(0, Math.round(volume.value + delta)))
    p.setVolume(next)
    if (next > 0 && p.isMuted?.()) p.unMute?.()
    volume.value = next
    muted.value = next === 0 ? true : (p.isMuted?.() ?? false)
    return next
  }

  return {
    ready,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    getTime,
    play,
    pause,
    toggle,
    seekTo,
    seekBy,
    changeVolume,
  }
}
