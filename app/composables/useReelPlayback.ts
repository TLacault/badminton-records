import type { TimelinePiece } from '~~/shared/reel'
import { pieceAt, sourceTimeAt } from '~~/shared/reel'

/** Which file the stage currently has loaded. */
export type PieceMedia = 'source' | 'intro' | 'outro'

/**
 * The stage, as the engine is allowed to touch it. A `<video>` element and a
 * YouTube iframe implement this differently and the engine never learns which
 * it has — which is the only reason previewing a reel against the embed is the
 * same code as previewing it against a downloaded file.
 */
export interface ReelControls {
  ready: () => boolean
  /** Seconds into the loaded media, read synchronously. */
  time: () => number
  media: () => PieceMedia
  load: (media: PieceMedia, seconds: number) => void
  seek: (seconds: number) => void
  play: () => void
  pause: () => void
  rate: (value: number) => void
}

/**
 * Plays an edit list.
 *
 * The reel is never a file until it is exported, so playing it means driving
 * one player along a list of spans and jumping it at every boundary. Position
 * is derived from the player rather than counted here — a frame that took
 * 40ms to decode has genuinely moved the video 40ms, and a clock of our own
 * would drift away from the picture within a few clips.
 *
 * Transitions are honoured in *time* but only sketched in *picture*: a clip is
 * taken off screen when the next one is due, so the preview runs exactly as
 * long as the export, and the join is drawn as a dip rather than a real
 * crossfade, which one video element cannot do to itself.
 */
export function useReelPlayback(
  pieces: Ref<TimelinePiece[]>,
  controls: Ref<ReelControls | null>,
  options: {
    /** Seconds of overlap at each join, for the visual dip. */
    overlap: () => number
    onEnded?: () => void
  },
) {
  const playing = ref(false)
  const position = ref(0)
  /** Set while a jump is in flight, so the tick does not fight the seek. */
  const seeking = ref(false)
  let frame = 0

  const duration = computed(() => {
    const last = pieces.value.at(-1)
    return last ? last.startsAt + last.outSeconds : 0
  })

  const piece = computed(() => pieceAt(pieces.value, position.value))
  const index = computed(() => (piece.value ? pieces.value.indexOf(piece.value) : -1))

  /** Where the piece on screen gives way to the next one. */
  function endOf(at: number): number {
    const next = pieces.value[at + 1]
    const current = pieces.value[at]
    if (!current) return duration.value
    return next ? next.startsAt : current.startsAt + current.outSeconds
  }

  /**
   * How far into a join we are, 0 to 1. Drives the dip over the cut — and the
   * cut transition returns 0 throughout, because there is nothing to draw.
   */
  const joining = computed(() => {
    const overlap = options.overlap()
    if (!overlap || index.value < 0 || index.value >= pieces.value.length - 1) return 0
    const end = endOf(index.value)
    const into = position.value - (end - overlap)
    return into > 0 ? Math.min(1, into / overlap) : 0
  })

  function apply(target: TimelinePiece, at: number) {
    const control = controls.value
    if (!control) return
    const seconds = sourceTimeAt(target, at)
    if (control.media() !== (target.kind === 'clip' ? 'source' : target.kind)) {
      control.load(target.kind === 'clip' ? 'source' : target.kind, seconds)
    }
    else {
      control.seek(seconds)
    }
    control.rate(target.speed)
  }

  /** Moves the reel to `at`, taking the player with it. */
  function seek(at: number, { keepPlaying = true } = {}) {
    const clamped = Math.min(Math.max(0, at), Math.max(0, duration.value - 0.05))
    position.value = clamped
    const target = pieceAt(pieces.value, clamped) ?? pieces.value[0]
    if (!target) return
    seeking.value = true
    apply(target, clamped)
    // Two frames: the element reports the old time until the seek lands, and a
    // tick in between would read that as "the clip ended" and jump onwards.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      seeking.value = false
    }))
    if (playing.value && keepPlaying) controls.value?.play()
  }

  function tick() {
    frame = requestAnimationFrame(tick)
    const control = controls.value
    if (!playing.value || !control || seeking.value) return

    const at = index.value
    const current = pieces.value[at]
    if (!current) return

    const reelTime = current.startsAt + (control.time() - current.from) / current.speed
    const end = endOf(at)

    if (reelTime >= end - 0.02) {
      const next = pieces.value[at + 1]
      if (!next) {
        playing.value = false
        control.pause()
        position.value = duration.value
        options.onEnded?.()
        return
      }
      position.value = next.startsAt
      seeking.value = true
      apply(next, next.startsAt)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        seeking.value = false
      }))
      control.play()
      return
    }

    position.value = Math.max(current.startsAt, reelTime)
  }

  function play() {
    if (!pieces.value.length) return
    // Pressing play on a finished reel starts it again rather than doing
    // nothing, which is what every video player on earth does.
    if (position.value >= duration.value - 0.1) seek(0, { keepPlaying: false })
    playing.value = true
    const target = piece.value ?? pieces.value[0]
    if (target) apply(target, position.value)
    controls.value?.play()
  }

  function pause() {
    playing.value = false
    controls.value?.pause()
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  /** Straight to a clip, by index — the ribbon and the clip list both do this. */
  function goToPiece(at: number) {
    const target = pieces.value[Math.min(Math.max(0, at), pieces.value.length - 1)]
    if (target) seek(target.startsAt + 0.001)
  }

  function step(delta: 1 | -1) {
    // Back at the head of a clip means the previous one; a beat into it means
    // this one from the top, which is the behaviour a track skip has.
    if (delta === -1 && position.value - (piece.value?.startsAt ?? 0) > 1.2) {
      goToPiece(index.value)
      return
    }
    goToPiece(index.value + delta)
  }

  onMounted(() => {
    frame = requestAnimationFrame(tick)
  })
  onBeforeUnmount(() => cancelAnimationFrame(frame))

  // A clip retimed, removed or reordered under a paused playhead leaves the
  // position pointing at nothing. Clamping keeps the stage on a real frame.
  watch(duration, (next) => {
    if (position.value > next) seek(Math.max(0, next - 0.1), { keepPlaying: false })
  })

  return { playing, position, duration, piece, index, joining, play, pause, toggle, seek, goToPiece, step }
}
