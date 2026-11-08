import type { ReelJob } from '~~/shared/reel'

export type SourceMode = 'local' | 'cached' | 'youtube' | 'none'

/**
 * Where the pictures come from.
 *
 * Three answers, in order of how well they behave. A file the user attached
 * from their own disk is best — it scrubs instantly and costs nothing. A copy
 * this host has already pulled down is the same thing over HTTP with range
 * requests, which is what makes frame-accurate preview possible on a phone.
 * The YouTube embed is the fallback: it plays, it seeks approximately, and it
 * cannot be rendered from — which is exactly what the export panel says.
 */
export function useReelSource(videoId: Ref<string | null>) {
  const { caps, refresh, canDownload } = useReelCapabilities()
  const download = useReelJob()

  const file = useState<File | null>('reel-source-file', () => null)
  const objectUrl = ref<string | null>(null)
  /** Length of the attached or cached file, once the player has read it. */
  const duration = ref(0)

  const cached = computed(() =>
    Boolean(videoId.value && caps.value?.cachedSources.includes(videoId.value)),
  )

  const mode = computed<SourceMode>(() => {
    if (file.value) return 'local'
    if (cached.value) return 'cached'
    return videoId.value ? 'youtube' : 'none'
  })

  const url = computed(() => {
    if (mode.value === 'local') return objectUrl.value
    if (mode.value === 'cached') return `/api/reel/media/source/${videoId.value}`
    return null
  })

  /** True when the source can be cut frame by frame and handed to ffmpeg. */
  const precise = computed(() => mode.value === 'local' || mode.value === 'cached')

  function attach(next: File | null) {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = next ? URL.createObjectURL(next) : null
    file.value = next
  }

  onBeforeUnmount(() => {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  })

  async function fetchSource(height = 1080) {
    if (!videoId.value) return
    const started = await $fetch<{ ready: boolean, job: ReelJob | null, duration?: number }>(
      '/api/reel/source',
      { method: 'POST', body: { videoId: videoId.value, height } },
    )
    if (started.ready) {
      await refresh()
      if (started.duration) duration.value = started.duration
      return
    }
    if (started.job) {
      const result = await download.watch(started.job)
      if (typeof result.duration === 'number') duration.value = result.duration
      await refresh()
    }
  }

  const uploading = ref(false)

  /**
   * Hands an attached file to the server, which is where the render runs. The
   * object URL the preview plays is invisible to it. Once copied the source
   * counts as cached, so this happens once per match.
   */
  async function upload() {
    if (!file.value || !videoId.value || cached.value) return
    uploading.value = true
    try {
      await $fetch(`/api/reel/source/${videoId.value}`, { method: 'PUT', body: file.value })
      await refresh()
    }
    finally {
      uploading.value = false
    }
  }

  async function forget() {
    if (!videoId.value) return
    await $fetch(`/api/reel/source/${videoId.value}`, { method: 'DELETE' })
    await refresh()
  }

  return {
    caps,
    canDownload,
    file,
    mode,
    url,
    cached,
    precise,
    duration,
    attach,
    fetchSource,
    upload,
    uploading,
    forget,
    job: download.job,
    progress: download.progress,
    downloading: download.running,
    error: download.error,
  }
}
