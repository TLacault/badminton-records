import type { ReelJob, ReelProject, ReelTrack } from '~~/shared/reel'
import { fitMusicStart, parseVideoIdLoose } from '~~/shared/reel'

/**
 * The song: fetched, measured, and trimmed to the length of the reel.
 *
 * Measuring is what makes the trim automatic. A loudness envelope tells us
 * where the track is at its loudest for exactly as long as the reel runs,
 * which is the chorus in almost every song anyone cuts highlights to — so the
 * default window is the one a person would have hunted for with a scrub bar.
 *
 * A YouTube link needs a host with yt-dlp; a file dropped in is decoded and
 * measured in the browser instead, which is the same feature with no server.
 */
export function useReelMusic(
  project: Ref<ReelProject>,
  patch: (change: Partial<ReelProject>) => void,
) {
  const { canDownload } = useReelCapabilities()
  const importing = useReelJob()

  const track = useState<ReelTrack | null>('reel-track', () => null)
  const localUrl = ref<string | null>(null)
  const error = ref<string | null>(null)

  /** Where the preview reads the audio from, server copy or dropped file. */
  const audioUrl = computed(() => {
    if (project.value.music.kind === 'file') return localUrl.value
    const id = project.value.music.videoId
    return id && track.value?.videoId === id ? `/api/reel/media/music/${id}` : null
  })

  function applyTrack(next: ReelTrack, kind: 'youtube' | 'file', url: string) {
    track.value = next
    patch({
      music: {
        ...project.value.music,
        kind,
        url,
        videoId: kind === 'youtube' ? next.videoId : null,
        title: next.title,
        duration: next.duration,
      },
    })
  }

  async function importUrl(raw: string, need: number) {
    error.value = null
    const videoId = parseVideoIdLoose(raw)
    if (!videoId) {
      error.value = 'That does not look like a YouTube link'
      return
    }

    // Without a server that can fetch it, the link is still worth keeping: the
    // preview plays the song straight from YouTube, and the project carries
    // the link to a host that can render.
    if (!canDownload.value) {
      patch({
        music: { ...project.value.music, kind: 'youtube', url: raw, videoId, title: raw, duration: 0 },
      })
      return
    }

    try {
      const started = await $fetch<{ ready: boolean, job: ReelJob | null, track?: ReelTrack }>(
        '/api/reel/music',
        { method: 'POST', body: { url: raw } },
      )
      const result = started.ready
        ? { track: started.track }
        : await importing.watch(started.job!) as { track?: ReelTrack }
      if (!result.track) throw new Error('The track came back empty')
      applyTrack(result.track, 'youtube', raw)
      autoFit(need)
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  /**
   * A dropped file, measured the same way the server measures a download —
   * decoded once, then read as RMS over quarter-second buckets.
   */
  async function attachFile(file: File, need: number) {
    error.value = null
    try {
      if (localUrl.value) URL.revokeObjectURL(localUrl.value)
      localUrl.value = URL.createObjectURL(file)

      const context = new AudioContext()
      const buffer = await context.decodeAudioData(await file.arrayBuffer())
      const samples = buffer.getChannelData(0)
      const interval = 0.25
      const perBucket = Math.max(1, Math.round(buffer.sampleRate * interval))
      const peaks: number[] = []

      for (let start = 0; start < samples.length; start += perBucket) {
        let sum = 0
        const end = Math.min(samples.length, start + perBucket)
        for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!
        peaks.push(Math.sqrt(sum / Math.max(1, end - start)))
      }
      await context.close()

      applyTrack(
        { videoId: '', title: file.name.replace(/\.[^.]+$/, ''), duration: buffer.duration, interval, peaks },
        'file',
        file.name,
      )
      autoFit(need)
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'That file could not be decoded'
    }
  }

  /** Re-picks the window for a reel of `need` seconds. */
  function autoFit(need: number) {
    const music = project.value.music
    const duration = track.value?.duration ?? music.duration
    if (!duration) return
    const startAt = fitMusicStart(
      track.value?.peaks ?? [],
      track.value?.interval ?? 0.25,
      need,
      duration,
    )
    patch({ music: { ...music, startAt: Math.round(startAt * 100) / 100 } })
  }

  function clear() {
    if (localUrl.value) URL.revokeObjectURL(localUrl.value)
    localUrl.value = null
    track.value = null
    patch({ music: { ...project.value.music, kind: 'none', url: '', videoId: null, title: '', duration: 0, startAt: 0 } })
  }

  /**
   * Re-fetches the measurements for a track the project already names — a
   * saved reel opened tomorrow knows its song by id, and the waveform has to
   * come back from somewhere.
   */
  async function rehydrate() {
    const id = project.value.music.videoId
    if (!id || track.value?.videoId === id || !canDownload.value) return
    try {
      const started = await $fetch<{ ready: boolean, track?: ReelTrack, job: ReelJob | null }>(
        '/api/reel/music',
        { method: 'POST', body: { url: id } },
      )
      const result = started.ready ? { track: started.track } : await importing.watch(started.job!) as { track?: ReelTrack }
      if (result.track) track.value = result.track
    }
    catch {
      // The song is still named in the project and still plays from YouTube;
      // only the waveform is missing, which the panel already handles.
    }
  }

  onBeforeUnmount(() => {
    if (localUrl.value) URL.revokeObjectURL(localUrl.value)
  })

  return {
    track,
    audioUrl,
    error,
    importing: importing.running,
    progress: importing.progress,
    importUrl,
    attachFile,
    autoFit,
    clear,
    rehydrate,
  }
}
