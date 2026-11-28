import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { requireAdmin } from '../../../../utils/auth'
import { youtubeAuth } from '../../../../utils/channelImport'
import { startJob } from '../../../../utils/reel'
import { uploadFolder } from '../../../../utils/uploadFolder'
import { setThumbnail, uploadVideo } from '../../../../utils/youtube'

/**
 * Uploads the folder's video to the channel, started by Tim's click, with the
 * title, description, visibility and made-for-kids answer he set. Then the
 * thumbnail. Runs as a job (minutes for a 4K match); the video id lands in the
 * folder's note so the pipeline can link it even after a reload.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { matchId, kind, dir, note } = uploadFolder(getRouterParam(event, 'matchId'), getRouterParam(event, 'kind'))
  const body = await readBody<Record<string, unknown>>(event)
  const title = String(body?.title ?? '').trim()
  const description = String(body?.description ?? '')
  const privacy = (['public', 'unlisted', 'private'] as const).find(p => p === body?.privacy)
  if (!title || title.length > 100) throw createError({ statusCode: 400, statusMessage: 'A title of 1 to 100 characters is required' })
  if (description.length > 5000) throw createError({ statusCode: 400, statusMessage: 'The description is over 5000 characters' })
  if (/[<>]/.test(title + description)) throw createError({ statusCode: 400, statusMessage: 'YouTube does not accept < or > in titles and descriptions' })
  if (!privacy || typeof body?.madeForKids !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Choose the visibility and whether it is made for kids' })

  const files = await readdir(dir).catch(() => [] as string[])
  const video = files.find((f: string) => f.endsWith('.mp4'))
  if (!video) throw createError({ statusCode: 404, statusMessage: 'Nothing to upload: render it first' })
  const auth = await youtubeAuth(event)
  if (!('token' in auth)) throw createError({ statusCode: 501, statusMessage: 'Uploading needs YouTube OAuth: YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN are missing from this server (pnpm dev:hosted reads .env.hosted), restart it after adding them' })

  const readNote = async () => JSON.parse(await readFile(note, 'utf8').catch(() => '{}'))
  const job = startJob('upload', `upload:${matchId}:${kind}`, async (report) => {
    report(0, 'Starting the upload')
    const videoId = await uploadVideo(auth.token, join(dir, video), { title, description, privacy, madeForKids: body.madeForKids as boolean }, report)
    await writeFile(note, JSON.stringify({ ...(await readNote()), videoId }))
    let thumbnail: string | null = null
    if (files.includes('thumbnail.jpg')) {
      report(1, 'Setting the thumbnail')
      thumbnail = await setThumbnail(auth.token, videoId, await readFile(join(dir, 'thumbnail.jpg'))).then(() => null, (e: Error) => e.message)
    }
    return { videoId, thumbnail }
  })
  await writeFile(note, JSON.stringify({ ...(await readNote()), uploadJob: job.id }))
  return { job }
})
