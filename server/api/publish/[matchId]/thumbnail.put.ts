import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { requireAdmin } from '../../../utils/auth'
import { publishDir } from '../../../utils/publish'

/** Saves the thumbnail drawn in the editor into the match's upload kit. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const matchId = (getRouterParam(event, 'matchId') ?? '').replace(/[^\w-]/g, '')
  const size = getQuery(event).size === '2560' ? '2560' : '1280'
  const body = await readRawBody(event, false)
  if (!matchId || !body?.length) throw createError({ statusCode: 400, statusMessage: 'Empty thumbnail' })
  // PNG signature: anything else is not a thumbnail.
  if (body.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw createError({ statusCode: 422, statusMessage: 'Not a PNG' })
  if (body.length > 12 << 20) throw createError({ statusCode: 413, statusMessage: 'Thumbnail too large' })
  const dir = publishDir(matchId)
  await mkdir(dir, { recursive: true })
  const path = join(dir, size === '2560' ? 'thumbnail@2x.png' : 'thumbnail.png')
  await writeFile(path, body)
  return { path, bytes: body.length }
})
