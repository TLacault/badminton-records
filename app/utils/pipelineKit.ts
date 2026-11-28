/**
 * What a render leaves for the upload: the file, the text and the thumbnail it
 * goes up with. Written by the YouTube and clip tools after every render, so
 * the pipeline also picks up a render made by hand in the tool (the Shorts).
 * localStorage, keyed by the raw match: the pipeline runs in this browser.
 */
export type KitKind = 'match' | 'highlights' | 'shorts'

export interface UploadKit {
  kind: KitKind
  title: string
  description: string
  /** Where the file is: a path on this machine (YouTube) or a download URL (clips). */
  path?: string
  url?: string
  /** Props for <PublishThumbnailCanvas>. */
  thumb: Record<string, unknown>
  at: number
}

const key = (matchId: string, kind: KitKind) => `ust-pipeline-kit-v1:${matchId}:${kind}`

export function saveKit(matchId: string, kit: Omit<UploadKit, 'at'>) {
  try {
    localStorage.setItem(key(matchId, kit.kind), JSON.stringify({ ...kit, at: Date.now() }))
  }
  catch {
    // Quota or private mode: the pipeline then waits for a render it cannot see.
  }
}

export function readKit(matchId: string, kind: KitKind): UploadKit | null {
  try {
    return JSON.parse(localStorage.getItem(key(matchId, kind)) ?? 'null')
  }
  catch {
    return null
  }
}
