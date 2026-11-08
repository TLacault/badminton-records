import { createWriteStream } from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { capabilities, parseVideoId, probe, sourcePath } from '../../../utils/reel'

/**
 * Takes a match video from the user's own disk and files it where a download
 * would have landed, so the render finds it.
 *
 * Attaching a file in the editor only gives the browser an object URL; the
 * render runs here and reads `.reel-cache/source/<id>.mp4`. Streamed to a
 * `.part` file and renamed once ffprobe can read it, so a cancelled upload or
 * a file that is not a video never poses as a finished source.
 */
export default defineEventHandler(async (event) => {
  const videoId = parseVideoId(getRouterParam(event, 'id') ?? '')
  if (!videoId) throw createError({ statusCode: 400, statusMessage: 'Bad video id' })

  // Also creates the cache directories.
  if (!(await capabilities()).render) {
    throw createError({ statusCode: 501, statusMessage: 'This host has no ffmpeg, so it cannot render' })
  }

  const target = sourcePath(videoId)
  const partial = `${target}.part`
  try {
    await pipeline(event.node.req, createWriteStream(partial))
    if (!(await probe(partial)).duration) throw new Error('no duration')
    await rename(partial, target)
  }
  catch {
    await unlink(partial).catch(() => {})
    throw createError({ statusCode: 422, statusMessage: 'That file is not a video ffmpeg can read' })
  }
  return { ok: true }
})
