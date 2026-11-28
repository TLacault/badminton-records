import { readFile, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { requireAdmin } from '../../../../utils/auth'
import { PUBLISH_DIR } from '../../../../utils/publish'
import { OUT_DIR } from '../../../../utils/reel'
import { uploadFolder } from '../../../../utils/uploadFolder'

/**
 * The video is on YouTube: delete its upload folder and the render it was
 * linked from (the hard link alone frees nothing). Only a render inside our
 * own render dirs is ever removed.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { dir, note } = uploadFolder(getRouterParam(event, 'matchId'), getRouterParam(event, 'kind'))
  const source = await readFile(note, 'utf8').then(t => resolve(String(JSON.parse(t).source ?? ''))).catch(() => null)
  await rm(dir, { recursive: true, force: true })
  await rm(note, { force: true })
  const ours = source && [OUT_DIR, PUBLISH_DIR].some(root => resolve(dirname(source)) === resolve(root) || resolve(dirname(source)).startsWith(resolve(root) + sep))
  if (ours) await rm(source, { force: true })
  return { removed: dir, render: ours ? source : null }
})
