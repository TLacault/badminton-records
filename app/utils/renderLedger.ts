import type { KitKind } from '~/utils/pipelineKit'
import type { ThumbnailSpec } from '~/utils/thumbnail'
import type { EditPiece } from '~~/shared/publish'

/**
 * A render outlives the page that started it: ffmpeg runs on the server, and
 * what has to happen after it (the edit map on the raw, the upload folder)
 * is written down here when it starts. The renderLedger plugin, live on every
 * page, finishes it, so leaving the tool mid-render loses nothing and the
 * pipeline shows the bar of a render started in a tool.
 */
export interface PendingRender {
  matchId: string
  kind: KitKind
  /** null: the render was already on disk, only the follow-up is left. */
  jobId: string | null
  pieces: EditPiece[]
  kit: { title: string, description: string, thumb: ThumbnailSpec, out?: string }
}

export interface LiveRender { state: 'running' | 'finishing' | 'error', progress: number | null, message: string }

export const LEDGER_PREFIX = 'ust-render-pending-v1:'
export const ledgerKey = (matchId: string, kind: KitKind) => `${matchId}:${kind}`

export function trackRender(p: PendingRender) {
  try {
    localStorage.setItem(LEDGER_PREFIX + ledgerKey(p.matchId, p.kind), JSON.stringify(p))
  }
  catch {}
  useState<Record<string, LiveRender>>('render-ledger').value[ledgerKey(p.matchId, p.kind)] = { state: 'running', progress: 0, message: 'Starting' }
}

export function pendingRender(matchId: string, kind: KitKind): PendingRender | null {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_PREFIX + ledgerKey(matchId, kind)) ?? 'null')
  }
  catch {
    return null
  }
}

/** The render of this video in flight (or just failed), reactive. */
export function useLiveRender(matchId: string, kind: KitKind) {
  const live = useState<Record<string, LiveRender>>('render-ledger', () => ({}))
  return computed(() => live.value[ledgerKey(matchId, kind)] ?? null)
}
