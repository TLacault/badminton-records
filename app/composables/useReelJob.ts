import type { ReelJob } from '~~/shared/reel'

/**
 * Watches a background job — a download, a render — by polling its ticket.
 *
 * Polling rather than a socket or an SSE stream, because the thing being
 * watched takes minutes and the answer is three numbers: a mobile that sleeps
 * mid-render picks the job back up on the next tick instead of reconnecting to
 * a stream that ended while the screen was off.
 */
export function useReelJob() {
  const job = ref<ReelJob | null>(null)
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  const running = computed(() => job.value?.state === 'running')
  const progress = computed(() => job.value?.progress ?? null)

  function stop() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  /** Resolves when the job finishes, or rejects with what went wrong. */
  function watch(started: ReelJob): Promise<Record<string, unknown>> {
    stop()
    job.value = started
    error.value = null

    return new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const next = await $fetch<ReelJob>(`/api/reel/job/${started.id}`)
          job.value = next
          if (next.state === 'running') {
            timer = setTimeout(tick, 700)
            return
          }
          stop()
          if (next.state === 'done') resolve(next.result ?? {})
          else {
            error.value = next.error ?? 'The job failed'
            reject(new Error(error.value))
          }
        }
        catch (cause) {
          stop()
          error.value = cause instanceof Error ? cause.message : String(cause)
          reject(cause)
        }
      }
      timer = setTimeout(tick, 400)
    })
  }

  onBeforeUnmount(stop)

  return { job, running, progress, error, watch, stop }
}
