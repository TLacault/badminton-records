import { readFile } from 'node:fs/promises'
import { requireAdmin } from '../../../../utils/auth'
import { uploadFolder } from '../../../../utils/uploadFolder'

/** The folder's note: the upload job in flight and the video id once uploaded. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { note } = uploadFolder(getRouterParam(event, 'matchId'), getRouterParam(event, 'kind'))
  const data = JSON.parse(await readFile(note, 'utf8').catch(() => '{}'))
  return { uploadJob: (data.uploadJob as string | undefined) ?? null, videoId: (data.videoId as string | undefined) ?? null }
})
