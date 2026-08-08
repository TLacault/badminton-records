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
) {
  const player = shallowRef<YT.Player | null>(null)
  const ready = ref(false)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
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
        // controls:0 + disablekb:1 because all playback is driven from our own
        // UI; the overlay stops the iframe from ever taking keyboard focus.
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: (e) => {
          ready.value = true
          duration.value = e.target.getDuration()
          frame = requestAnimationFrame(tick)
        },
        onStateChange: (e) => {
          isPlaying.value = e.data === window.YT?.PlayerState.PLAYING
        },
      },
    })
  }

  onMounted(mount)
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
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

  return {
    ready,
    isPlaying,
    currentTime,
    duration,
    getTime,
    play,
    pause,
    toggle,
    seekTo,
    seekBy,
  }
}
