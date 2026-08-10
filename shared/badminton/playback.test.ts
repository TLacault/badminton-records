import type { MatchConfig, RallyInput } from './types'
import { describe, expect, it } from 'vitest'
import { deriveMatch } from './derive'
import { currentRallyAt } from './playback'

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
