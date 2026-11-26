import type { BreakInput, MatchConfig, RallyInput } from '../badminton'
import type { MatchInfo } from './types'
import { describe, expect, it } from 'vitest'
import { deriveMatch } from '../badminton'
import {
  boardChanges,
  buildEdit,
  chapterStamp,
  clipTitle,
  defaultDescription,
  defaultSettings,
  defaultThumbnailLines,
  defaultTitle,
  familyForType,
  INTRO_SECONDS,
  readSettings,
  toOutput,
  TRANSITION_SECONDS,
  validChapters,
} from '.'

/** Sets to 3 points, best of 3: short logs, real set ends. */
const CONFIG: MatchConfig = {
  format: 'doubles',
  rules: { bestOf: 3, pointsToWin: 3, winBy: 1, pointsCap: 3 },
  initialServerSide: 1,
  side1RightCourtSlot: 1,
  side2RightCourtSlot: 3,
  setStarts: [],
}

/** Side 1 wins 3-0, then side 2 wins 3-0, then side 1 wins 3-0; points 10 s apart. */
function rallies(gapAfterSet1 = 0): RallyInput[] {
  const winners = [1, 1, 1, 2, 2, 2, 1, 1, 1] as const
  let t = 0
  return winners.map((w, idx) => {
    t += 10
    if (idx === 3) t += gapAfterSet1
    return { idx, winnerSide: w, isLet: false, isHighlight: idx === 4, scoredByPlayerId: null, endedAtSeconds: t }
  })
}

const INFO: MatchInfo = {
  id: 'm1',
  format: 'doubles',
  category: 'men',
  typeSlug: 'tournament',
  eventName: 'Tournois des Vendanges',
  round: 'Quarts de finale',
  venue: 'Talence',
  playedOn: '2026-11-24',
  sides: [
    { first: ['Tim', 'Adrien'], full: ['Tim Lacault', 'Adrien Roux'], club: 'U.S. Talence', ranks: ['D7', 'P10'] },
    { first: ['Thomas', 'Anthony'], full: ['Thomas Martin', 'Anthony Leroy'], club: 'Union Saint-Bruno', ranks: [null, null] },
  ],
}

describe('toOutput', () => {
  const segs = [{ from: 0, to: 10 }, { from: 20, to: 30 }]
  it('maps kept time and collapses a cut onto its edge', () => {
    expect(toOutput(segs, 5)).toBe(5)
    expect(toOutput(segs, 15)).toBe(10)
    expect(toOutput(segs, 25)).toBe(15)
    expect(toOutput(segs, 99)).toBe(20)
  })
})

describe('buildEdit', () => {
  it('cuts a tagged break and puts a set sting on it', () => {
    // 60 s break after set 1 (which ends at 30 s).
    const derived = deriveMatch(CONFIG, rallies(60))
    const breaks: BreakInput[] = [{ idx: 0, startsAtSeconds: 32, endsAtSeconds: 88 }]
    const plan = buildEdit({ derived, breaks, sourceDuration: 160, settings: defaultSettings() })

    expect(plan.segments).toEqual([{ from: 0, to: 32 }, { from: 88, to: 160 }])
    expect(plan.bodyDuration).toBe(104)
    expect(plan.transitions[0]).toMatchObject({ kind: 'set', setNumber: 1, score: [3, 0], at: 32 - TRANSITION_SECONDS / 2 })
    // Set 2 ends at 120 with no break: an overlaid sting, no cut.
    expect(plan.transitions[1]).toMatchObject({ kind: 'set', setNumber: 2, score: [0, 3] })
    expect(plan.transitions).toHaveLength(2)
  })

  it('keeps a break the editor asked to keep', () => {
    const derived = deriveMatch(CONFIG, rallies(60))
    const breaks: BreakInput[] = [{ idx: 0, startsAtSeconds: 32, endsAtSeconds: 88 }]
    const plan = buildEdit({ derived, breaks, sourceDuration: 160, settings: { ...defaultSettings(), keepBreaks: [0] } })
    expect(plan.segments).toEqual([{ from: 0, to: 160 }])
  })

  it('never shows a point on the board before it is played, and ticks after it', () => {
    const derived = deriveMatch(CONFIG, rallies())
    const plan = buildEdit({ derived, breaks: [], sourceDuration: 100, settings: defaultSettings() })
    const at = (t: number) => plan.scores.find(s => t >= s.from && t < s.to)!.board.sets
    expect(at(5)).toEqual([[0, 0]])
    expect(at(10.1)).toEqual([[0, 0]]) // the point landed, the board waits a beat
    expect(at(10.5)).toEqual([[1, 0]])
    expect(at(35)).toEqual([[3, 0], [0, 0]]) // set 2 has started
    const last = plan.scores.at(-1)!
    expect(last.board.winner).toBe(1)
    expect(last.to).toBe(plan.bodyDuration)
  })

  it('shifts tag times by the source offset', () => {
    const derived = deriveMatch(CONFIG, rallies())
    const plan = buildEdit({ derived, breaks: [], sourceDuration: 120, settings: { ...defaultSettings(), sourceOffsetSeconds: 5 } })
    const at = (t: number) => plan.scores.find(s => t >= s.from && t < s.to)!.board.sets
    expect(at(12)).toEqual([[0, 0]])
    expect(at(15.5)).toEqual([[1, 0]])
  })

  it('reads the board across a clip: the score at its start, then each point a beat after it lands', () => {
    const derived = deriveMatch(CONFIG, rallies())
    // Points end at 10, 20, 30…: a clip 15 → 32 starts at 1-0 and sees 2-0 at 20.4, then the set at 30.4.
    const marks = boardChanges(derived, 15, 32)
    expect(marks.map(m => m.at)).toEqual([15, 20.4, 30.4])
    expect(marks[0]!.board.sets).toEqual([[1, 0]])
    expect(marks[1]!.board.sets).toEqual([[2, 0]])
  })

  it('trims, and drops stings that fall outside the trim', () => {
    const derived = deriveMatch(CONFIG, rallies())
    const plan = buildEdit({ derived, breaks: [], sourceDuration: 100, settings: { ...defaultSettings(), trimIn: 5, trimOut: 40 } })
    expect(plan.segments).toEqual([{ from: 5, to: 40 }])
    expect(plan.transitions.map(t => t.setNumber)).toEqual([1])
  })

  it('fills the outro with the starred rally, then the last points', () => {
    const derived = deriveMatch(CONFIG, rallies())
    const plan = buildEdit({ derived, breaks: [], sourceDuration: 100, settings: defaultSettings() })
    expect(plan.outroClips[0]).toEqual({ from: 40, to: 47.5 })
    expect(plan.outroSpeed).toBe(0.5)
  })

  it('writes chapters: one per set from 0:00, then the end', () => {
    const derived = deriveMatch(CONFIG, rallies(60))
    const breaks: BreakInput[] = [{ idx: 0, startsAtSeconds: 32, endsAtSeconds: 88 }]
    const plan = buildEdit({ derived, breaks, sourceDuration: 160, settings: defaultSettings() })
    expect(plan.chapters.map(c => c.title)).toEqual(['Set 1', 'Set 2', 'Set 3', 'Fin du match'])
    expect(plan.chapters[0]!.at).toBe(0)
    expect(plan.chapters[1]!.at).toBe(INTRO_SECONDS + 32)
    expect(plan.totalDuration).toBe(INTRO_SECONDS + 104 + 15)
  })

  it('reads partial saved settings', () => {
    const s = readSettings({ intro: false, thumbnail: { show: [false, true] } })
    expect(s.intro).toBe(false)
    expect(s.outro).toBe(true)
    expect(s.thumbnail.lines).toEqual([null, null])
    expect(s.thumbnail.show).toEqual([false, true])
  })
})

describe('text', () => {
  it('maps match types to families', () => {
    expect(familyForType('championship')).toBe('tournois')
    expect(familyForType('interclubs')).toBe('interclub')
    expect(familyForType('training')).toBe('jeux_libres')
    expect(familyForType(null)).toBe('jeux_libres')
  })

  it('writes the thumbnail lines of Tim\'s examples', () => {
    expect(defaultThumbnailLines(INFO, 'tournois')).toEqual(['TOURNOIS DES VENDANGES 2026', 'DOUBLES HOMMES • QUARTS DE FINALE'])
    expect(defaultThumbnailLines(INFO, 'interclub')).toEqual(['UNION SAINT-BRUNO', 'DOUBLES HOMMES'])
    expect(defaultThumbnailLines(INFO, 'jeux_libres')).toEqual(['DOUBLES HOMMES', 'TIM & ADRIEN  VS  THOMAS & ANTHONY'])
  })

  it('titles stay within 100 characters', () => {
    expect(defaultTitle(INFO, 'tournois')).toBe('Tournois des Vendanges 2026 | DH Quarts de finale')
    expect(defaultTitle({ ...INFO, eventName: null, round: 'Finale' }, 'tournois')).toBe('Tournois 2026 | DH Finale')
    expect(clipTitle(INFO, 'tournois')).toBe('Talence 2026 | DH Quarts de finale | Highlights')
    expect(clipTitle({ ...INFO, venue: null, round: null }, 'tournois')).toBe('Tournois des Vendanges 2026 | DH | Highlights')
    const long = { ...INFO, eventName: 'X'.repeat(90) }
    expect(defaultTitle(long, 'tournois').length).toBeLessThanOrEqual(100)
  })

  it('only publishes chapters YouTube accepts', () => {
    expect(validChapters([{ at: 0, title: 'a' }, { at: 20, title: 'b' }, { at: 40, title: 'c' }], 60)).toHaveLength(3)
    expect(validChapters([{ at: 0, title: 'a' }, { at: 5, title: 'b' }, { at: 40, title: 'c' }], 60)).toEqual([])
    expect(validChapters([{ at: 3, title: 'a' }, { at: 20, title: 'b' }, { at: 40, title: 'c' }], 60)).toEqual([])
    expect(chapterStamp(3725)).toBe('1:02:05')
    expect(chapterStamp(65)).toBe('01:05')
  })

  it('describes the match with score, chapters, players and link', () => {
    const d = defaultDescription(INFO, 'tournois', {
      setScores: [[21, 17], [19, 21]],
      winner: 0,
      chapters: [{ at: 0, title: 'Intro' }, { at: 6, title: 'Set 1' }, { at: 600, title: 'Set 2' }],
      total: 1200,
      matchUrl: 'https://example.test/matches/m1',
    })
    expect(d).toContain('Score : 21-17 / 19-21 · victoire Tim & Adrien')
    // "Intro" lasts 6 s, under YouTube's 10 s: no chapters at all rather than broken ones.
    expect(d).not.toContain('Chapitres')
    expect(d).toContain('• Tim Lacault (U.S. Talence) · D7')
    expect(d).toContain('https://example.test/matches/m1')
  })
})
