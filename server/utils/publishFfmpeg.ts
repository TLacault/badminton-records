import type { CropRect } from '~~/shared/publish'

/**
 * ffmpeg argument builders for the channel render. Pure: every function takes
 * paths and numbers and returns an argv, asserted in publishFfmpeg.test.ts.
 *
 * The film is three pieces encoded identically (intro, body, outro) and then
 * joined with the concat demuxer, so the 30–60 min body is encoded once and
 * never re-encoded for the join.
 */

export interface Frame {
  width: number
  height: number
  /** As ffprobe gives it: "60/1", "30000/1001". */
  fps: string
}

export interface SourceFacts extends Frame {
  path: string
  duration: number
  hasAudio: boolean
}

export interface Encode { draft: boolean }

const n = (x: number) => Number(x.toFixed(3))

/** Output frame: 16:9, even sides, never taller than the (cropped) source or 2160. */
export function outputFrame(source: SourceFacts, crop: CropRect | null, height: number | null): Frame {
  const srcH = Math.round(source.height * (crop?.h ?? 1))
  let h = Math.min(height ?? srcH, srcH, 2160)
  h -= h % 2
  let w = Math.round((h * 16) / 9)
  w -= w % 2
  return { width: w, height: h, fps: source.fps }
}

/** The same encoder settings on every piece, so the join is a stream copy. */
export function encodeArgs(frame: Frame, enc: Encode): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', enc.draft ? 'ultrafast' : 'medium',
    '-crf', enc.draft ? '26' : '18',
    '-pix_fmt', 'yuv420p',
    '-r', frame.fps,
    '-video_track_timescale', '90000',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  ]
}

/** Crop (normalised rect) then fill the frame. */
export function frameFilter(crop: CropRect | null, frame: Frame): string {
  const c = crop ? `crop=iw*${n(crop.w)}:ih*${n(crop.h)}:iw*${n(crop.x)}:ih*${n(crop.y)},` : ''
  return `${c}scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase,crop=${frame.width}:${frame.height},setsar=1,fps=${frame.fps}`
}

/** A full-frame transparent overlay (1920×1080 render) scaled onto the output. */
const overlayScale = (frame: Frame) => `scale=${frame.width}:${frame.height},format=rgba`

export function introArgs(opts: {
  video: string
  sting: string
  music: string | null
  seconds: number
  frame: Frame
  enc: Encode
  out: string
}): string[] {
  const { frame, seconds } = opts
  const inputs = ['-i', opts.video, '-i', opts.sting, ...(opts.music ? ['-i', opts.music] : [])]
  const audio = opts.music
    ? `[2:a]volume=0.55,afade=t=out:st=${seconds - 1.2}:d=1.2[m];[1:a][m]amix=inputs=2:normalize=0,apad,atrim=0:${seconds}[a]`
    : `[1:a]apad,atrim=0:${seconds}[a]`
  return [
    '-y', '-v', 'error', '-progress', 'pipe:1', '-nostdin',
    ...inputs,
    '-filter_complex', `[0:v]${frameFilter(null, frame)},format=yuv420p[v];${audio}`,
    '-map', '[v]', '-map', '[a]', '-t', String(seconds),
    ...encodeArgs(frame, opts.enc),
    opts.out,
  ]
}

export interface BodyOverlay { path: string, at: number }

/**
 * The match: kept segments joined, cropped and scaled, the scoreboard pictures
 * laid over (a concat list of PNGs, one per score, each held its duration), the
 * stings laid over the cuts, a whoosh under each sting.
 */
export function bodyArgs(opts: {
  source: SourceFacts
  segments: { from: number, to: number }[]
  crop: CropRect | null
  frame: Frame
  /** ffconcat file listing the scoreboard PNGs with durations, or null. */
  scoreList: string | null
  transitions: BodyOverlay[]
  whoosh: string
  enc: Encode
  out: string
}): string[] {
  const { source, segments, frame } = opts
  if (!segments.length) throw new Error('Nothing left to render: the trim and cuts remove the whole match')

  const inputs = ['-i', source.path]
  let next = 1
  const audioIn = source.hasAudio ? '0:a' : `${next}:a`
  if (!source.hasAudio) {
    inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo')
    next++
  }
  const scoreIn = opts.scoreList ? next++ : -1
  if (opts.scoreList) inputs.push('-f', 'concat', '-safe', '0', '-i', opts.scoreList)
  const trIn = opts.transitions.map((t) => {
    inputs.push('-i', t.path)
    return next++
  })
  const whooshIn = next++
  inputs.push('-i', opts.whoosh)

  const f: string[] = []
  segments.forEach((s, i) => {
    f.push(`[0:v]trim=start=${n(s.from)}:end=${n(s.to)},setpts=PTS-STARTPTS[v${i}]`)
    f.push(`[${audioIn}]atrim=start=${n(s.from)}:end=${n(s.to)},asetpts=PTS-STARTPTS[a${i}]`)
  })
  f.push(`${segments.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${segments.length}:v=1:a=1[vc][ac]`)
  f.push(`[vc]${frameFilter(opts.crop, frame)}[base]`)

  let last = 'base'
  if (scoreIn >= 0) {
    f.push(`[${scoreIn}:v]${overlayScale(frame)}[sb]`)
    f.push(`[${last}][sb]overlay=0:0:eof_action=repeat[vs]`)
    last = 'vs'
  }
  opts.transitions.forEach((t, k) => {
    f.push(`[${trIn[k]}:v]${overlayScale(frame)},setpts=PTS-STARTPTS+${n(t.at)}/TB[t${k}]`)
    f.push(`[${last}][t${k}]overlay=0:0:eof_action=pass[vt${k}]`)
    last = `vt${k}`
  })
  f.push(`[${last}]format=yuv420p[vout]`)

  if (opts.transitions.length) {
    const labels = opts.transitions.map((_, k) => `[w${k}]`).join('')
    f.push(`[${whooshIn}:a]volume=0.7,asplit=${opts.transitions.length}${labels}`)
    opts.transitions.forEach((t, k) => {
      const ms = Math.round(t.at * 1000)
      f.push(`[w${k}]adelay=${ms}|${ms}[wd${k}]`)
    })
    f.push(`[ac]${opts.transitions.map((_, k) => `[wd${k}]`).join('')}amix=inputs=${opts.transitions.length + 1}:normalize=0:duration=first[aout]`)
  }
  else {
    f.push(`[ac]anull[aout]`)
  }

  return [
    '-y', '-v', 'error', '-progress', 'pipe:1', '-nostdin',
    ...inputs,
    '-filter_complex', f.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    ...encodeArgs(frame, opts.enc),
    opts.out,
  ]
}

/** The outro: starred rallies slowed and darkened, the overlay on top, sound design under. */
export function outroArgs(opts: {
  source: SourceFacts
  clips: { from: number, to: number }[]
  speed: number
  overlay: string
  seconds: number
  crop: CropRect | null
  frame: Frame
  whoosh: string
  impact: string
  music: string | null
  enc: Encode
  out: string
}): string[] {
  const { frame, seconds } = opts
  const inputs = ['-i', opts.source.path, '-i', opts.overlay, '-i', opts.whoosh, '-i', opts.impact]
  if (opts.music) inputs.push('-i', opts.music)
  const f: string[] = []
  if (opts.clips.length) {
    opts.clips.forEach((c, i) => f.push(`[0:v]trim=start=${n(c.from)}:end=${n(c.to)},setpts=PTS-STARTPTS[c${i}]`))
    f.push(`${opts.clips.map((_, i) => `[c${i}]`).join('')}concat=n=${opts.clips.length}:v=1:a=0[cc]`)
    f.push(`[cc]setpts=PTS/${n(opts.speed)},${frameFilter(opts.crop, frame)},colorchannelmixer=rr=0.5:gg=0.5:bb=0.5,tpad=stop_mode=clone:stop_duration=${seconds},trim=0:${seconds},setpts=PTS-STARTPTS[bg]`)
  }
  else {
    f.push(`color=c=0x08070a:s=${frame.width}x${frame.height}:r=${frame.fps}:d=${seconds}[bg]`)
  }
  f.push(`[1:v]${overlayScale(frame)}[ov]`)
  f.push(`[bg][ov]overlay=0:0:eof_action=repeat,format=yuv420p[v]`)
  // Whoosh as the card arrives, the impact as the end screen lands (outro.html: 5.4 s).
  f.push(`[2:a]adelay=100|100[w]`)
  f.push(`[3:a]adelay=5400|5400[i]`)
  const mix = ['[w]', '[i]']
  if (opts.music) {
    f.push(`[4:a]volume=0.55,afade=t=out:st=${seconds - 2}:d=2[m]`)
    mix.push('[m]')
  }
  f.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0,apad,atrim=0:${seconds}[a]`)
  return [
    '-y', '-v', 'error', '-progress', 'pipe:1', '-nostdin',
    ...inputs,
    '-filter_complex', f.join(';'),
    '-map', '[v]', '-map', '[a]', '-t', String(seconds),
    ...encodeArgs(frame, opts.enc),
    opts.out,
  ]
}

/** Joins the pieces without re-encoding. */
export function joinArgs(list: string, out: string): string[] {
  return ['-y', '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]
}

/** ffconcat for PNG stills: each held `to - from`; the last entry is repeated so its duration counts. */
export function stillsList(items: { path: string, seconds: number }[]): string {
  const esc = (p: string) => p.replace(/'/g, `'\\''`)
  const lines = ['ffconcat version 1.0']
  for (const it of items) lines.push(`file '${esc(it.path)}'`, `duration ${n(Math.max(it.seconds, 0.001))}`)
  if (items.length) lines.push(`file '${esc(items.at(-1)!.path)}'`)
  return `${lines.join('\n')}\n`
}

export function piecesList(paths: string[]): string {
  return `ffconcat version 1.0\n${paths.map(p => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n')}\n`
}
