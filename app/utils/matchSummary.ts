import type { DerivedMatch, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import { deriveMatch } from '~~/shared/badminton'

/**
 * Turning a match row into the things a card or a header prints: who played,
 * what it was called, and how it ended.
 *
 * The stored `title` is a YouTube upload name — "JEUX LIBRE - THOMAS X BLUD #1
 * - WIN" — so it is never shown. The fixture is built from the roster instead,
 * which also means renaming a player fixes every page at once.
 */

export interface SummaryPlayer {
  first_name: string
  last_name: string
  club?: string | null
}

export interface SummaryRally {
  idx: number
  winner_side: number | null
  is_let: boolean
  is_highlight: boolean
  scored_by_player_id: string | null
  ended_at_seconds: number | string
}

export interface SummaryRow {
  title: string
  format: string
  best_of?: number
  points_to_win?: number
  win_by?: number
  points_cap?: number
  initial_server_side?: number | null
  side1_right_court_slot?: number | null
  side2_right_court_slot?: number | null
  match_players?: { slot: number, players: SummaryPlayer | null }[] | null
  rallies?: SummaryRally[] | null
  match_set_starts?: {
    set_number: number
    server_slot: number | null
    side1_right_court_slot: number | null
    side2_right_court_slot: number | null
  }[] | null
}

/**
 * Everything a match card needs, in one select. The rallies come along because
 * the card prints the result, and the result is derived — nothing about a
 * score is stored, so there is nothing shorter to ask for.
 */
export const LIST_SELECT = `
  id, title, played_on, venue, format, tagging_status,
  best_of, points_to_win, win_by, points_cap,
  initial_server_side, side1_right_court_slot, side2_right_court_slot,
  youtube_thumbnail_url, youtube_duration_seconds,
  match_types(label),
  match_players(slot, players(first_name, last_name, club)),
  match_set_starts(set_number, server_slot, side1_right_court_slot, side2_right_court_slot),
  rallies(idx, winner_side, is_let, is_highlight, scored_by_player_id, ended_at_seconds)
`

function bySlot(row: SummaryRow): Record<number, SummaryPlayer | null> {
  const out: Record<number, SummaryPlayer | null> = {}
  for (const entry of row.match_players ?? []) out[entry.slot] = entry.players
  return out
}

/** Full names per slot, for the scoreboard and the stats table. */
export function slotNames(row: SummaryRow): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [slot, player] of Object.entries(bySlot(row))) {
    if (player) out[Number(slot)] = `${player.first_name} ${player.last_name}`
  }
  return out
}

/**
 * Side labels. First names only: on a scoreboard "Tim & Adrien" is read at a
 * glance where "Tim Lacault & Adrien Chapour" is a paragraph.
 *
 * Falls back to Us / Opponents only when a side has no roster at all — never
 * for one missing partner, where the known name still says more.
 */
export function shortSideNames(row: SummaryRow): Record<Side, string> {
  const slots = bySlot(row)
  const side = (a: number, b: number, fallback: string) => {
    const names = [slots[a], slots[b]].filter(Boolean).map(p => p!.first_name)
    return names.length ? names.join(' & ') : fallback
  }
  return { 1: side(1, 2, 'Us'), 2: side(3, 4, 'Opponents') }
}

/** Full-name side labels, for headings where the surname belongs. */
export function longSideNames(row: SummaryRow): Record<Side, string> {
  const slots = bySlot(row)
  const side = (a: number, b: number, fallback: string) => {
    const names = [slots[a], slots[b]]
      .filter(Boolean)
      .map(p => `${p!.first_name} ${p!.last_name}`)
    return names.length ? names.join(' & ') : fallback
  }
  return { 1: side(1, 2, 'Us'), 2: side(3, 4, 'Opponents') }
}

/** `Tim & Adrien vs Thomas & Anthony`, or the stored title if nobody is set. */
export function matchTitle(row: SummaryRow, long = false): string {
  if (!row.match_players?.length) return row.title
  const names = long ? longSideNames(row) : shortSideNames(row)
  return `${names[1]} vs ${names[2]}`
}

/** Club per slot, for the acronym tags on the scoreboard. */
export function slotClubs(row: SummaryRow): Record<number, string | null> {
  const out: Record<number, string | null> = {}
  for (const [slot, player] of Object.entries(bySlot(row))) {
    out[Number(slot)] = player?.club ?? null
  }
  return out
}

/**
 * Runs the scoring engine over a row fetched with its rallies. Returns null
 * when nothing has been tagged, so callers can skip the result entirely rather
 * than print a 0–0 that means "unknown".
 */
export function deriveRow(row: SummaryRow): DerivedMatch | null {
  const rallies = row.rallies ?? []
  if (!rallies.length) return null

  const config: MatchConfig = {
    format: row.format as MatchFormat,
    rules: {
      bestOf: row.best_of ?? 3,
      pointsToWin: row.points_to_win ?? 15,
      winBy: row.win_by ?? 2,
      pointsCap: row.points_cap ?? 21,
    },
    initialServerSide: (row.initial_server_side ?? null) as Side | null,
    side1RightCourtSlot: (row.side1_right_court_slot ?? null) as Slot | null,
    side2RightCourtSlot: (row.side2_right_court_slot ?? null) as Slot | null,
    setStarts: (row.match_set_starts ?? []).map(s => ({
      setNumber: s.set_number,
      serverSlot: s.server_slot as Slot | null,
      side1RightCourtSlot: s.side1_right_court_slot as Slot | null,
      side2RightCourtSlot: s.side2_right_court_slot as Slot | null,
    })),
  }

  return deriveMatch(config, [...rallies]
    .sort((a, b) => a.idx - b.idx)
    .map(r => ({
      idx: r.idx,
      winnerSide: r.winner_side as Side | null,
      isLet: r.is_let,
      isHighlight: r.is_highlight,
      scoredByPlayerId: r.scored_by_player_id,
      endedAtSeconds: Number(r.ended_at_seconds),
    })))
}

export interface MatchOutcome {
  /** 'won' and 'lost' are always from our side — side 1. */
  state: 'won' | 'lost' | 'unfinished'
  label: string
  /** `['15–13', '14–12']`, in order. */
  setScores: string[]
}

export function outcomeOf(derived: DerivedMatch | null): MatchOutcome | null {
  if (!derived) return null
  const setScores = derived.sets.map(s => `${s.score[0]}–${s.score[1]}`)

  if (!derived.complete || !derived.matchWinnerSide) {
    return { state: 'unfinished', label: 'In progress', setScores }
  }
  const won = derived.matchWinnerSide === 1
  return {
    state: won ? 'won' : 'lost',
    label: won ? 'Win' : 'Loss',
    setScores,
  }
}
