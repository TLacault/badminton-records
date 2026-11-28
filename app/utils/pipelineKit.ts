import type { ThumbnailSpec } from '~/utils/thumbnail'
import { thumbnailFiles } from '~/utils/thumbnail'

/**
 * After every render, the YouTube and clip tools fill the video's upload
 * folder (video named after the title, thumbnail.jpg, title.txt,
 * description.txt) and note the render here, so the pipeline also picks up a
 * render made by hand in a tool (the Shorts). localStorage, keyed by the raw
 * match: the pipeline runs in this browser.
 */
export type KitKind = 'match' | 'highlights' | 'shorts'

export interface RenderNote {
  kind: KitKind
  title: string
  description: string
  /** Small thumbnail for the pipeline's dock. */
  preview: string | null
  /** Set when the upload folder could not be written. */
  folderError?: string
  at: number
}

const key = (matchId: string, kind: KitKind) => `ust-pipeline-kit-v1:${matchId}:${kind}`

export async function saveKit(matchId: string, kit: { kind: KitKind, title: string, description: string, thumb: ThumbnailSpec, out?: string }) {
  let preview: string | null = null
  let folderError: string | undefined
  try {
    const files = await thumbnailFiles(kit.thumb)
    preview = files.preview
    const form = new FormData()
    form.set('title', kit.title)
    form.set('description', kit.description)
    if (kit.out) form.set('out', kit.out)
    form.set('thumbnail', files.jpeg, 'thumbnail.jpg')
    await $fetch(`/api/pipeline/${matchId}/${kit.kind}`, { method: 'PUT', body: form })
  }
  catch (cause) {
    folderError = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage ?? (cause instanceof Error ? cause.message : String(cause))
  }
  const note: RenderNote = { kind: kit.kind, title: kit.title, description: kit.description, preview, folderError, at: Date.now() }
  try {
    localStorage.setItem(key(matchId, kit.kind), JSON.stringify(note))
  }
  catch {
    // Quota or private mode: the pipeline then waits for a render it cannot see.
  }
}

export function readKit(matchId: string, kind: KitKind): RenderNote | null {
  try {
    return JSON.parse(localStorage.getItem(key(matchId, kind)) ?? 'null')
  }
  catch {
    return null
  }
}
