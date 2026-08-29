import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  capabilities,
  exists,
  loudnessPeaks,
  MUSIC_DIR,
  musicPath,
  parseVideoId,
  probe,
  readInfo,
  run,
  startJob,
} from '../../utils/reel'

/** One reading every quarter second — fine enough to draw, cheap enough to send. */
const INTERVAL = 0.25

/**
 * Fetches a song and measures it.
 *
 * The measurement is the point. A loudness envelope is what lets the tool pick
 * the slice of the track that fits the reel — the chorus, near enough — rather
 * than starting every compilation at 0:00 on a fade-in.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string }>(event)
  const videoId = parseVideoId(body?.url ?? '')
  if (!videoId) throw createError({ statusCode: 400, statusMessage: 'Paste a YouTube link or video id' })

  const caps = await capabilities()
  if (!caps.download) {
    throw createError({
      statusCode: 501,
      statusMessage: 'This host has no yt-dlp/ffmpeg, so the track can only be previewed from YouTube',
    })
  }

  const audio = musicPath(videoId)
  const meta = join(MUSIC_DIR, `${videoId}.json`)

  if (await exists(audio) && await exists(meta)) {
    return { ready: true, videoId, job: null, track: JSON.parse(await readFile(meta, 'utf8')) }
  }

  const job = startJob('music', `music:${videoId}`, async (report) => {
    report(0, 'Fetching the track')
    await run('yt-dlp', [
      '--no-playlist',
      '--newline',
      '-x', '--audio-format', 'm4a',
      '--write-info-json',
      '-o', join(MUSIC_DIR, `${videoId}.%(ext)s`),
      `https://www.youtube.com/watch?v=${videoId}`,
    ], report)

    report(0.9, 'Measuring the track')
    const [info, facts, peaks] = await Promise.all([
      readInfo(join(MUSIC_DIR, `${videoId}.info.json`)),
      probe(audio),
      loudnessPeaks(audio, INTERVAL),
    ])

    const track = {
      videoId,
      title: info.title ?? 'Imported track',
      duration: facts.duration || info.duration || 0,
      interval: INTERVAL,
      peaks: peaks.map(p => Math.round(p * 1000) / 1000),
    }
    await writeFile(meta, JSON.stringify(track))
    return { track }
  })

  return { ready: false, videoId, job }
})
