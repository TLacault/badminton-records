import { capabilities, exists, parseVideoId, probe, run, sourcePath, startJob } from '../../utils/reel'

/**
 * Pulls the match video down so the editor can scrub it frame by frame.
 *
 * This is the "user material" the whole tool leans on: a YouTube embed cannot
 * be seeked accurately, cannot be played back at 0.25x without stuttering, and
 * cannot be rendered from at all. One download, cached by video id, and both
 * the preview and the export get a real file.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ videoId?: string, height?: number }>(event)
  const videoId = parseVideoId(body?.videoId ?? '')
  if (!videoId) throw createError({ statusCode: 400, statusMessage: 'A YouTube video id or URL is required' })

  const caps = await capabilities()
  if (!caps.download) {
    throw createError({
      statusCode: 501,
      statusMessage: 'This host has no yt-dlp/ffmpeg, so it cannot fetch the match video',
    })
  }

  const path = sourcePath(videoId)
  if (await exists(path)) {
    const facts = await probe(path)
    return { ready: true, videoId, duration: facts.duration, job: null }
  }

  // 1080p unless asked otherwise: a 4K source triples the download and the
  // render for detail that a highlight reel throws away on upload anyway.
  const height = [720, 1080, 1440, 2160].includes(Number(body?.height)) ? Number(body!.height) : 1080

  const job = startJob('source', `source:${videoId}`, async (report) => {
    report(0, 'Starting download')
    await run('yt-dlp', [
      '--no-playlist',
      '--newline',
      '-f', `bv*[height<=${height}]+ba/b[height<=${height}]/b`,
      '--merge-output-format', 'mp4',
      '-o', path,
      `https://www.youtube.com/watch?v=${videoId}`,
    ], report)
    const facts = await probe(path)
    return { videoId, duration: facts.duration }
  })

  return { ready: false, videoId, job }
})
