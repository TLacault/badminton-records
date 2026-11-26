import type { RenderRequest } from '~~/shared/publish'
import type { ReelBrand } from '~~/shared/reel'
import type { SourceFacts } from './publishFfmpeg'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { INTRO_SECONDS, OUTRO_SECONDS } from '~~/shared/publish'
import { bodyArgs, introArgs, joinArgs, outputFrame, outroArgs, piecesList, stillsList } from './publishFfmpeg'
import { CACHE_DIR, exists, run } from './reel'

const exec = promisify(execFile)

/**
 * The channel render: HyperFrames draws the branded pieces (intro, stings,
 * outro overlay, scoreboard stills), ffmpeg cuts the match and joins it all.
 * Local only, like /clip: it needs ffmpeg and a headless Chrome.
 */

export const PUBLISH_DIR = join(CACHE_DIR, 'publish')
export const HF_CACHE = join(CACHE_DIR, 'hyperframes')
const BRAND_DIR = join(process.cwd(), 'brand')
const VIDEO_DIR = join(BRAND_DIR, 'video')
const AUDIO_DIR = join(BRAND_DIR, 'audio')
const HF_BIN = join(process.cwd(), 'node_modules', '.bin', 'hyperframes')

export const publishDir = (matchId: string) => join(PUBLISH_DIR, matchId)

export async function hasHyperframes(): Promise<boolean> {
  return exists(HF_BIN)
}

/** Width, height and frame rate as well as what reel.ts probes. */
export async function sourceFacts(path: string): Promise<SourceFacts> {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { maxBuffer: 8 << 20 })
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: { codec_type?: string, width?: number, height?: number, r_frame_rate?: string }[]
  }
  const video = parsed.streams?.find(s => s.codec_type === 'video')
  if (!video?.width || !video.height) throw new Error('The source has no video stream')
  const fps = video.r_frame_rate && /^\d+\/\d+$/.test(video.r_frame_rate) && !video.r_frame_rate.startsWith('0/') ? video.r_frame_rate : '30/1'
  return {
    path,
    width: video.width,
    height: video.height,
    fps,
    duration: Number(parsed.format?.duration ?? 0) || 0,
    hasAudio: (parsed.streams ?? []).some(s => s.codec_type === 'audio'),
  }
}

type Report = (progress: number | null, message?: string) => void

/**
 * One HyperFrames render, cached by composition + variables + format: the
 * intro of a match re-renders only when its card text changes.
 */
async function hyperframes(
  composition: 'intro' | 'outro' | 'transition' | 'scoreboard' | 'short-intro' | 'short-outro' | 'short-frame',
  variables: Record<string, string>,
  format: 'mp4' | 'mov' | 'png-sequence',
  report: Report,
  extra: string[] = [],
): Promise<string> {
  const key = createHash('sha1').update(JSON.stringify([composition, variables, format, extra, 2])).digest('hex').slice(0, 16)
  const ext = format === 'png-sequence' ? '' : `.${format}`
  const out = join(HF_CACHE, `${composition}-${key}${ext}`)
  if (await exists(out)) return out

  await mkdir(HF_CACHE, { recursive: true })
  const varsFile = join(HF_CACHE, `${composition}-${key}.json`)
  await writeFile(varsFile, JSON.stringify(variables))
  const partial = `${out}.part${ext}`
  await rm(partial, { recursive: true, force: true })
  report(null, `Drawing the ${composition}`)
  await run(HF_BIN, [
    'render', VIDEO_DIR,
    '-c', `${composition}.html`,
    '--format', format,
    '--variables-file', varsFile,
    '-q', 'delivery',
    '--quiet',
    ...extra,
    '-o', partial,
  ], () => {})
  await rename(partial, out)
  return out
}

/** Browser text → HyperFrames variables: at most 20 plain one-line strings. */
export function sanitiseVars(v: unknown): Record<string, string> | null {
  const text = (x: unknown, max = 160) => String(x ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max)
  return v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 20).map(([k, x]) => [text(k, 20), text(x)]))
    : null
}

export function sanitiseBrand(raw: Partial<ReelBrand> | null | undefined): ReelBrand | null {
  if (!raw) return null
  return {
    colour: /^#[0-9a-f]{6}$/i.test(String(raw.colour)) ? String(raw.colour) : '#cb2543',
    frame: sanitiseVars(raw.frame) ?? {},
    intro: sanitiseVars(raw.intro) ?? {},
    outro: sanitiseVars(raw.outro) ?? {},
  }
}

/**
 * The vertical reel's branding for one match: the still behind the clips and
 * the two quick bookends. Each is cached on its text, so only the first call
 * for a match draws anything. Returns file names in HF_CACHE (no extension).
 */
export async function reelBrand(brand: ReelBrand, report: Report = () => {}) {
  const frameDir = await hyperframes('short-frame', { ...brand.frame, colour: brand.colour }, 'png-sequence', report, ['--fps', '1'])
  const framePng = `${frameDir}.png`
  if (!(await exists(framePng))) {
    const first = (await readdir(frameDir)).filter(f => f.endsWith('.png')).sort()[0]
    if (!first) throw new Error('The frame render produced no picture')
    await copyFile(join(frameDir, first), framePng)
  }
  const intro = await hyperframes('short-intro', { ...brand.intro, colour: brand.colour }, 'mp4', report)
  const outro = await hyperframes('short-outro', { ...brand.outro, colour: brand.colour }, 'mp4', report)
  const name = (path: string) => path.slice(HF_CACHE.length + 1).replace(/\.(mp4|png)$/, '')
  return { frame: name(framePng), intro: name(intro), outro: name(outro), paths: { frame: framePng, intro, outro } }
}

const optional = async (path: string) => (await exists(path) ? path : null)

/** Runs a render request end to end and writes the upload kit. Returns the kit's paths. */
export async function renderPublish(req: RenderRequest, source: SourceFacts, report: Report) {
  const dir = publishDir(req.matchId)
  const work = join(dir, 'work')
  await mkdir(work, { recursive: true })
  const enc = { draft: req.draft }
  const frame = outputFrame(source, req.crop, req.draft ? Math.min(req.outputHeight ?? 720, 720) : req.outputHeight)
  const whoosh = join(AUDIO_DIR, 'whoosh.wav')
  const pieces: string[] = []
  const { plan } = req

  // --- scoreboard stills, one per distinct board
  let scoreList: string | null = null
  if (plan.scores.length && plan.boards.length) {
    const boards = plan.boards.slice(0, 320)
    const seq = await hyperframes('scoreboard', {
      colour: req.colour,
      s1: req.sides[0],
      s2: req.sides[1],
      corner: req.corner,
      states: JSON.stringify(boards),
    }, 'png-sequence', report, ['--fps', '1'])
    const frames = (await readdir(seq)).filter(f => f.endsWith('.png')).sort()
    const items = plan.scores.map((s, i) => ({
      path: join(seq, frames[Math.min(s.board, frames.length - 1)]!),
      // Held until the next picture, so rounding never opens a gap.
      seconds: (plan.scores[i + 1]?.from ?? plan.bodyDuration) - s.from,
    }))
    // The board starts at 0: anything before the first picture shows the first.
    if (items.length && plan.scores[0]!.from > 0) items[0]!.seconds += plan.scores[0]!.from
    scoreList = join(work, 'scores.ffconcat')
    await writeFile(scoreList, stillsList(items))
  }

  // --- stings
  const transitions: { path: string, at: number }[] = []
  for (const t of plan.transitions) {
    const path = await hyperframes('transition', {
      colour: req.colour,
      kind: t.kind,
      title: t.title,
      score: t.score,
      names: `${req.sides[0]} · ${req.sides[1]}`,
    }, 'mov', report)
    transitions.push({ path, at: t.at })
  }

  // --- intro
  if (req.intro) {
    const video = await hyperframes('intro', { ...req.intro, colour: req.colour }, 'mp4', report)
    const out = join(work, 'intro.mp4')
    report(null, 'Encoding the intro')
    await run('ffmpeg', introArgs({ video, sting: join(AUDIO_DIR, 'sting.wav'), music: await optional(join(AUDIO_DIR, 'intro-music.mp3')), seconds: INTRO_SECONDS, frame, enc, out }), () => {})
    pieces.push(out)
  }

  // --- the match
  const body = join(work, 'body.mp4')
  report(0, 'Cutting the match')
  await run('ffmpeg', bodyArgs({ source, segments: plan.segments, crop: req.crop, frame, scoreList, transitions, whoosh, enc, out: body }), (p, m) => report(p === null ? null : p * 0.95, m), plan.bodyDuration)
  pieces.push(body)

  // --- outro
  if (req.outro) {
    const overlay = await hyperframes('outro', { ...req.outro, colour: req.colour }, 'mov', report)
    const out = join(work, 'outro.mp4')
    report(0.96, 'Encoding the outro')
    await run('ffmpeg', outroArgs({
      source,
      clips: plan.outroClips,
      speed: plan.outroSpeed,
      overlay,
      seconds: OUTRO_SECONDS,
      crop: req.crop,
      frame,
      whoosh,
      impact: join(AUDIO_DIR, 'impact.wav'),
      music: await optional(join(AUDIO_DIR, 'outro-music.mp3')),
      enc,
      out,
    }), () => {})
    pieces.push(out)
  }

  // --- join + texts
  report(0.98, 'Joining')
  const list = join(work, 'pieces.ffconcat')
  await writeFile(list, piecesList(pieces))
  const video = join(dir, req.draft ? 'video-draft.mp4' : 'video.mp4')
  await run('ffmpeg', joinArgs(list, video), () => {})
  await writeFile(join(dir, 'title.txt'), `${req.title}\n`)
  await writeFile(join(dir, 'description.txt'), `${req.description}\n`)
  return { dir, video, width: frame.width, height: frame.height }
}
