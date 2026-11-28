import { copyFile, link, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { requireAdmin } from '../../../../utils/auth'
import { publishDir } from '../../../../utils/publish'
import { OUT_DIR } from '../../../../utils/reel'
import { fileStem, uploadFolder } from '../../../../utils/uploadFolder'

/**
 * Fills the upload folder after a render: the rendered video (hard-linked, so a
 * 4K file is not copied) and the thumbnail.
 * The video only ever comes from our own render dirs: the YouTube kit of this
 * match, or a clip render named by its hash.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { matchId, kind, dir, note } = uploadFolder(getRouterParam(event, 'matchId'), getRouterParam(event, 'kind'))
  const form = await readMultipartFormData(event)
  const field = (name: string) => form?.find(f => f.name === name)
  const text = (name: string) => field(name)?.data.toString('utf8') ?? ''

  const title = text('title').replace(/[\r\n]/g, ' ').slice(0, 200)
  const out = text('out')
  const source = kind === 'match'
    ? join(publishDir(matchId), 'video.mp4')
    : /^[\w-]{6,64}$/.test(out) ? join(OUT_DIR, `${out}.mp4`) : null
  if (!title || !source) throw createError({ statusCode: 400, statusMessage: 'Missing title or render' })
  await stat(source).catch(() => {
    throw createError({ statusCode: 404, statusMessage: 'The render is not on this machine' })
  })

  // A new render replaces the folder's content (an older video under an older title).
  await mkdir(dir, { recursive: true })
  for (const f of await readdir(dir)) await rm(join(dir, f), { force: true })
  const video = join(dir, `${fileStem(title)}.mp4`)
  await link(source, video).catch(() => copyFile(source, video))
  await writeFile(note, JSON.stringify({ source }))
  const thumb = field('thumbnail')
  if (thumb?.data.length && thumb.data.subarray(0, 3).toString('hex') === 'ffd8ff') await writeFile(join(dir, 'thumbnail.jpg'), thumb.data)
  return { dir, video }
})
