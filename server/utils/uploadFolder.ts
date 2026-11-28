import { join } from 'node:path'
import { CACHE_DIR } from './reel'

/**
 * One folder per video to upload: the video named after its title (YouTube
 * prefills the title from the file name) and thumbnail.jpg, opened in the file
 * manager from the pipeline. The render it came from is noted next to the
 * folder (`<kind>.json`), so that once the video is on YouTube the folder and
 * the render are both deleted.
 */
export const UPLOAD_DIR = join(CACHE_DIR, 'upload')
export const UPLOAD_KINDS = ['match', 'highlights', 'shorts'] as const
export type UploadKind = typeof UPLOAD_KINDS[number]

export function uploadFolder(matchIdRaw: string | undefined, kindRaw: string | undefined) {
  const matchId = (matchIdRaw ?? '').replace(/[^\w-]/g, '')
  const kind = UPLOAD_KINDS.find(k => k === kindRaw)
  if (!matchId || !kind) throw createError({ statusCode: 400, statusMessage: 'Bad match or kind' })
  return { matchId, kind, dir: join(UPLOAD_DIR, matchId, kind), note: join(UPLOAD_DIR, matchId, `${kind}.json`) }
}

/** A file name from a title: no slashes or control characters, short enough for any filesystem. */
export const fileStem = (title: string) => title.replace(/[/\\\0-\x1F]/g, '-').trim().slice(0, 150) || 'video'
