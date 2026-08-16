import type { BreakInput, RallyInput } from './types'
import { describe, expect, it } from 'vitest'
import { clampBreak, clampBreaks } from './breaks'

function log(...ends: number[]): RallyInput[] {
  return ends.map((endedAtSeconds, idx) => ({
    idx,
    winnerSide: 1 as const,
    isLet: false,
    isHighlight: false,
    scoredByPlayerId: null,
    endedAtSeconds,
  }))
}

function brk(startsAtSeconds: number, endsAtSeconds: number | null, idx = 0): BreakInput {
  return { idx, startsAtSeconds, endsAtSeconds }
}

describe('clampBreak', () => {
  it('leaves a break that already sits inside one rally gap alone', () => {
    const rallies = log(210, 260)
    expect(clampBreak(rallies, brk(215, 240), 'end')).toEqual(brk(215, 240))
  })

  it('truncates the start when a point is inserted inside the break', () => {
    // Points at 3:30 and 4:20, break tagged 3:30->4:00, new point ends 3:44.
    const rallies = log(210, 224, 260)
    expect(clampBreak(rallies, brk(210, 240), 'end')).toEqual(brk(224, 240))
  })

  it('walks the start past every point inside the break, not just the first', () => {
    const rallies = log(210, 224, 232, 260)
    expect(clampBreak(rallies, brk(210, 240), 'end')).toEqual(brk(232, 240))
  })

  it('drops a break clamped down to less than a second', () => {
    const rallies = log(210, 239.5)
    expect(clampBreak(rallies, brk(210, 240), 'end')).toBeNull()
  })

  it('holds the start and pulls the end back when the end is the edge typed', () => {
    // End typed as 4:30, but a point ends at 4:20.
    const rallies = log(210, 260)
    expect(clampBreak(rallies, brk(230, 270), 'start')).toEqual(brk(230, 260))
  })

  it('holds the end and pushes the start forward when the start is not the edge typed', () => {
    const rallies = log(210, 260)
    expect(clampBreak(rallies, brk(200, 240), 'end')).toEqual(brk(210, 240))
  })

  it('ignores rally ends outside the break', () => {
    const rallies = log(100, 210, 400)
    expect(clampBreak(rallies, brk(215, 240), 'start')).toEqual(brk(215, 240))
  })

  it('moves an open break past any point recorded after its start', () => {
    const rallies = log(210, 224, 232)
    expect(clampBreak(rallies, brk(210, null), 'end')).toEqual(brk(232, null))
  })

  it('leaves an open break with no points after it alone', () => {
    const rallies = log(210)
    expect(clampBreak(rallies, brk(240, null), 'end')).toEqual(brk(240, null))
  })

  it('does not treat a rally ending exactly on an edge as a crossing', () => {
    const rallies = log(210, 240)
    expect(clampBreak(rallies, brk(210, 240), 'end')).toEqual(brk(210, 240))
  })
})

describe('clampBreaks', () => {
  it('repairs the break a point landed in and leaves the others', () => {
    const rallies = log(210, 224, 260, 400)
    const breaks = [brk(210, 240, 0), brk(260, 300, 1)]
    expect(clampBreaks(rallies, breaks)).toEqual([brk(224, 240, 0), brk(260, 300, 1)])
  })

  it('drops collapsed breaks rather than keeping slivers', () => {
    const rallies = log(210, 239.5, 260)
    const breaks = [brk(210, 240, 0), brk(260, 300, 1)]
    expect(clampBreaks(rallies, breaks)).toEqual([brk(260, 300, 1)])
  })

  it('is a no-op on a log with no breaks', () => {
    expect(clampBreaks(log(210, 260), [])).toEqual([])
  })
})
