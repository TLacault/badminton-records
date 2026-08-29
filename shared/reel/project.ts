import type { BreakInput, RallyState } from '../badminton/types'
import type { GradeId, ReelClip, ReelProject, RenderSegment, TransitionId } from './types'
import { highlightSpans } from '../badminton/playback'

/**
 * Everything a reel knows how to do to itself before a pixel is drawn: how
 * long it will be, where the clips land, which slice of the song to take.
 *
 * Pure on purpose. The renderer runs on the server, the preview runs in the
 * browser, and both have to agree to the frame about what the edit *is* —
 * which they only can if neither of them is the one deciding.
 */

/** Room before a rally starts, so a clip opens on the serve and not mid-flight. */
export const DEFAULT_LEAD_SECONDS = 1.6
/** Room after the point lands, for the celebration and the shuttle settling. */
export const DEFAULT_TAIL_SECONDS = 1.4

/** Shortest clip worth keeping. Below this a cut reads as a glitch. */
export const MIN_CLIP_SECONDS = 0.4

export const GRADES: GradeId[] = ['none', 'punch', 'mono', 'warm', 'cool', 'faded']
export const TRANSITIONS: TransitionId[] = ['cut', 'crossfade', 'fadeblack', 'flash']

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

let seq = 0
/** Ids only have to be unique inside one project, and to survive a save. */
export function clipId(): string {
  seq += 1
  return `c${Date.now().toString(36)}${seq.toString(36)}`
}

export function emptyProject(): ReelProject {
  return {
    version: 1,
    name: 'Untitled reel',
    matchId: null,
    videoId: null,
    matchTitle: '',
    clips: [],
    music: {
      kind: 'none',
      url: '',
      videoId: null,
      title: '',
      startAt: 0,
      duration: 0,
      volume: 0.85,
      fadeInSeconds: 1.2,
      fadeOutSeconds: 2,
      autoFit: true,
    },
    transition: 'crossfade',
    transitionSeconds: 0.4,
    intro: true,
    outro: true,
    fadeEdges: true,
    output: { height: 1080, fps: 30, matchAudio: 0.35 },
    captions: true,
  }
}

export function makeClip(from: number, to: number, extra: Partial<ReelClip> = {}): ReelClip {
  return {
    id: clipId(),
    from: Math.max(0, from),
    to: Math.max(from + MIN_CLIP_SECONDS, to),
    enabled: true,
    speed: 1,
    zoom: 1,
    grade: 'none',
    showLabel: true,
    label: '',
    rallyIdx: null,
    score: null,
    setNumber: null,
    ...extra,
  }
}

/**
 * The clips a match offers up on its own: one per highlighted passage, padded
 * out to the serve before it and the beat after it.
 *
 * `highlightSpans` has already merged neighbouring highlights and cut the
 * breaks out, so what arrives here is play and nothing else. The padding is
 * then clamped against the neighbouring spans — two highlights a second apart
 * must not grow into each other and show the same rally twice.
 */
export function clipsFromHighlights(
  states: readonly RallyState[],
  breaks: readonly BreakInput[] = [],
  options: { lead?: number, tail?: number, duration?: number } = {},
): ReelClip[] {
  const lead = options.lead ?? DEFAULT_LEAD_SECONDS
  const tail = options.tail ?? DEFAULT_TAIL_SECONDS
  const spans = highlightSpans(states, breaks)

  return spans.map((span, i) => {
    const previous = spans[i - 1]
    const next = spans[i + 1]
    const ceiling = options.duration && options.duration > 0 ? options.duration : Infinity
    // The gap between two passages is split down the middle rather than given
    // to whichever clip asks first: padding both from the same boundary is what
    // stops one clip's tail and the next one's lead showing the same rally.
    const floor = previous ? (previous.to + span.from) / 2 : 0
    const ceilingHere = next ? Math.min(ceiling, (span.to + next.from) / 2) : ceiling
    const from = Math.max(floor, span.from - lead)
    const to = Math.min(ceilingHere, span.to + tail)

    // The rally the passage ends on is the one whose score belongs on screen:
    // a caption is read at the end of a point, not at the start of it.
    const rally = [...states].reverse().find(s => s.startsAtSeconds < span.to && s.isHighlight)

    return makeClip(from, to, {
      rallyIdx: rally?.idx ?? null,
      score: rally ? `${rally.scoreAfter[0]}–${rally.scoreAfter[1]}` : null,
      setNumber: rally?.setNumber ?? null,
    })
  })
}

/** A single rally as a clip, for building a reel by hand off the point list. */
export function clipFromRally(
  rally: RallyState,
  options: { lead?: number, tail?: number, duration?: number } = {},
): ReelClip {
  const lead = options.lead ?? DEFAULT_LEAD_SECONDS
  const tail = options.tail ?? DEFAULT_TAIL_SECONDS
  const ceiling = options.duration && options.duration > 0 ? options.duration : Infinity
  return makeClip(
    Math.max(0, rally.startsAtSeconds - lead),
    Math.min(ceiling, rally.endsAtSeconds + tail),
    {
      rallyIdx: rally.idx,
      score: `${rally.scoreAfter[0]}–${rally.scoreAfter[1]}`,
      setNumber: rally.setNumber,
    },
  )
}

/** How long a clip runs on screen. Slow motion makes a 4s rally last 8. */
export function outSeconds(clip: ReelClip): number {
  return Math.max(0, (clip.to - clip.from) / (clip.speed || 1))
}

export function activeClips(project: ReelProject): ReelClip[] {
  return project.clips.filter(c => c.enabled && c.to > c.from)
}

/**
 * Where every clip lands in the finished film.
 *
 * A transition that is not a cut overlaps its two clips, so each join gives
 * back `transitionSeconds` — which is why the reel is shorter than the sum of
 * its parts, and why the preview cannot just add the clips up.
 */
export function layout(project: ReelProject): RenderSegment[] {
  const clips = activeClips(project)
  const overlap = project.transition === 'cut' ? 0 : project.transitionSeconds
  const out: RenderSegment[] = []
  let cursor = 0

  for (const clip of clips) {
    const seconds = outSeconds(clip)
    out.push({ clip, outSeconds: seconds, startsAt: cursor })
    cursor += seconds - overlap
  }

  return out
}

/** The body of the reel — the clips, without intro or outro. */
export function bodyDuration(project: ReelProject): number {
  const segments = layout(project)
  const last = segments.at(-1)
  if (!last) return 0
  return last.startsAt + last.outSeconds
}

/**
 * The whole film, bookends included.
 *
 * The bookend lengths are measured from the actual mp4s by the server, so they
 * are passed in rather than assumed: a project that has never spoken to a
 * server still lays its clips out correctly, it just does not know yet how long
 * the intro runs.
 */
export function totalDuration(
  project: ReelProject,
  bookends: { intro?: number, outro?: number } = {},
): number {
  const overlap = project.transition === 'cut' ? 0 : project.transitionSeconds
  const body = bodyDuration(project)
  if (!body) return 0

  let total = body
  if (project.intro && bookends.intro) total += bookends.intro - overlap
  if (project.outro && bookends.outro) total += bookends.outro - overlap
  return Math.max(0, total)
}

/** A piece of the finished film: a clip, or one of the two bookends. */
export interface TimelinePiece {
  id: string
  kind: 'intro' | 'clip' | 'outro'
  /** Null for a bookend, which has no trim, no speed and no grade. */
  clip: ReelClip | null
  /** Seconds into whichever file this piece plays from. */
  from: number
  to: number
  speed: number
  startsAt: number
  outSeconds: number
}

/**
 * The whole film, bookends included, as the preview plays it.
 *
 * The same joins as the renderer: a piece is on screen from its own `startsAt`
 * until the next one's, which is how a preview of a crossfaded reel comes out
 * the same length as the export rather than a second longer per join.
 */
export function timeline(
  project: ReelProject,
  bookends: { intro?: number, outro?: number } = {},
): TimelinePiece[] {
  const overlap = project.transition === 'cut' ? 0 : project.transitionSeconds
  const pieces: Omit<TimelinePiece, 'startsAt'>[] = []

  if (project.intro && bookends.intro) {
    pieces.push({ id: 'intro', kind: 'intro', clip: null, from: 0, to: bookends.intro, speed: 1, outSeconds: bookends.intro })
  }
  for (const clip of activeClips(project)) {
    pieces.push({
      id: clip.id,
      kind: 'clip',
      clip,
      from: clip.from,
      to: clip.to,
      speed: clip.speed,
      outSeconds: outSeconds(clip),
    })
  }
  if (project.outro && bookends.outro) {
    pieces.push({ id: 'outro', kind: 'outro', clip: null, from: 0, to: bookends.outro, speed: 1, outSeconds: bookends.outro })
  }

  let cursor = 0
  return pieces.map((piece) => {
    const placed = { ...piece, startsAt: cursor }
    cursor += piece.outSeconds - overlap
    return placed
  })
}

/** The piece on screen at `t`, or null past the end. */
export function pieceAt(pieces: readonly TimelinePiece[], t: number): TimelinePiece | null {
  let current: TimelinePiece | null = null
  for (const piece of pieces) {
    if (piece.startsAt > t) break
    current = piece
  }
  if (!current) return null
  const last = pieces.at(-1)!
  return t <= last.startsAt + last.outSeconds ? current : null
}

/** Where in the source file `t` lands, for the piece playing there. */
export function sourceTimeAt(piece: TimelinePiece, t: number): number {
  return piece.from + Math.max(0, t - piece.startsAt) * piece.speed
}

/** `Set 2 · 14–12`, or whatever the clip was renamed to. */
export function captionFor(clip: ReelClip): string {
  if (clip.label.trim()) return clip.label.trim()
  const parts: string[] = []
  if (clip.setNumber) parts.push(`Set ${clip.setNumber}`)
  if (clip.score) parts.push(clip.score)
  return parts.join(' · ')
}

/**
 * Where to start the song so its best `need` seconds land on the reel.
 *
 * `peaks` is a loudness envelope — one RMS reading per `interval` seconds,
 * measured server-side when the track was fetched. The window with the most
 * energy in it is the chorus, near enough; the small bonus for a loud opening
 * biases the choice towards a window that *starts* on the drop rather than one
 * that arrives at it eight bars later.
 *
 * With no envelope there is nothing to be clever with, so it opens the track a
 * fifth of the way in — past the intro of most songs, which is the one thing
 * we can say without listening.
 */
export function fitMusicStart(
  peaks: readonly number[],
  interval: number,
  need: number,
  songDuration: number,
): number {
  const latest = Math.max(0, songDuration - need)
  if (!peaks.length || interval <= 0 || need <= 0) {
    return Math.min(latest, songDuration * 0.2)
  }

  const width = Math.max(1, Math.round(need / interval))
  if (width >= peaks.length) return 0

  // Prefix sums: the window slides over a long track a few thousand times and
  // there is no reason for that to be quadratic.
  const sums: number[] = [0]
  for (let i = 0; i < peaks.length; i++) sums.push(sums[i]! + (peaks[i] ?? 0))

  const onsetWidth = Math.max(1, Math.round(width * 0.12))
  let best = 0
  let bestScore = -Infinity

  for (let start = 0; start + width <= peaks.length; start++) {
    const at = start * interval
    if (at > latest) break
    const body = (sums[start + width]! - sums[start]!) / width
    const onset = (sums[start + onsetWidth]! - sums[start]!) / onsetWidth
    const score = body + onset * 0.35
    if (score > bestScore) {
      bestScore = score
      best = at
    }
  }

  return Math.min(latest, best)
}

/** Reads a `.reel` file back, filling in anything a older version lacked. */
export function parseProject(raw: string): ReelProject {
  const parsed = JSON.parse(raw) as Partial<ReelProject>
  const base = emptyProject()
  return {
    ...base,
    ...parsed,
    version: 1,
    music: { ...base.music, ...(parsed.music ?? {}) },
    output: { ...base.output, ...(parsed.output ?? {}) },
    clips: (parsed.clips ?? []).map(clip => makeClip(clip.from ?? 0, clip.to ?? 0, {
      ...clip,
      // Regenerated rather than trusted: two projects merged by hand must not
      // end up with two clips answering to the same id.
      id: clipId(),
    })),
  }
}

/** The name the file is offered under. `Tim & Adrien vs Thomas — reel.reel`. */
export function projectFileName(project: ReelProject, extension: string): string {
  const stem = (project.name || project.matchTitle || 'reel')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'reel'
  return `${stem}.${extension}`
}

/** The only shape a YouTube id takes. */
const VIDEO_ID = /^[\w-]{11}$/

/**
 * The video id out of anything a person might paste — a watch URL, a share
 * link, an embed, or the id itself.
 *
 * Shared with the server, which validates against exactly this before any id
 * reaches a command line: two parsers would eventually disagree, and the one
 * that mattered would be the lenient one.
 */
export function parseVideoIdLoose(input: string): string | null {
  const raw = input.trim()
  if (VIDEO_ID.test(raw)) return raw
  try {
    const url = new URL(raw)
    const fromQuery = url.searchParams.get('v')
    if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery
    const last = url.pathname.split('/').filter(Boolean).pop()
    if (last && VIDEO_ID.test(last)) return last
  }
  catch {
    // Not a URL at all — a bare id was handled above.
  }
  return null
}
