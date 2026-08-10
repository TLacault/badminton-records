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
  const rate = ref(1)
  const rates = ref<number[]>([1])
  /**
   * Read-only, and not for lack of trying: `setPlaybackQuality` is ignored by
   * YouTube now — asking for tiny, small, medium or hd720, or reloading with
   * `suggestedQuality`, all left a 1440p stream on 1440p. The level can be
   * reported, never chosen, so the UI offers speed instead.
   */
  const quality = ref<string | null>(null)
  let frame = 0

  function tick() {
    const p = player.value
    if (p?.getCurrentTime) currentTime.value = p.getCurrentTime()
    // Quality only settles once a stream is actually flowing, and it changes
    // under us as the network does, so it is polled rather than read once.
    const level = p?.getPlaybackQuality?.()
    if (level && level !== 'unknown') quality.value = level
    frame = requestAnimationFrame(tick)
  }

  async function mount() {
    if (!import.meta.client || !host.value || !videoId.value) return
    await loadIframeApi()
    if (!window.YT || !host.value) return

    player.value = new window.YT.Player(host.value, {
      videoId: videoId.value,
      playerVars: {
        // YouTube's own chrome is left on and covered rather than switched
        // off. The bar, the progress line and the buttons are all ours — drawn
        // over the video by StageChrome, whose scrim and scrub bar sit in the
        // band YouTube draws its own in — and the click shield in YouTubeStage
        // means none of what shows through can be reached anyway.
        //
        // That shield is there for the title and "Watch on YouTube" overlay,
        // which no parameter removes: modestbranding was deprecated in 2023
        // and is ignored. It is also what stops a click on our scoreboard
        // opening a YouTube tab.
        //
        // disablekb:1 remains: YouTube must not act on keystrokes, since the
        // same keys drive tagging and our own shortcuts.
        controls: 1,
        disablekb: 1,
        fs: 0,
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
          rates.value = e.target.getAvailablePlaybackRates?.() ?? [1]
          rate.value = e.target.getPlaybackRate?.() ?? 1
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

  /** Sets the speed to an offered rate, and reports what it became. */
  function setRate(next: number): number {
    const p = player.value
    if (!p?.setPlaybackRate) return rate.value
    p.setPlaybackRate(next)
    rate.value = next
    return next
  }

  /** Steps to the neighbouring offered rate — the list is not evenly spaced. */
  function stepRate(direction: 1 | -1): number {
    const list = rates.value.length ? rates.value : [1]
    const at = list.indexOf(rate.value)
    const from = at === -1 ? list.indexOf(1) : at
    const next = list[Math.min(list.length - 1, Math.max(0, from + direction))]
    return next === undefined ? rate.value : setRate(next)
  }

  return {
    ready,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    rate,
    rates,
    quality,
    getTime,
    play,
    pause,
    toggle,
    seekTo,
    seekBy,
    changeVolume,
    setRate,
    stepRate,
  }
}
