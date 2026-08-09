export type Side = 1 | 2
export type Slot = 1 | 2 | 3 | 4
export type Court = 'right' | 'left'
export type MatchFormat = 'singles' | 'doubles'

export interface ScoringRules {
  bestOf: number
  pointsToWin: number
  winBy: number
  pointsCap: number
}

export interface GameStartOverride {
  gameNumber: number
  serverSlot: Slot | null
  side1RightCourtSlot: Slot | null
  side2RightCourtSlot: Slot | null
}

export interface MatchConfig {
  format: MatchFormat
  rules: ScoringRules
  initialServerSide: Side | null
  /** doubles only: which of slots 1|2 starts in the right service court */
  side1RightCourtSlot: Slot | null
  /** doubles only: which of slots 3|4 starts in the right service court */
  side2RightCourtSlot: Slot | null
  gameStarts: GameStartOverride[]
}

export interface RallyInput {
  idx: number
  winnerSide: Side | null
  isLet: boolean
  isHighlight: boolean
  scoredByPlayerId: string | null
  /** video time, in seconds, at which this point ENDED */
  endedAtSeconds: number
}

/**
 * Dead time — between games, or any stoppage. Not a scoring event, so it stays
 * out of the rally log and out of the derivation entirely.
 */
export interface BreakInput {
  idx: number
  startsAtSeconds: number
  /** null while the break is still open, waiting for its closing keypress. */
  endsAtSeconds: number | null
}

export type WarningCode =
  | 'missing_initial_server'
  | 'rallies_after_match_complete'
  | 'final_game_incomplete'
  | 'ambiguous_game_start'

export interface Warning {
  code: WarningCode
  message: string
  rallyIdx?: number
  gameNumber?: number
}

export interface RallyState {
  idx: number
  gameNumber: number
  scoreBefore: [number, number]
  scoreAfter: [number, number]
  servingSide: Side
  servingSlot: Slot
  receivingSlot: Slot
  serviceCourt: Court
  /** previous rally's end; points are contiguous */
  startsAtSeconds: number
  endsAtSeconds: number
  isGamePoint: boolean
  isMatchPoint: boolean
  endedGame: boolean
  endedMatch: boolean
  isLet: boolean
  isHighlight: boolean
  scoredByPlayerId: string | null
}

export interface GameState {
  number: number
  score: [number, number]
  winnerSide: Side | null
  firstRallyIdx: number | null
  lastRallyIdx: number | null
  complete: boolean
}

export interface DerivedMatch {
  rallyStates: RallyState[]
  games: GameState[]
  gamesWon: [number, number]
  matchWinnerSide: Side | null
  complete: boolean
  warnings: Warning[]
}
