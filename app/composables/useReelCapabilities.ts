import type { ReelCapabilities } from '~~/shared/reel'

/**
 * What this host can do, asked once and shared by every panel.
 *
 * The reel maker is deliberately not all-or-nothing. A deployment with no
 * binaries still cuts a reel against the YouTube embed and saves the project;
 * a laptop with yt-dlp and ffmpeg also scrubs a real file and exports an mp4.
 * Every control that needs more than the host has says so on its own face
 * rather than failing when pressed.
 */
export function useReelCapabilities() {
  const caps = useState<ReelCapabilities | null>('reel-caps', () => null)
  const pending = useState('reel-caps-pending', () => false)

  async function refresh() {
    pending.value = true
    try {
      caps.value = await $fetch<ReelCapabilities>('/api/reel/capabilities')
    }
    catch {
      // A host that cannot answer is a host that can do nothing for us, which
      // is exactly what the null case already renders.
      caps.value = null
    }
    finally {
      pending.value = false
    }
  }

  onMounted(() => {
    if (!caps.value) refresh()
  })

  return {
    caps,
    pending,
    refresh,
    canDownload: computed(() => caps.value?.download ?? false),
    canRender: computed(() => caps.value?.render ?? false),
  }
}
