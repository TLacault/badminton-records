import type { ReelCapabilities } from '~~/shared/reel'
import type { MediaFacts } from './reelFfmpeg'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseVideoIdLoose } from '~~/shared/reel'

/**
 * The machinery under the reel maker: where big files live, which binaries the
 * host actually has, and the job registry that lets a browser watch a download
 * or a render it is not holding a connection open for.
 *
 * Nothing here is required for the editor to work. A host without ffmpeg still
 * cuts, previews and saves a project — it just cannot hand back an mp4, and
 * says so rather than failing at the end of a long job.
 */

const exec = promisify(execFile)

export const CACHE_DIR = process.env.REEL_CACHE_DIR ?? join(process.cwd(), '.reel-cache')
export const SOURCE_DIR = join(CACHE_DIR, 'source')
export const MUSIC_DIR = join(CACHE_DIR, 'music')
export const OUT_DIR = join(CACHE_DIR, 'out')

/**
 * Where an auto-imported intro and outro are looked for.
 *
 * Under `brand/` rather than at `public/reel/`, which would shadow the page:
 * a directory in `public` with the same name as a route makes Nitro redirect
 * `/reel` to `/reel/` and serve the folder instead of the editor.
 */
export const BOOKEND_DIR = join(process.cwd(), 'public', 'brand', 'reel')

export async function ensureDirs() {
  await Promise.all([SOURCE_DIR, MUSIC_DIR, OUT_DIR].map(dir => mkdir(dir, { recursive: true })))
}

/** Re-exported so a handler validating an id imports it from one place. */
export const parseVideoId = parseVideoIdLoose

/**
 * Whether a binary is here and runnable.
 *
 * The flag is per-tool on purpose: ffmpeg exits 8 on `--version` — it parses
 * the double dash as an unknown option — which is exactly the sort of thing
 * that makes a capability probe quietly answer "no" on a machine that has
 * everything installed.
 */
async function has(binary: string, flag = '--version'): Promise<boolean> {
  try {
    await exec(binary, [flag], { timeout: 8000 })
    return true
  }
  catch {
    return false
  }
}

let cached: ReelCapabilities | null = null
let cachedAt = 0

/** Re-probed every half minute: a host can gain a binary without a restart. */
export async function capabilities(): Promise<ReelCapabilities> {
  if (cached && Date.now() - cachedAt < 30_000) return { ...cached, ...(await cacheStats()) }
  await ensureDirs()
  const [ytdlp, ffmpeg, ffprobe, intro, outro] = await Promise.all([
    has('yt-dlp'),
    has('ffmpeg', '-version'),
    has('ffprobe', '-version'),
    exists(join(BOOKEND_DIR, 'intro.mp4')),
    exists(join(BOOKEND_DIR, 'outro.mp4')),
  ])
  // Measured here rather than in the browser, so the preview and the render
  // agree on how long the intro runs. A host with no ffprobe answers null and
  // the editor falls back to reading the file with a video element.
  const [introFacts, outroFacts] = await Promise.all([
    intro && ffprobe ? probe(BOOKENDS.intro).catch(() => null) : null,
    outro && ffprobe ? probe(BOOKENDS.outro).catch(() => null) : null,
  ])

  cached = {
    // ffprobe comes with ffmpeg, but a container can ship one without the
    // other, and every render measures its inputs before it cuts anything.
    download: ytdlp && ffmpeg && ffprobe,
    render: ffmpeg && ffprobe,
    intro,
    outro,
    introSeconds: introFacts?.duration ?? null,
    outroSeconds: outroFacts?.duration ?? null,
    cacheDir: CACHE_DIR,
    cachedSources: [],
    cachedBytes: 0,
  }
  cachedAt = Date.now()
  return { ...cached, ...(await cacheStats()) }
}

async function cacheStats() {
  try {
    const files = await readdir(SOURCE_DIR)
    const mp4s = files.filter(f => f.endsWith('.mp4'))
    const sizes = await Promise.all(mp4s.map(async f => (await stat(join(SOURCE_DIR, f))).size))
    return {
      cachedSources: mp4s.map(f => f.replace(/\.mp4$/, '')),
      cachedBytes: sizes.reduce((total, size) => total + size, 0),
    }
  }
  catch {
    return { cachedSources: [], cachedBytes: 0 }
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

/** Length and whether there is anything to hear, straight from the container. */
export async function probe(path: string): Promise<MediaFacts> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    path,
  ], { maxBuffer: 8 << 20 })

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: { codec_type?: string }[]
  }

  return {
    path,
    duration: Number(parsed.format?.duration ?? 0) || 0,
    hasAudio: (parsed.streams ?? []).some(s => s.codec_type === 'audio'),
  }
}

/**
 * A loudness envelope, one reading per `interval` seconds.
 *
 * Decoded to 8kHz mono and measured here rather than asked of `astats`, whose
 * reset period is counted in frames and so drifts against wall-clock seconds.
 * A four-minute track is under four megabytes at this rate, and the numbers
 * that come back are both the waveform the music panel draws and the thing
 * `fitMusicStart` searches for a chorus in.
 */
export async function loudnessPeaks(path: string, interval = 0.25): Promise<number[]> {
  const rate = 8000
  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-v', 'error', '-nostdin',
      '-i', path,
      '-ac', '1', '-ar', String(rate), '-f', 's16le', '-',
    ])
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', reject)
    child.on('close', code => code === 0
      ? resolve(Buffer.concat(chunks))
      : reject(new Error(`ffmpeg exited ${code} while measuring the track`)))
  })

  const samplesPerBucket = Math.max(1, Math.round(rate * interval))
  const total = Math.floor(pcm.length / 2)
  const peaks: number[] = []

  for (let start = 0; start < total; start += samplesPerBucket) {
    let sum = 0
    const end = Math.min(total, start + samplesPerBucket)
    for (let i = start; i < end; i++) {
      const sample = pcm.readInt16LE(i * 2) / 32768
      sum += sample * sample
    }
    peaks.push(Math.sqrt(sum / Math.max(1, end - start)))
  }

  return peaks
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export type JobKind = 'source' | 'music' | 'render'
export type JobState = 'running' | 'done' | 'error'

export interface Job {
  id: string
  kind: JobKind
  state: JobState
  /** 0–1, or null while the tool has not said anything measurable yet. */
  progress: number | null
  /** The last line worth showing a human. */
  message: string
  error: string | null
  /** Whatever the job produced: an id, a path, a duration. */
  result: Record<string, unknown> | null
  startedAt: number
  finishedAt: number | null
}

const jobs = new Map<string, Job>()
/** One job per thing: asking twice for the same download joins the first. */
const byKey = new Map<string, string>()

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null
}

/** Finished jobs are kept for an hour so a slow tab can still read the result. */
function sweep() {
  const cutoff = Date.now() - 3600_000
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) {
      jobs.delete(id)
      for (const [key, value] of byKey) if (value === id) byKey.delete(key)
    }
  }
}

export function runningJobFor(key: string): Job | null {
  const id = byKey.get(key)
  const job = id ? jobs.get(id) : null
  return job && job.state === 'running' ? job : null
}

/**
 * Starts work in the background and hands back a ticket.
 *
 * The browser polls the ticket rather than holding a request open for the
 * eleven minutes a 4K download can take, which also means a reload does not
 * lose the job — it is still there, still counting up.
 */
export function startJob(
  kind: JobKind,
  key: string,
  work: (report: (progress: number | null, message?: string) => void) => Promise<Record<string, unknown>>,
): Job {
  sweep()
  const existing = runningJobFor(key)
  if (existing) return existing

  const job: Job = {
    id: randomUUID(),
    kind,
    state: 'running',
    progress: null,
    message: '',
    error: null,
    result: null,
    startedAt: Date.now(),
    finishedAt: null,
  }
  jobs.set(job.id, job)
  byKey.set(key, job.id)

  work((progress, message) => {
    job.progress = progress
    if (message) job.message = message
  })
    .then((result) => {
      job.state = 'done'
      job.progress = 1
      job.result = result
      job.finishedAt = Date.now()
    })
    .catch((cause: unknown) => {
      job.state = 'error'
      job.error = cause instanceof Error ? cause.message : String(cause)
      job.finishedAt = Date.now()
    })

  return job
}

/**
 * Runs a command, watching both pipes for anything that looks like progress.
 *
 * yt-dlp counts in per cent on stdout; ffmpeg is asked for `-progress pipe:1`
 * and answers in microseconds of output written, which only becomes a fraction
 * once you know how long the film is meant to be — hence `totalSeconds`.
 */
export function run(
  binary: string,
  args: string[],
  report: (progress: number | null, message?: string) => void,
  totalSeconds?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''

    const read = (chunk: Buffer) => {
      const text = chunk.toString()
      tail = `${tail}${text}`.slice(-4000)

      const percent = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(text)
      if (percent) {
        report(Number(percent[1]) / 100, 'Downloading')
        return
      }
      const outTime = /out_time_ms=(\d+)/.exec(text)
      if (outTime && totalSeconds) {
        const seconds = Number(outTime[1]) / 1_000_000
        report(Math.min(0.999, seconds / totalSeconds), 'Rendering')
        return
      }
      const merging = /\[Merger\]|\[ExtractAudio\]/.exec(text)
      if (merging) report(0.97, 'Finishing up')
    }

    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      // The tail rather than the whole log: what fails is nearly always in the
      // last few lines, and the rest is a wall of stream metadata.
      else reject(new Error(`${binary} exited ${code}\n${tail.trim().split('\n').slice(-6).join('\n')}`))
    })
  })
}

export function sourcePath(videoId: string): string {
  return join(SOURCE_DIR, `${videoId}.mp4`)
}

export function musicPath(videoId: string): string {
  return join(MUSIC_DIR, `${videoId}.m4a`)
}

export async function removeSource(videoId: string) {
  await unlink(sourcePath(videoId)).catch(() => {})
}

/** The info.json yt-dlp leaves beside a track, for its title and length. */
export async function readInfo(path: string): Promise<{ title?: string, duration?: number }> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as { title?: string, duration?: number }
  }
  catch {
    return {}
  }
}

/** A stable name for a render, so re-exporting the same edit reuses the file. */
export function renderName(payload: unknown): string {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
}

export const BOOKENDS = {
  intro: join(BOOKEND_DIR, 'intro.mp4'),
  outro: join(BOOKEND_DIR, 'outro.mp4'),
}
