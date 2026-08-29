import type { BreakInput, RallyState } from '../badminton/types'
import { describe, expect, it } from 'vitest'
import {
  bodyDuration,
  captionFor,
  clipsFromHighlights,
  emptyProject,
  fitMusicStart,
  layout,
  makeClip,
  parseProject,
  pieceAt,
  sourceTimeAt,
  timeline,
  totalDuration,
} from './project'

/** Only the fields the reel reads; the scoring engine fills the rest in life. */
function rally(idx: number, from: number, to: number, highlight = false): RallyState {
  return {
    idx,
    setNumber: 1,
    scoreBefore: [idx, 0],
    scoreAfter: [idx + 1, 0],
    servingSide: 1,
    servingSlot: 1,
    receivingSlot: 3,
    serviceCourt: 'right',
    startsAtSeconds: from,
    endsAtSeconds: to,
    isSetPoint: false,
    isMatchPoint: false,
    endedSet: false,
    endedMatch: false,
    isLet: false,
    isHighlight: highlight,
    scoredByPlayerId: null,
  }
}

describe('clipsFromHighlights', () => {
  it('pads a highlight out to the serve before it and the beat after it', () => {
    const clips = clipsFromHighlights([rally(0, 0, 30), rally(1, 30, 40, true)], [], { lead: 2, tail: 1 })

    expect(clips).toHaveLength(1)
    expect(clips[0]!.from).toBe(28)
    expect(clips[0]!.to).toBe(41)
    expect(clips[0]!.score).toBe('2–0')
  })

  it('splits the gap between two neighbouring highlights rather than overlapping them', () => {
    const clips = clipsFromHighlights(
      [rally(0, 0, 10, true), rally(1, 10, 20), rally(2, 20, 30, true)],
      [],
      { lead: 20, tail: 20 },
    )

    expect(clips[0]!.to).toBe(15)
    expect(clips[1]!.from).toBe(15)
  })

  it('leaves the dead time out, because a break is not a highlight', () => {
    const breaks: BreakInput[] = [{ idx: 0, startsAtSeconds: 12, endsAtSeconds: 60 }]
    const clips = clipsFromHighlights(
      [rally(0, 0, 12, true), rally(1, 12, 70, true)],
      breaks,
      { lead: 0, tail: 0 },
    )

    expect(clips.map(c => [c.from, c.to])).toEqual([[0, 12], [60, 70]])
  })
})

describe('layout', () => {
  it('overlaps the clips by the transition, and a cut does not', () => {
    const clips = [makeClip(0, 10), makeClip(50, 60)]
    const crossfaded = { ...emptyProject(), clips, transition: 'crossfade' as const, transitionSeconds: 1 }

    expect(layout(crossfaded).map(s => s.startsAt)).toEqual([0, 9])
    expect(bodyDuration(crossfaded)).toBe(19)
    expect(bodyDuration({ ...crossfaded, transition: 'cut' })).toBe(20)
  })

  it('skips a clip that is switched off without deleting it', () => {
    const project = {
      ...emptyProject(),
      transition: 'cut' as const,
      clips: [makeClip(0, 10), makeClip(50, 60, { enabled: false })],
    }

    expect(bodyDuration(project)).toBe(10)
    expect(project.clips).toHaveLength(2)
  })

  it('adds the bookends the server measured, joined like any other clip', () => {
    const project = {
      ...emptyProject(),
      clips: [makeClip(0, 10)],
      transition: 'crossfade' as const,
      transitionSeconds: 0.5,
    }

    expect(totalDuration(project, { intro: 4, outro: 6 })).toBe(19)
    expect(totalDuration({ ...project, intro: false }, { intro: 4, outro: 6 })).toBe(15.5)
  })

  it('is zero-length with nothing switched on, bookends or not', () => {
    expect(totalDuration({ ...emptyProject(), clips: [] }, { intro: 4 })).toBe(0)
  })
})

describe('fitMusicStart', () => {
  it('lands on the loudest window the song can offer', () => {
    // Quiet, then a chorus twenty seconds in, then quiet again.
    const peaks = Array.from({ length: 200 }, (_, i) => (i >= 80 && i < 120 ? 0.9 : 0.1))

    expect(fitMusicStart(peaks, 0.25, 10, 50)).toBeCloseTo(20, 1)
  })

  it('never starts so late that the song runs out under the reel', () => {
    const peaks = Array.from({ length: 200 }, (_, i) => (i > 180 ? 1 : 0.1))

    expect(fitMusicStart(peaks, 0.25, 30, 50)).toBeLessThanOrEqual(20)
  })

  it('opens past the intro when there is nothing to measure', () => {
    expect(fitMusicStart([], 0.25, 30, 200)).toBe(40)
  })
})

describe('captions and files', () => {
  it('names a clip after the board, unless it was renamed', () => {
    expect(captionFor(makeClip(0, 5, { setNumber: 2, score: '14–12' }))).toBe('Set 2 · 14–12')
    expect(captionFor(makeClip(0, 5, { setNumber: 2, label: 'Around the head' }))).toBe('Around the head')
  })

  it('reads a project back with the fields a newer version added', () => {
    const saved = JSON.stringify({ version: 1, name: 'Tuesday', clips: [{ from: 1, to: 4 }] })
    const project = parseProject(saved)

    expect(project.name).toBe('Tuesday')
    expect(project.clips[0]!.speed).toBe(1)
    expect(project.output.height).toBe(1080)
  })
})

/**
 * The preview drags one player along this list, so these three functions are
 * what decide which file is on screen and where its playhead should be. They
 * are tested rather than the composable around them: the composable is a
 * `requestAnimationFrame` and two element calls, and everything that can be
 * wrong about a reel's timing is here.
 */
describe('timeline', () => {
  const project = {
    ...emptyProject(),
    transition: 'crossfade' as const,
    transitionSeconds: 0.5,
    clips: [makeClip(100, 110), makeClip(200, 204, { speed: 0.5 })],
  }

  it('places the bookends around the clips, overlapping each join', () => {
    const pieces = timeline(project, { intro: 3, outro: 2 })

    expect(pieces.map(p => [p.kind, p.startsAt, p.outSeconds])).toEqual([
      ['intro', 0, 3],
      ['clip', 2.5, 10],
      // Slow motion: four seconds of match, eight seconds of film.
      ['clip', 12, 8],
      ['outro', 19.5, 2],
    ])
  })

  it('leaves a bookend out when the host has not got one', () => {
    expect(timeline(project, {}).map(p => p.kind)).toEqual(['clip', 'clip'])
  })

  it('hands back the piece on screen, and nothing past the end', () => {
    const pieces = timeline(project, { intro: 3, outro: 2 })

    expect(pieceAt(pieces, 1)?.kind).toBe('intro')
    // On a join the incoming piece wins: it is the one that keeps playing.
    expect(pieceAt(pieces, 2.6)?.clip?.from).toBe(100)
    expect(pieceAt(pieces, 15)?.clip?.from).toBe(200)
    expect(pieceAt(pieces, 21)?.kind).toBe('outro')
    expect(pieceAt(pieces, 40)).toBeNull()
  })

  it('maps film time back to where the source file has to be', () => {
    const pieces = timeline(project, { intro: 3, outro: 2 })
    const [, first, slow] = pieces

    // Two seconds into the clip is two seconds past its own in-point.
    expect(sourceTimeAt(first!, 4.5)).toBe(102)
    // Half speed: four seconds of film is two seconds of match.
    expect(sourceTimeAt(slow!, 16)).toBe(202)
  })
})
