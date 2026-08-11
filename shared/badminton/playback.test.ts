import type { BreakInput, MatchConfig, RallyInput } from './types'
import { describe, expect, it } from 'vitest'
import { deriveMatch } from './derive'
import { currentRallyAt, highlightSpans, resumeTimeAt } from './playback'

const CONFIG: MatchConfig = {
  format: 'doubles',
  rules: { bestOf: 3, pointsToWin: 5, winBy: 2, pointsCap: 7 },
  initialServerSide: 1,
  side1RightCourtSlot: 1,
  side2RightCourtSlot: 3,
  setStarts: [],
}

/** Three rallies ending at 10s, 20s and 30s, each starting where the last ended. */
const LOG: RallyInput[] = [10, 20, 30].map((endedAtSeconds, idx) => ({
  idx,
  winnerSide: 1,
  isLet: false,
  isHighlight: false,
  scoredByPlayerId: null,
  endedAtSeconds,
}))

describe('currentRallyAt', () => {
  const derived = deriveMatch(CONFIG, LOG)

  it('resolves a timestamp inside a rally to that rally', () => {
    expect(currentRallyAt(derived, 15)?.idx).toBe(1)
  })

  it('gives a boundary to the rally that is starting', () => {
    expect(currentRallyAt(derived, 20)?.idx).toBe(2)
  })

  // The tagging case: the key is pressed a beat after the point was logged,
  // and it has to reach that point rather than nothing at all.
  it('resolves past the end of the log to the last rally', () => {
    expect(currentRallyAt(derived, 900)?.idx).toBe(2)
  })

  it('has nothing to point at in an empty match', () => {
    expect(currentRallyAt(deriveMatch(CONFIG, []), 5)).toBeNull()
  })
})

/** Rallies ending at the given seconds; those in `highlights` are tagged. */
function log(ends: number[], highlights: number[] = []): RallyInput[] {
  return ends.map((endedAtSeconds, idx) => ({
    idx,
    winnerSide: 1,
    isLet: false,
    isHighlight: highlights.includes(idx),
    scoredByPlayerId: null,
    endedAtSeconds,
  }))
}

function breaksAt(...spans: [number, number | null][]): BreakInput[] {
  return spans.map(([startsAtSeconds, endsAtSeconds], idx) => ({
    idx,
    startsAtSeconds,
    endsAtSeconds,
  }))
}

describe('resumeTimeAt', () => {
  it('pushes a target inside a break to where play resumes', () => {
    expect(resumeTimeAt(breaksAt([20, 60]), 20)).toBe(60)
  })

  it('leaves a target in open play alone', () => {
    expect(resumeTimeAt(breaksAt([20, 60]), 15)).toBe(15)
  })

  // Two presses of the resume key with no rally between: the second break
  // starts where the first ended, so clearing one lands inside the next.
  it('walks past breaks that abut', () => {
    expect(resumeTimeAt(breaksAt([20, 30], [30, 50]), 25)).toBe(50)
  })

  it('has no resume point for an open break', () => {
    expect(resumeTimeAt(breaksAt([20, null]), 25)).toBe(25)
  })
})

describe('highlightSpans', () => {
  it('is empty when nothing is tagged', () => {
    expect(highlightSpans(deriveMatch(CONFIG, log([10, 20])).rallyStates)).toEqual([])
  })

  it('merges a run of adjacent highlights into one span', () => {
    const derived = deriveMatch(CONFIG, log([10, 20, 30], [0, 1]))
    expect(highlightSpans(derived.rallyStates)).toEqual([{ from: 0, to: 20 }])
  })

  it('starts an untagged rally a new span', () => {
    const derived = deriveMatch(CONFIG, log([10, 20, 30], [0, 2]))
    expect(highlightSpans(derived.rallyStates)).toEqual([
      { from: 0, to: 10 },
      { from: 20, to: 30 },
    ])
  })

  // The bug this was written for: a point tagged after a pause reaches back to
  // where the previous point ended, so its raw span swallows the whole break.
  it('trims the break sitting in front of a highlight', () => {
    const derived = deriveMatch(CONFIG, log([10, 20, 70], [2]))
    expect(highlightSpans(derived.rallyStates, breaksAt([20, 60]))).toEqual([
      { from: 60, to: 70 },
    ])
  })

  it('splits a run that a break interrupts', () => {
    const derived = deriveMatch(CONFIG, log([10, 20, 70], [1, 2]))
    expect(highlightSpans(derived.rallyStates, breaksAt([20, 60]))).toEqual([
      { from: 10, to: 20 },
      { from: 60, to: 70 },
    ])
  })
})
