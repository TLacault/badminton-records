import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MUSIC_DIR, OUT_DIR, SOURCE_DIR } from '../../../../utils/reel'

/**
 * Serves a cached file back to the editor.
 *
 * Range requests are the whole reason this exists rather than a static mount:
 * the preview seeks constantly — every clip boundary is a seek — and a video
 * element that cannot ask for byte 400,000,000 has to download a gigabyte
 * before it can show you the last rally.
 */

const DIRS: Record<string, { dir: string, ext: string, type: string }> = {
  source: { dir: SOURCE_DIR, ext: '.mp4', type: 'video/mp4' },
  music: { dir: MUSIC_DIR, ext: '.m4a', type: 'audio/mp4' },
  out: { dir: OUT_DIR, ext: '.mp4', type: 'video/mp4' },
}

/** Ids are ours: a YouTube id or a render hash. Nothing else opens a file. */
const SAFE = /^[\w-]{6,64}$/

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind') ?? ''
  const id = (getRouterParam(event, 'id') ?? '').replace(/\.(mp4|m4a)$/, '')
  const spec = DIRS[kind]
  if (!spec || !SAFE.test(id)) throw createError({ statusCode: 400, statusMessage: 'Bad media request' })

  const path = join(spec.dir, `${id}${spec.ext}`)
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw createError({ statusCode: 404, statusMessage: 'Not cached' })

  const query = getQuery(event)
  if (query.download) {
    const name = typeof query.name === 'string' && /^[\w .-]{1,80}$/.test(query.name)
      ? query.name
      : `${id}${spec.ext}`
    setResponseHeader(event, 'content-disposition', `attachment; filename="${name}"`)
  }

  setResponseHeaders(event, {
    'content-type': spec.type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  })

  const range = getRequestHeader(event, 'range')
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null

  if (match) {
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1
    if (Number.isNaN(start) || start >= info.size || end < start) {
      setResponseHeader(event, 'content-range', `bytes */${info.size}`)
      throw createError({ statusCode: 416, statusMessage: 'Range not satisfiable' })
    }
    setResponseStatus(event, 206)
    setResponseHeader(event, 'content-range', `bytes ${start}-${end}/${info.size}`)
    setResponseHeader(event, 'content-length', end - start + 1)
    return sendStream(event, createReadStream(path, { start, end }))
  }

  setResponseHeader(event, 'content-length', info.size)
  return sendStream(event, createReadStream(path))
})
