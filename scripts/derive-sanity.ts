import type { MatchConfig, RallyInput, Side } from '../shared/badminton/types.ts'
import { deriveMatch } from '../shared/badminton/derive.ts'
import { DEFAULT_RULES } from '../shared/badminton/rules.ts'

/** Builds a rally log from a string like "AAZAZZ" (A = side 1, Z = side 2). */
function log(pattern: string): RallyInput[] {
  return [...pattern].map((c, i) => ({
    idx: i,
    winnerSide: (c === 'A' ? 1 : 2) as Side,
    isLet: false,
    isHighlight: false,
    scoredByPlayerId: null,
    endedAtSeconds: (i + 1) * 30,
  }))
}

const doublesConfig: MatchConfig = {
  format: 'doubles',
  rules: DEFAULT_RULES,
  initialServerSide: 1,
  side1RightCourtSlot: 1,
  side2RightCourtSlot: 3,
  gameStarts: [],
}

// Side 1 wins 21-0. The serving side never loses a rally, so under BWF rules
// the SAME player serves all 21 points, swapping courts each time.
const sweep = deriveMatch(doublesConfig, log('A'.repeat(21)))
console.log('--- doubles 21-0 sweep ---')
console.log('  game score      :', sweep.games[0]?.score, '     expect [ 21, 0 ]')
console.log('  match winner    :', sweep.matchWinnerSide, '           expect null (1 game of best-of-3)')
console.log('  serving slot    :', sweep.rallyStates.map(r => r.servingSlot).join(''))
console.log('                     expect 111111111111111111111 (same server throughout)')
console.log('  service court   :', sweep.rallyStates.map(r => r.serviceCourt[0]).join(''))
console.log('                     expect rlrlrlrlrlrlrlrlrlrlr (alternates every point)')

// Service passes on every rally, so nobody ever rotates. Each side simply
// alternates which partner serves according to its own score parity.
const alternating = deriveMatch(doublesConfig, log('AZ'.repeat(10)))
console.log('\n--- doubles alternating ---')
console.log('  serving slot    :', alternating.rallyStates.map(r => r.servingSlot).join(''))
console.log('                     expect 11423142314231423142')

// 29-29 then one more point reaches the 30-point cap and the game stops there.
const singlesConfig: MatchConfig = { ...doublesConfig, format: 'singles' }
const marathon = deriveMatch(singlesConfig, log('AZ'.repeat(29) + 'AA'))
console.log('\n--- singles marathon ---')
console.log('  games           :', marathon.games.map(g => g.score.join('-')).join(', '))
console.log('                     expect 30-29, 1-0')
console.log('  warnings        :', marathon.warnings.map(w => w.code).join(', ') || 'none')
console.log('                     expect final_game_incomplete')
