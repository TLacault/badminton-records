import { parseVideoId, removeSource } from '../../../utils/reel'

/** Drops a cached match video. Matches are gigabytes; the cache is not sacred. */
export default defineEventHandler(async (event) => {
  const videoId = parseVideoId(getRouterParam(event, 'id') ?? '')
  if (!videoId) throw createError({ statusCode: 400, statusMessage: 'Bad video id' })
  await removeSource(videoId)
  return { ok: true }
})
