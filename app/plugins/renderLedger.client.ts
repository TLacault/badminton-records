import type { ReelJob } from '~~/shared/reel'
import type { LiveRender, PendingRender } from '~/utils/renderLedger'
import { LEDGER_PREFIX } from '~/utils/renderLedger'

/**
 * Finishes renders started anywhere in this browser: polls each pending job
 * and, once it is done, saves the edit map on the raw and fills the upload
 * folder. Runs on every page, so leaving a tool mid-render loses nothing.
 * The entry is removed before the follow-up runs: a second tab polling the
 * same ledger skips it instead of doing it twice.
 */
export default defineNuxtPlugin(() => {
  const live = useState<Record<string, LiveRender>>('render-ledger', () => ({}))
  const client = useSupabaseClient()
  const busy = new Set<string>()

  async function settle(storageKey: string) {
    const key = storageKey.slice(LEDGER_PREFIX.length)
    let p: PendingRender
    try {
      p = JSON.parse(localStorage.getItem(storageKey) ?? '')
    }
    catch {
      localStorage.removeItem(storageKey)
      return
    }
    let job: ReelJob | null = null
    if (p.jobId) {
      try {
        job = await $fetch<ReelJob>(`/api/reel/job/${p.jobId}`)
      }
      catch (cause) {
        // 404: the server restarted and forgot the job; the render is lost.
        if ((cause as { statusCode?: number })?.statusCode !== 404) return
        localStorage.removeItem(storageKey)
        live.value[key] = { state: 'error', progress: null, message: 'The server restarted during the render' }
        return
      }
      if (job.state === 'running') {
        live.value[key] = { state: 'running', progress: job.progress, message: job.message }
        return
      }
    }
    if (localStorage.getItem(storageKey) === null) return // another tab took it
    localStorage.removeItem(storageKey)
    if (job?.state === 'error') {
      live.value[key] = { state: 'error', progress: null, message: job.error ?? 'The render failed' }
      return
    }
    live.value[key] = { state: 'finishing', progress: 1, message: 'Filling the upload folder' }
    try {
      await saveEditMap(client as never, p.matchId, p.kind, p.pieces)
      await saveKit(p.matchId, { kind: p.kind, ...p.kit })
      const { [key]: _, ...rest } = live.value
      live.value = rest
    }
    catch (cause) {
      live.value[key] = { state: 'error', progress: null, message: cause instanceof Error ? cause.message : String(cause) }
    }
  }

  async function tick() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LEDGER_PREFIX) && !busy.has(k))
    await Promise.all(keys.map(async (k) => {
      busy.add(k)
      try {
        await settle(k)
      }
      finally {
        busy.delete(k)
      }
    }))
    setTimeout(tick, 1500)
  }
  tick()
})
