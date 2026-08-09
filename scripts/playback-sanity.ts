import type { MatchConfig, RallyInput, Side } from '../shared/badminton/types.ts'
import { deriveMatch } from '../shared/badminton/derive.ts'
import { insertPositionFor } from '../shared/badminton/log.ts'
import { playbackAt, rallyAtTime } from '../shared/badminton/playback.ts'
import { DEFAULT_RULES } from '../shared/badminton/rules.ts'
import { parseClock } from '../app/utils/format.ts'

/**
 * Eyeball check for the overlay's "what is true at time t" resolution
 * (not a test). Mirrors supabase/seed.sql exactly: game 1 alternates to 15-15
 * then side 1 runs out to 21-15; game 2 alternates to 18-18 then 21-18.
 *
 *   pnpm exec jiti scripts/playback-sanity.ts
 */
function seededLog(): RallyInput[] {
  const rallies: RallyInput[] = []
  let idx = 0
  let time = 20

  const push = (winner: Side, step: number) => {
    rallies.push({
      idx,
      winnerSide: winner,
      isLet: false,
      isHighlight: false,
      scoredByPlayerId: null,
      endedAtSeconds: time,
    })
    idx++
    time += step
  }

  for (let i = 0; i < 15; i++) {
    push(1, 10)
    push(2, 10)
  }
  for (let i = 0; i < 6; i++) push(1, 10)

  for (let i = 0; i < 18; i++) {
    push(1, 5)
    push(2, 5)
  }
  for (let i = 0; i < 3; i++) push(1, 5)

  return rallies
}

const config: MatchConfig = {
  format: 'doubles',
  rules: DEFAULT_RULES,
  initialServerSide: 1,
  side1RightCourtSlot: 1,
  side2RightCourtSlot: 3,
  gameStarts: [],
}

const rallies = seededLog()
const derived = deriveMatch(config, rallies)

console.log('--- seeded match shape ---')
console.log('  rallies         :', rallies.length, '            expect 75')
console.log('  game 1          :', derived.games[0]?.score, '   expect [ 21, 15 ]')
console.log('  game 2          :', derived.games[1]?.score, '   expect [ 21, 18 ]')
console.log('  games won       :', derived.gamesWon, '    expect [ 2, 0 ]')
console.log('  complete        :', derived.complete, '          expect true')
console.log('  winner side     :', derived.matchWinnerSide, '             expect 1')
console.log('  last rally ends :', derived.rallyStates.at(-1)?.endsAtSeconds, '           expect 570')

// deriveMatch starts rally 0 at t=0, so t=0 is already inside the first rally
// rather than ahead of it — the board reads 0-0 because the point has not been
// awarded yet, not because no rally is selected.
const first = derived.rallyStates[0]!
console.log('\n--- at t=0 ---')
const t0 = playbackAt(derived, 0)
console.log('  t=0    score    :', t0.score, '     expect [ 0, 0 ]')
console.log('  t=0    rallyIdx :', t0.rally?.idx, '             expect 0 (rally 0 starts at 0)')
console.log('  t=0    server   :', t0.servingSlot, '             expect', first.servingSlot, '(opening server)')

const midFirst = (first.startsAtSeconds + first.endsAtSeconds) / 2
const t1 = playbackAt(derived, midFirst)
console.log('\n--- mid-rally shows the score BEFORE the point ---')
console.log('  t=' + midFirst.toFixed(0) + '   score    :', t1.score, '     expect [ 0, 0 ] (rally 0 in play)')
console.log('  t=' + midFirst.toFixed(0) + '   rallyIdx :', t1.rally?.idx, '             expect 0')

// Rally 29 ends game-1 scoring at 15-15; check a mid-game reading.
const r29 = derived.rallyStates[29]!
const t2 = playbackAt(derived, r29.startsAtSeconds + 1)
console.log('\n--- mid game 1 ---')
console.log('  rally 29 before :', t2.score, '   expect [ 15, 14 ]')
console.log('  game number     :', t2.gameNumber, '             expect 1')
console.log('  games won       :', t2.gamesWon, '     expect [ 0, 0 ]')

// First rally of game 2: the previous game is now on the board.
const g2First = derived.rallyStates.find(s => s.gameNumber === 2)!
const t3 = playbackAt(derived, g2First.startsAtSeconds + 1)
console.log('\n--- first rally of game 2 ---')
console.log('  rallyIdx        :', t3.rally?.idx, '            expect', g2First.idx)
console.log('  score           :', t3.score, '     expect [ 0, 0 ] (fresh game)')
console.log('  gamesWon        :', t3.gamesWon, '     expect [ 1, 0 ]')
console.log('  gameNumber      :', t3.gameNumber, '             expect 2')

// Past the final rally the board must show the finished score, not scoreBefore.
const t4 = playbackAt(derived, 900)
console.log('\n--- past the end of the match ---')
console.log('  score           :', t4.score, '   expect [ 21, 18 ] (final game)')
console.log('  gamesWon        :', t4.gamesWon, '     expect [ 2, 0 ]')

// Timeline snapping: a click anywhere inside a point seeks to its start.
const r5 = derived.rallyStates[5]!
const inside = r5.startsAtSeconds + (r5.endsAtSeconds - r5.startsAtSeconds) * 0.7
console.log('\n--- timeline click snaps to the point start ---')
console.log('  rally 5 spans   :', r5.startsAtSeconds, '->', r5.endsAtSeconds)
console.log('  click at        :', inside)
console.log('  snaps to        :', rallyAtTime(derived, inside)?.startsAtSeconds, '            expect', r5.startsAtSeconds)
console.log('  on exact start  :', rallyAtTime(derived, r5.startsAtSeconds)?.idx, '             expect 5 (half-open: start belongs to this rally)')
console.log('  on exact end    :', rallyAtTime(derived, r5.endsAtSeconds)?.idx, '             expect 6 (end belongs to the NEXT rally)')
console.log('  past last rally :', rallyAtTime(derived, 900), '          expect null (falls back to raw position)')

// ---------------------------------------------------------------------------
// Correcting a miscount: seek back to the missed point, press A/Z, and it must
// land where it happened rather than at the end of the log.
const shortLog: RallyInput[] = [1, 2, 1, 2].map((w, i) => ({
  idx: i,
  winnerSide: w as Side,
  isLet: false,
  isHighlight: false,
  scoredByPlayerId: null,
  endedAtSeconds: (i + 1) * 10, // ends at 10, 20, 30, 40
}))

console.log('\n--- where a new point slots in ---')
console.log('  ends at 35      :', insertPositionFor(shortLog, 35), '             expect 3 (between 30 and 40)')
console.log('  ends at 5       :', insertPositionFor(shortLog, 5), '             expect 0 (before everything)')
console.log('  ends at 99      :', insertPositionFor(shortLog, 99), '             expect 4 (append)')
console.log('  tie at 20       :', insertPositionFor(shortLog, 20), '             expect 2 (after the existing 20)')

// A point for side 1 was missed at 35s. Before: 2-2. After: 3-2, and the
// later rally must renumber rather than be overwritten.
const patched = [...shortLog]
patched.splice(insertPositionFor(shortLog, 35), 0, {
  idx: 0,
  winnerSide: 1,
  isLet: false,
  isHighlight: false,
  scoredByPlayerId: null,
  endedAtSeconds: 35,
})
patched.forEach((r, i) => { r.idx = i })
const fixed = deriveMatch(config, patched)
console.log('\n--- score after patching the miscount ---')
console.log('  rallies         :', patched.length, '             expect 5')
console.log('  ordered by time :', patched.map(r => r.endedAtSeconds).join(','), ' expect 10,20,30,35,40')
console.log('  score           :', fixed.games[0]?.score, '     expect [ 3, 2 ]')

// ---------------------------------------------------------------------------
// Hand-edited timecodes.
console.log('\n--- parsing a typed timecode ---')
for (const [input, expected] of [
  ['1:30', '90'], ['00:45', '45'], ['1:02:03', '3723'], ['90', '90'],
  ['', 'null'], ['abc', 'null'], ['1:2x', 'null'], ['-5', 'null'],
] as const) {
  console.log(`  ${JSON.stringify(input).padEnd(10)}->`, String(parseClock(input)).padEnd(6), 'expect', expected)
}

// Retiming a point to before an earlier one must re-sort, or the score after
// the edit is derived from the wrong sequence.
const retimed = shortLog.map(r => ({ ...r }))
retimed[3]!.endedAtSeconds = 15 // the 4th point (side 2) actually happened at 15s
retimed.sort((a, b) => a.endedAtSeconds - b.endedAtSeconds)
retimed.forEach((r, i) => { r.idx = i })
console.log('\n--- retiming a point reorders the log ---')
console.log('  times           :', retimed.map(r => r.endedAtSeconds).join(','), '  expect 10,15,20,30')
console.log('  winners         :', retimed.map(r => r.winnerSide).join(','), '    expect 1,2,2,1')
const after = deriveMatch(config, retimed)
console.log('  score           :', after.games[0]?.score, '     expect [ 2, 2 ] (same points, new order)')
console.log('  contiguous      :', after.rallyStates.every((s, i) =>
  i === 0 || s.startsAtSeconds === after.rallyStates[i - 1]!.endsAtSeconds), '          expect true')
