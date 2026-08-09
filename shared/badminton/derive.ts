import type {
  Court,
  DerivedMatch,
  SetState,
  MatchConfig,
  RallyInput,
  RallyState,
  Side,
  Slot,
  Warning,
} from './types'
import {
  addPoint,
  setsNeeded,
  isSetOver,
  otherSide,
  partnerSlot,
  scoreOf,
  sideOfSlot,
  singlesSlot,
  wouldEndSet,
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
  const needed = setsNeeded(rules)
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
  const sets: SetState[] = []

  let setNumber = 1
  let score: [number, number] = [0, 0]
  const setsWon: [number, number] = [0, 0]
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

    // Captured before the rally is scored: `servingSide` below is reassigned to
    // the winner, and the state we record must describe who served THIS rally,
    // like `servingSlot` beside it does.
    const rallyServingSide = servingSide
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
        setNumber,
        scoreBefore,
        scoreAfter: scoreBefore,
        servingSide,
        servingSlot,
        receivingSlot,
        serviceCourt,
        startsAtSeconds,
        endsAtSeconds: rally.endedAtSeconds,
        isSetPoint: false,
        isMatchPoint: false,
        endedSet: false,
        endedMatch: false,
        isLet: rally.isLet,
        isHighlight: rally.isHighlight,
        scoredByPlayerId: rally.scoredByPlayerId,
      })
      continue
    }

    const gp1 = wouldEndSet(scoreBefore, 1, rules)
    const gp2 = wouldEndSet(scoreBefore, 2, rules)
    const isMatchPoint
      = (gp1 && setsWon[0] + 1 >= needed) || (gp2 && setsWon[1] + 1 >= needed)

    if (firstRallyIdx === null) firstRallyIdx = rally.idx
    lastRallyIdx = rally.idx

    let endedSet = false
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

      if (isSetOver(score[0], score[1], rules)) {
        endedSet = true
        if (winner === 1) setsWon[0] += 1
        else setsWon[1] += 1

        sets.push({
          number: setNumber,
          score: [score[0], score[1]],
          winnerSide: winner,
          firstRallyIdx,
          lastRallyIdx,
          complete: true,
        })

        if (scoreOf(setsWon, winner) >= needed) {
          endedMatch = true
          complete = true
          matchWinnerSide = winner
        }
      }
    }

    rallyStates.push({
      idx: rally.idx,
      setNumber,
      scoreBefore,
      scoreAfter: [score[0], score[1]],
      servingSide: rallyServingSide,
      servingSlot,
      receivingSlot,
      serviceCourt,
      startsAtSeconds,
      endsAtSeconds: rally.endedAtSeconds,
      isSetPoint: gp1 || gp2,
      isMatchPoint,
      endedSet,
      endedMatch,
      isLet: rally.isLet,
      isHighlight: rally.isHighlight,
      scoredByPlayerId: rally.scoredByPlayerId,
    })

    // Open the next set.
    if (endedSet && !complete) {
      setNumber += 1
      score = [0, 0]
      firstRallyIdx = null
      lastRallyIdx = null
      // servingSide already equals the previous set's winner, which is correct.

      if (isDoubles) {
        const override = config.setStarts.find(g => g.setNumber === setNumber)
        if (override?.side1RightCourtSlot && override?.side2RightCourtSlot) {
          positions = {
            1: positionsFromRight(override.side1RightCourtSlot),
            2: positionsFromRight(override.side2RightCourtSlot),
          }
        }
        else {
          positions = { 1: { ...baseline[1] }, 2: { ...baseline[2] } }
          warnings.push({
            code: 'ambiguous_set_start',
            message:
              `Set ${setNumber}: which partner serves first is a choice made on `
              + `the day and cannot be derived. Reusing set 1's arrangement.`,
            setNumber,
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

  // A set still in progress at the end of the log.
  if (!complete && rallyStates.length > 0) {
    sets.push({
      number: setNumber,
      score: [score[0], score[1]],
      winnerSide: null,
      firstRallyIdx,
      lastRallyIdx,
      complete: false,
    })
    warnings.push({
      code: 'final_set_incomplete',
      message: `Set ${setNumber} has no winner yet (${score[0]}-${score[1]}).`,
      setNumber,
    })
  }

  return {
    rallyStates,
    sets,
    setsWon: [setsWon[0], setsWon[1]],
    matchWinnerSide,
    complete,
    warnings,
  }
}
