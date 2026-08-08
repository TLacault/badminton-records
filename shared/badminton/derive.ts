import type {
  Court,
  DerivedMatch,
  GameState,
  MatchConfig,
  RallyInput,
  RallyState,
  Side,
  Slot,
  Warning,
} from './types'
import {
  addPoint,
  gamesNeeded,
  isGameOver,
  otherSide,
  partnerSlot,
  scoreOf,
  sideOfSlot,
  singlesSlot,
  wouldEndGame,
} from './rules'

interface Positions {
  right: Slot
  left: Slot
}

function positionsFromRight(rightSlot: Slot): Positions {
  return { right: rightSlot, left: partnerSlot(rightSlot) }
}

/**
 * Derives the complete state of a match from its rally log.
 *
 * The single invariant behind doubles service rotation: the serving side's two
 * players swap courts when that side wins a rally; nobody else ever moves. The
 * server is then whichever of them stands in the court the score's parity
 * requires (even -> right, odd -> left).
 *
 * Never throws. Malformed input produces entries in `warnings`.
 */
export function deriveMatch(
  config: MatchConfig,
  rallies: RallyInput[],
): DerivedMatch {
  const warnings: Warning[] = []
  const rules = config.rules
  const needed = gamesNeeded(rules)
  const isDoubles = config.format === 'doubles'

  let servingSide: Side
  if (config.initialServerSide === 1 || config.initialServerSide === 2) {
    servingSide = config.initialServerSide
  }
  else {
    servingSide = 1
    warnings.push({
      code: 'missing_initial_server',
      message: 'No initial server recorded; assuming side 1 served first.',
    })
  }

  const baseline: Record<Side, Positions> = {
    1: positionsFromRight(config.side1RightCourtSlot ?? 1),
    2: positionsFromRight(config.side2RightCourtSlot ?? 3),
  }
  let positions: Record<Side, Positions> = {
    1: { ...baseline[1] },
    2: { ...baseline[2] },
  }

  const rallyStates: RallyState[] = []
  const games: GameState[] = []

  let gameNumber = 1
  let score: [number, number] = [0, 0]
  const gamesWon: [number, number] = [0, 0]
  let matchWinnerSide: Side | null = null
  let complete = false
  let firstRallyIdx: number | null = null
  let lastRallyIdx: number | null = null
  let warnedOverflow = false
  let prevEnd = 0

  const ordered = [...rallies].sort((a, b) => a.idx - b.idx)

  for (const rally of ordered) {
    const startsAtSeconds = prevEnd
    prevEnd = rally.endedAtSeconds

    const serviceCourt: Court = scoreOf(score, servingSide) % 2 === 0 ? 'right' : 'left'
    const receivingSide = otherSide(servingSide)
    const servingSlot: Slot = isDoubles
      ? positions[servingSide][serviceCourt]
      : singlesSlot(servingSide)
    const receivingSlot: Slot = isDoubles
      ? positions[receivingSide][serviceCourt]
      : singlesSlot(receivingSide)

    const scoreBefore: [number, number] = [score[0], score[1]]

    // Rallies logged after the match was already decided: record them frozen
    // rather than inventing a score, and warn once.
    if (complete) {
      if (!warnedOverflow) {
        warnings.push({
          code: 'rallies_after_match_complete',
          message: 'Rallies were logged after the match was already won.',
          rallyIdx: rally.idx,
        })
        warnedOverflow = true
      }
      rallyStates.push({
        idx: rally.idx,
        gameNumber,
        scoreBefore,
        scoreAfter: scoreBefore,
        servingSide,
        servingSlot,
        receivingSlot,
        serviceCourt,
        startsAtSeconds,
        endsAtSeconds: rally.endedAtSeconds,
        isGamePoint: false,
        isMatchPoint: false,
        endedGame: false,
        endedMatch: false,
        isLet: rally.isLet,
        isHighlight: rally.isHighlight,
        scoredByPlayerId: rally.scoredByPlayerId,
      })
      continue
    }

    const gp1 = wouldEndGame(scoreBefore, 1, rules)
    const gp2 = wouldEndGame(scoreBefore, 2, rules)
    const isMatchPoint
      = (gp1 && gamesWon[0] + 1 >= needed) || (gp2 && gamesWon[1] + 1 >= needed)

    if (firstRallyIdx === null) firstRallyIdx = rally.idx
    lastRallyIdx = rally.idx

    let endedGame = false
    let endedMatch = false

    if (!rally.isLet && rally.winnerSide) {
      const winner = rally.winnerSide
      score = addPoint(score, winner)

      // Only the serving side rotates, and only when it wins.
      if (isDoubles && winner === servingSide) {
        const p = positions[winner]
        positions[winner] = { right: p.left, left: p.right }
      }
      servingSide = winner

      if (isGameOver(score[0], score[1], rules)) {
        endedGame = true
        if (winner === 1) gamesWon[0] += 1
        else gamesWon[1] += 1

        games.push({
          number: gameNumber,
          score: [score[0], score[1]],
          winnerSide: winner,
          firstRallyIdx,
          lastRallyIdx,
          complete: true,
        })

        if (scoreOf(gamesWon, winner) >= needed) {
          endedMatch = true
          complete = true
          matchWinnerSide = winner
        }
      }
    }

    rallyStates.push({
      idx: rally.idx,
      gameNumber,
      scoreBefore,
      scoreAfter: [score[0], score[1]],
      servingSide,
      servingSlot,
      receivingSlot,
      serviceCourt,
      startsAtSeconds,
      endsAtSeconds: rally.endedAtSeconds,
      isGamePoint: gp1 || gp2,
      isMatchPoint,
      endedGame,
      endedMatch,
      isLet: rally.isLet,
      isHighlight: rally.isHighlight,
      scoredByPlayerId: rally.scoredByPlayerId,
    })

    // Open the next game.
    if (endedGame && !complete) {
      gameNumber += 1
      score = [0, 0]
      firstRallyIdx = null
      lastRallyIdx = null
      // servingSide already equals the previous game's winner, which is correct.

      if (isDoubles) {
        const override = config.gameStarts.find(g => g.gameNumber === gameNumber)
        if (override?.side1RightCourtSlot && override?.side2RightCourtSlot) {
          positions = {
            1: positionsFromRight(override.side1RightCourtSlot),
            2: positionsFromRight(override.side2RightCourtSlot),
          }
        }
        else {
          positions = { 1: { ...baseline[1] }, 2: { ...baseline[2] } }
          warnings.push({
            code: 'ambiguous_game_start',
            message:
              `Game ${gameNumber}: which partner serves first is a choice made on `
              + `the day and cannot be derived. Reusing game 1's arrangement.`,
            gameNumber,
          })
        }
        // At 0-0 the score is even, so the right-court player serves. Forcing
        // the chosen slot into the right court makes it serve first.
        if (override?.serverSlot) {
          const side = sideOfSlot(override.serverSlot)
          positions[side] = positionsFromRight(override.serverSlot)
        }
      }
    }
  }

  // A game still in progress at the end of the log.
  if (!complete && rallyStates.length > 0) {
    games.push({
      number: gameNumber,
      score: [score[0], score[1]],
      winnerSide: null,
      firstRallyIdx,
      lastRallyIdx,
      complete: false,
    })
    warnings.push({
      code: 'final_game_incomplete',
      message: `Game ${gameNumber} has no winner yet (${score[0]}-${score[1]}).`,
      gameNumber,
    })
  }

  return {
    rallyStates,
    games,
    gamesWon: [gamesWon[0], gamesWon[1]],
    matchWinnerSide,
    complete,
    warnings,
  }
}
