/**
 * The Reel — a highlight compilation cut from a tagged match.
 *
 * Everything here is plain data with no browser or database in it, because a
 * project is written to disk as JSON, re-read a week later, sent to the server
 * to be rendered, and exercised in tests. Three consumers, one shape.
 */

/** Colour treatments. Named for what they look like, not for the filter. */
export type GradeId = 'none' | 'punch' | 'mono' | 'warm' | 'cool' | 'faded'

/** How one clip gives way to the next. */
export type TransitionId = 'cut' | 'crossfade' | 'fadeblack' | 'flash'

export interface ReelClip {
  id: string
  /** Seconds into the SOURCE video. Half-open [from, to), like a rally. */
  from: number
  to: number
  /** Unchecked clips stay in the project — dropping one is not deleting it. */
  enabled: boolean
  /** Playback rate. 0.5 is slow motion; the audio is stretched to match. */
  speed: number
  /** Punch-in. 1 is the frame as filmed, 1.4 is 40% closer. */
  zoom: number
  grade: GradeId
  /** Prints the caption over this clip. */
  showLabel: boolean
  /** Overrides the caption built from the match. Empty falls back to it. */
  label: string
  /** The rally this was cut from, or null for a stretch picked by hand. */
  rallyIdx: number | null
  /** Snapshot of what the board read, so a caption survives a re-tag. */
  score: string | null
  setNumber: number | null
}

export type MusicKind = 'none' | 'youtube' | 'file'

export interface ReelMusic {
  kind: MusicKind
  /** What the user pasted. Kept verbatim so the project can re-fetch it. */
  url: string
  /** The 11-character YouTube id, once parsed out of `url`. */
  videoId: string | null
  title: string
  /** Seconds into the song where the reel starts listening. */
  startAt: number
  /** Song length, as reported by the server. 0 until it has been fetched. */
  duration: number
  /** 0–1. The reel's own audio is ducked under this, not replaced by it. */
  volume: number
  fadeInSeconds: number
  fadeOutSeconds: number
  /** Re-fit `startAt` to the loudest window whenever the reel changes length. */
  autoFit: boolean
}

export interface ReelOutput {
  /** Height in pixels; the width follows 16:9. */
  height: 720 | 1080 | 1440
  fps: 30 | 60
  /** 0–1. The match's own sound — squeaks and shuttle — under the music. */
  matchAudio: number
}

export interface ReelProject {
  /** Bumped when a field changes meaning. Older files are migrated on open. */
  version: 1
  name: string
  matchId: string | null
  videoId: string | null
  /** The fixture, printed on the export panel and in the file name. */
  matchTitle: string
  clips: ReelClip[]
  music: ReelMusic
  transition: TransitionId
  /** Seconds of overlap or black between clips. Ignored by a hard cut. */
  transitionSeconds: number
  intro: boolean
  outro: boolean
  /** Opens on black and closes on black, however the clips are joined. */
  fadeEdges: boolean
  output: ReelOutput
  /** Caption defaults, applied to clips as they are added. */
  captions: boolean
}

/** A segment as the renderer sees it: source in/out plus its length on screen. */
export interface RenderSegment {
  clip: ReelClip
  /** Length in the finished film — the source span divided by the speed. */
  outSeconds: number
  /** Where it starts in the finished film, transitions accounted for. */
  startsAt: number
}

/**
 * What the host can do for a reel, as reported by `/api/reel/capabilities`.
 *
 * Lives here rather than beside the server code because the editor branches on
 * it constantly — a build that only ever sees this shape through `$fetch` has
 * no way to be told it got it wrong.
 */
export interface ReelCapabilities {
  /** yt-dlp and ffmpeg: the match video can be fetched for scrubbing. */
  download: boolean
  /** ffmpeg: an mp4 can be produced. */
  render: boolean
  intro: boolean
  outro: boolean
  /** Bookend lengths, measured with ffprobe. Null when the host has none. */
  introSeconds: number | null
  outroSeconds: number | null
  cacheDir: string
  cachedSources: string[]
  cachedBytes: number
}

/** A track as the server measured it: its loudness, a quarter-second at a time. */
export interface ReelTrack {
  videoId: string
  title: string
  duration: number
  /** Seconds between two readings in `peaks`. */
  interval: number
  peaks: number[]
}

export type JobState = 'running' | 'done' | 'error'

export interface ReelJob {
  id: string
  kind: 'source' | 'music' | 'render'
  state: JobState
  progress: number | null
  message: string
  error: string | null
  result: Record<string, unknown> | null
}
