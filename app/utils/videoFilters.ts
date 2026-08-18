import type { MatchOutcome, SummaryRow } from '~/utils/matchSummary'
import { deriveRow, matchTitle, outcomeOf, slotNames } from '~/utils/matchSummary'

/**
 * Searching, filtering and sorting a list of matches, shared by the public
 * video wall and the admin library so the two never disagree about what
 * "longest" means.
 *
 * Rows are decorated once — the scoring engine runs per match, which is not
 * something to redo on every keystroke — and the filters then work over the
 * decorated list.
 */

export interface ListRow extends SummaryRow {
  id: string
  played_on: string | null
  venue: string | null
  tagging_status: string
  youtube_duration_seconds: number | null
  youtube_thumbnail_url: string | null
  is_4k: boolean
  match_types?: { label: string } | null
}

export interface MatchEntry<T extends ListRow = ListRow> {
  row: T
  /** Generated from the roster, never the YouTube upload name. */
  title: string
  outcome: MatchOutcome | null
  rallyCount: number
  typeLabel: string | null
  /** Everything this match can be found by, lowercased once. */
  haystack: string
}

export type SortId = 'newest' | 'oldest' | 'longest' | 'shortest' | 'points'

export const SORTS: { id: SortId, label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'longest', label: 'Longest video' },
  { id: 'shortest', label: 'Shortest video' },
  { id: 'points', label: 'Most points' },
]

/** The card's vocabulary, in the order the work happens. See taggingStatus.ts. */
export const STATUSES = [
  { id: 'all', label: 'Any state' },
  { id: 'untagged', label: 'Raw' },
  { id: 'in_progress', label: 'Editing' },
  { id: 'tagged', label: 'Edited' },
]

export const RESULTS = [
  { id: 'all', label: 'Any result' },
  { id: 'won', label: 'Wins' },
  { id: 'lost', label: 'Losses' },
  { id: 'unfinished', label: 'Undecided' },
]

export const FORMATS = [
  { id: 'all', label: 'Any format' },
  { id: 'doubles', label: 'Doubles' },
  { id: 'singles', label: 'Singles' },
]

export interface VideoFilters {
  query: string
  sort: SortId
  status: string
  result: string
  format: string
  type: string
  /** Only matches carrying at least one highlighted rally. */
  highlightsOnly: boolean
}

export function emptyFilters(): VideoFilters {
  return {
    query: '',
    sort: 'newest',
    status: 'all',
    result: 'all',
    format: 'all',
    type: 'all',
    highlightsOnly: false,
  }
}

export function isFiltered(filters: VideoFilters): boolean {
  const blank = emptyFilters()
  return (Object.keys(blank) as (keyof VideoFilters)[])
    .some(key => key === 'query' ? filters.query.trim() !== '' : filters[key] !== blank[key])
}

/** Runs the scoring engine once per match and caches what the list needs. */
export function decorate<T extends ListRow>(rows: T[]): MatchEntry<T>[] {
  return rows.map((row) => {
    const derived = deriveRow(row)
    const names = Object.values(slotNames(row))
    const clubs = (row.match_players ?? []).map(p => p.players?.club).filter(Boolean)

    return {
      row,
      title: matchTitle(row),
      outcome: outcomeOf(derived),
      rallyCount: derived?.rallyStates.length ?? 0,
      typeLabel: row.match_types?.label ?? null,
      haystack: [
        row.title,
        row.venue,
        row.format,
        row.match_types?.label,
        ...names,
        ...clubs,
      ].filter(Boolean).join(' ').toLowerCase(),
    }
  })
}

/**
 * Every distinct player, club, type and venue in the list — what the search
 * box offers as you type. Sorted so the dropdown is scannable rather than in
 * whatever order the rows arrived.
 */
export function suggestionsFor(entries: MatchEntry[]): string[] {
  const out = new Set<string>()
  for (const entry of entries) {
    for (const name of Object.values(slotNames(entry.row))) out.add(name)
    for (const p of entry.row.match_players ?? []) {
      if (p.players?.club) out.add(p.players.club)
    }
    if (entry.row.venue) out.add(entry.row.venue)
    if (entry.typeLabel) out.add(entry.typeLabel)
  }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/** Every match type present, so the dropdown offers only what exists. */
export function typesIn(entries: MatchEntry[]): string[] {
  const out = new Set<string>()
  for (const entry of entries) {
    if (entry.typeLabel) out.add(entry.typeLabel)
  }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/**
 * All terms must match, so "tim tournament" narrows rather than widens. Each
 * term may land in any field — a name, a club, the venue, the type.
 */
export function applyFilters<T extends ListRow>(
  entries: MatchEntry<T>[],
  filters: VideoFilters,
): MatchEntry<T>[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  const rows = entries.filter((entry) => {
    if (filters.status !== 'all' && entry.row.tagging_status !== filters.status) return false
    if (filters.format !== 'all' && entry.row.format !== filters.format) return false
    if (filters.type !== 'all' && entry.typeLabel !== filters.type) return false
    // An untagged match has no result, so it answers to no result filter.
    if (filters.result !== 'all' && entry.outcome?.state !== filters.result) return false
    if (filters.highlightsOnly && !(entry.row.rallies ?? []).some(r => r.is_highlight)) return false
    if (!terms.length) return true
    return terms.every(term => entry.haystack.includes(term))
  })

  const byDate = (a: MatchEntry<T>, b: MatchEntry<T>) =>
    (a.row.played_on ?? '').localeCompare(b.row.played_on ?? '')

  switch (filters.sort) {
    case 'oldest':
      return rows.sort(byDate)
    case 'longest':
      return rows.sort((a, b) => (b.row.youtube_duration_seconds ?? 0) - (a.row.youtube_duration_seconds ?? 0))
    case 'shortest':
      return rows.sort((a, b) => (a.row.youtube_duration_seconds ?? 0) - (b.row.youtube_duration_seconds ?? 0))
    case 'points':
      return rows.sort((a, b) => b.rallyCount - a.rallyCount)
    default:
      return rows.sort((a, b) => byDate(b, a))
  }
}
