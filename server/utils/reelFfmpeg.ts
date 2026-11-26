import type { ReelClip, ReelProject } from '~~/shared/reel'
import { activeClips, outSeconds, SHORT_FRAME } from '~~/shared/reel'

/**
 * The render, as an argv.
 *
 * Kept pure and away from the process that runs it, because an ffmpeg
 * invocation is the least debuggable thing in this repository: a filter graph
 * is either exactly right or it fails eighty frames in with a message about a
 * pad. Built here, asserted in reelFfmpeg.test.ts, and only then handed to a
 * child process.
 */

export interface MediaFacts {
  path: string
  duration: number
  hasAudio: boolean
}

export interface RenderInputs {
  project: ReelProject
  source: MediaFacts
  music: MediaFacts | null
  intro: MediaFacts | null
  outro: MediaFacts | null
  /** The vertical frame still (PNG, 1080×1920) the clips sit in; null = black bands. */
  frame?: string | null
  /** The frame building in (mp4, ≈1.2 s, ends on the still): after the intro, and reversed before the outro. */
  frameIn?: string | null
  /**
   * Per active clip, an ffconcat list of the full video's scoreboard PNGs
   * (transparent 1920×1080), each held as long as that score stands; null = none.
   */
  scoreLists?: (string | null)[]
  outputPath: string
}

export interface RenderPlan {
  args: string[]
  /** Length of the finished film, so progress can be a percentage. */
  duration: number
}

const GRADE_FILTERS: Record<string, string> = {
  none: '',
  punch: 'eq=contrast=1.12:saturation=1.3:gamma=0.98',
  mono: 'hue=s=0,eq=contrast=1.18:gamma=1.02',
  warm: 'colorbalance=rs=0.08:gs=0.02:bs=-0.07,eq=saturation=1.08',
  cool: 'colorbalance=rs=-0.07:gs=0:bs=0.1,eq=saturation=1.04',
  faded: 'eq=contrast=0.88:brightness=0.04:saturation=0.72,vignette=PI/5',
}

/** Length of brand/video/short-frame.html with animate=1. */
const FRAME_IN_SECONDS = 1.2

const XFADE: Record<string, string> = {
  crossfade: 'fade',
  fadeblack: 'fadeblack',
  flash: 'fadewhite',
}

/** atempo only stretches between 0.5x and 2x, so a bigger change is chained. */
export function atempoChain(speed: number): string[] {
  const steps: string[] = []
  let remaining = speed
  while (remaining < 0.5) {
    steps.push('atempo=0.5')
    remaining /= 0.5
  }
  while (remaining > 2) {
    steps.push('atempo=2')
    remaining /= 2
  }
  if (Math.abs(remaining - 1) > 0.001) steps.push(`atempo=${round(remaining)}`)
  return steps
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/**
 * One clip's video chain: speed, punch-in, grade, then the frame it has to be
 * to sit next to every other clip.
 *
 * The normalising tail is not optional. A concat or an xfade refuses streams
 * that disagree about size, pixel format, aspect or frame rate — and the intro
 * mp4 comes from somewhere else entirely, so they always do disagree.
 */
function videoChain(
  clip: ReelClip,
  project: ReelProject,
  width: number,
  height: number,
): string {
  const steps: string[] = ['setpts=PTS-STARTPTS']

  if (clip.speed !== 1) steps.push(`setpts=${round(1 / clip.speed)}*PTS`)
  if (clip.zoom > 1.001) {
    // Cropped before the scale, so the punch-in costs less work rather than
    // more: everything after this is operating on fewer pixels.
    steps.push(`crop=iw/${round(clip.zoom)}:ih/${round(clip.zoom)}`)
  }

  const grade = GRADE_FILTERS[clip.grade]
  if (grade) steps.push(grade)

  steps.push(
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'setsar=1',
    `fps=${project.output.fps}`,
    'format=yuv420p',
  )

  return steps.join(',')
}

/** One clip's audio chain: the same speed change, applied to time not pitch. */
function audioChain(clip: ReelClip, project: ReelProject): string {
  const steps = ['asetpts=PTS-STARTPTS', 'aresample=48000']
  if (clip.speed !== 1) steps.push(...atempoChain(clip.speed))
  steps.push(`volume=${round(project.output.matchAudio)}`)
  return steps.join(',')
}

/** A bookend is normalised too, but never graded or sped up. */
function bookendChain(project: ReelProject, width: number, height: number): string {
  return [
    'setpts=PTS-STARTPTS',
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `fps=${project.output.fps}`,
    'format=yuv420p',
  ].join(',')
}

export function buildRenderPlan(inputs: RenderInputs): RenderPlan {
  const { project, source, music, intro, outro, outputPath } = inputs
  const frame = inputs.frame ?? null
  const clips = activeClips(project)
  if (!clips.length) throw new Error('Nothing to render: the reel has no clips')

  // `output.height` is the short side. Portrait: the landscape clip is cut to
  // the window, full width, and laid over the frame at its place. Landscape:
  // the clip is the whole picture.
  const even = (x: number) => Math.round(x / 2) * 2
  const portrait = project.orientation !== 'landscape'
  const width = portrait ? project.output.height : even((project.output.height * 16) / 9)
  const height = portrait ? even((width * SHORT_FRAME.height) / SHORT_FRAME.width) : project.output.height
  const windowHeight = portrait ? even((width * SHORT_FRAME.windowHeight) / SHORT_FRAME.width) : height
  const windowTop = portrait ? even((width * SHORT_FRAME.windowTop) / SHORT_FRAME.width) : 0
  const overlap = project.transition === 'cut' ? 0 : Math.max(0.05, project.transitionSeconds)

  const args: string[] = ['-hide_banner', '-nostdin', '-y']
  const filters: string[] = []

  /** Every piece to be joined, in order, with the length it contributes. */
  const pieces: { video: string, audio: string, seconds: number }[] = []
  let index = 0

  function silence(seconds: number, label: string) {
    // A bookend cut without sound still needs an audio stream, or concat sees
    // one piece with two pads and the rest with one, and refuses the lot.
    filters.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${round(seconds)},asetpts=PTS-STARTPTS[${label}]`,
    )
  }

  if (intro && project.intro) {
    args.push('-i', intro.path)
    const at = index++
    filters.push(`[${at}:v]${bookendChain(project, width, height)}[iv]`)
    if (intro.hasAudio) filters.push(`[${at}:a]asetpts=PTS-STARTPTS,aresample=48000[ia]`)
    else silence(intro.duration, 'ia')
    pieces.push({ video: 'iv', audio: 'ia', seconds: intro.duration })
  }

  clips.forEach((clip, i) => {
    // -ss before -i seeks by index rather than by decoding up to the point,
    // which is the difference between a clip opening instantly and ffmpeg
    // chewing through forty minutes of match for every one of twenty clips.
    args.push('-ss', round(clip.from), '-to', round(clip.to), '-i', source.path)
    const at = index++
    // Landscape: the clip is the whole picture already, nothing to sit in.
    const out = `${portrait ? 'w' : 'v'}${i}`
    const list = project.captions ? inputs.scoreLists?.[i] : null
    if (list) {
      // The scoreboard sits on the match picture, after the punch-in and the
      // grade, so it stays the size and colour it is in the full video.
      args.push('-f', 'concat', '-safe', '0', '-i', list)
      const sb = index++
      filters.push(
        `[${at}:v]${videoChain(clip, project, width, windowHeight)}[c${i}]`,
        `[${sb}:v]scale=${width}:${windowHeight},format=rgba[s${i}]`,
        `[c${i}][s${i}]overlay=0:0:eof_action=repeat,format=yuv420p[${out}]`,
      )
    }
    else filters.push(`[${at}:v]${videoChain(clip, project, width, windowHeight)}[${out}]`)
    if (portrait && frame) {
      // One looped input per clip, cut to its length: a single split frame
      // would buffer every picture until the last clip asks for it.
      args.push('-framerate', String(project.output.fps), '-loop', '1', '-t', round(outSeconds(clip)), '-i', frame)
      const f = index++
      const norm = `scale=${width}:${height},setsar=1,fps=${project.output.fps},format=yuv420p`
      filters.push(`[${f}:v]scale=${width}:${height},setsar=1,format=yuv420p[f${i}]`)
      let base = `f${i}`
      const frameIn = inputs.frameIn ?? null
      // The bands come in on the first clip and go out on the last, so the
      // joins with the intro and outro are a movement, not a cut.
      if (frameIn && i === 0) {
        args.push('-i', frameIn)
        const fi = index++
        filters.push(`[${fi}:v]${norm}[fin${i}]`, `[${base}][fin${i}]overlay=0:0:eof_action=pass[fa${i}]`)
        base = `fa${i}`
      }
      if (frameIn && i === clips.length - 1) {
        args.push('-i', frameIn)
        const fo = index++
        const start = Math.max(0, outSeconds(clip) - FRAME_IN_SECONDS)
        filters.push(`[${fo}:v]reverse,${norm},setpts=PTS-STARTPTS+${round(start)}/TB[fout${i}]`, `[${base}][fout${i}]overlay=0:0:eof_action=pass[fb${i}]`)
        base = `fb${i}`
      }
      filters.push(`[${base}][w${i}]overlay=0:${windowTop}:shortest=1,fps=${project.output.fps},format=yuv420p[v${i}]`)
    }
    else if (portrait) {
      filters.push(`[w${i}]pad=${width}:${height}:0:${windowTop}:color=black[v${i}]`)
    }
    if (source.hasAudio) filters.push(`[${at}:a]${audioChain(clip, project)}[a${i}]`)
    else silence(outSeconds(clip), `a${i}`)
    pieces.push({ video: `v${i}`, audio: `a${i}`, seconds: outSeconds(clip) })
  })

  if (outro && project.outro) {
    args.push('-i', outro.path)
    const at = index++
    filters.push(`[${at}:v]${bookendChain(project, width, height)}[ov]`)
    if (outro.hasAudio) filters.push(`[${at}:a]asetpts=PTS-STARTPTS,aresample=48000[oa]`)
    else silence(outro.duration, 'oa')
    pieces.push({ video: 'ov', audio: 'oa', seconds: outro.duration })
  }

  let videoLabel = pieces[0]!.video
  let audioLabel = pieces[0]!.audio
  let running = pieces[0]!.seconds

  if (pieces.length > 1 && project.transition === 'cut') {
    const chain = pieces.map(p => `[${p.video}][${p.audio}]`).join('')
    filters.push(`${chain}concat=n=${pieces.length}:v=1:a=1[cv][ca]`)
    videoLabel = 'cv'
    audioLabel = 'ca'
    running = pieces.reduce((total, p) => total + p.seconds, 0)
  }
  else if (pieces.length > 1) {
    // xfade joins two streams at a time, so the reel is folded left to right.
    // Its offset is measured on the *result so far*, which is why `running`
    // has to be carried rather than recomputed from the clip list.
    const kind = XFADE[project.transition] ?? 'fade'
    pieces.slice(1).forEach((piece, i) => {
      const offset = Math.max(0, running - overlap)
      const nextV = `xv${i}`
      const nextA = `xa${i}`
      filters.push(
        `[${videoLabel}][${piece.video}]xfade=transition=${kind}:duration=${round(overlap)}:offset=${round(offset)}[${nextV}]`,
        `[${audioLabel}][${piece.audio}]acrossfade=d=${round(overlap)}:c1=tri:c2=tri[${nextA}]`,
      )
      videoLabel = nextV
      audioLabel = nextA
      running = running + piece.seconds - overlap
    })
  }

  const duration = running

  if (music) {
    // Trimmed to the film rather than faded out early: the song is chosen to
    // be exactly this long, and `duration=first` in the mix would otherwise
    // let a short track end the audio ahead of the picture.
    // Too short for the reel: the song starts over from its top (-stream_loop),
    // rather than the mix running out into match sound alone.
    const loops = project.music.loop && music.duration - project.music.startAt < duration
    args.push(...(loops ? ['-stream_loop', '-1'] : []), '-ss', round(project.music.startAt), '-i', music.path)
    const at = index++
    const fadeOutAt = Math.max(0, duration - project.music.fadeOutSeconds)
    filters.push(
      `[${at}:a]atrim=0:${round(duration)},asetpts=PTS-STARTPTS,aresample=48000`
      + `,afade=t=in:st=0:d=${round(project.music.fadeInSeconds)}`
      + `,afade=t=out:st=${round(fadeOutAt)}:d=${round(project.music.fadeOutSeconds)}`
      + `,volume=${round(project.music.volume)}[mus]`,
      `[${audioLabel}][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amixed]`,
    )
    audioLabel = 'amixed'
  }

  if (project.fadeEdges) {
    filters.push(
      `[${videoLabel}]fade=t=in:st=0:d=0.5,fade=t=out:st=${round(Math.max(0, duration - 0.8))}:d=0.8[vout]`,
      `[${audioLabel}]afade=t=out:st=${round(Math.max(0, duration - 0.6))}:d=0.6[aout]`,
    )
    videoLabel = 'vout'
    audioLabel = 'aout'
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${videoLabel}]`,
    '-map', `[${audioLabel}]`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-r', String(project.output.fps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-movflags', '+faststart',
    // Belt and braces: a filter graph that runs a frame long must not add a
    // frame to a file whose length the caller has already been told.
    '-t', round(duration),
    '-progress', 'pipe:1',
    '-nostats',
    outputPath,
  )

  return { args, duration }
}
