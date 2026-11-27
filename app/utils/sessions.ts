/**
 * A training session is not a stored entity — it is every match filmed on the
 * same day. Three to six of them, one after the other, in the same hall. The
 * site groups by `played_on` rather than adding a table, because the date is
 * already the thing that makes them one evening.
 */
export interface SessionMatch {
  id: string
  title: string
  played_on: string | null
  venue: string | null
  format: string
  tagging_status: string
  youtube_thumbnail_url: string | null
  youtube_duration_seconds: number | null
}

/** The fields grouping needs, whatever shape the item around them has. */
export interface SessionFacts {
  played_on: string | null
  venue: string | null
  youtube_duration_seconds: number | null
  video_kind?: string
  source_match_id?: string | null
  event_name?: string | null
  match_types?: { slug?: string } | null
}

/**
 * A match that was played that day: the raw match video. Highlights and edits
 * are not matches, and the public match video (linked to its raw) would count
 * the same match twice.
 */
export function isPlayedMatch(facts: SessionFacts): boolean {
  return (facts.video_kind ?? 'match') === 'match' && !facts.source_match_id
}

const TOURNAMENT_SLUGS = new Set(['tournament', 'championship'])

/** Splits a session's videos: the match videos first, then the highlights and edits. */
export function splitKinds<T>(items: T[], read: (item: T) => SessionFacts = item => item as unknown as SessionFacts) {
  return {
    matches: items.filter(i => (read(i).video_kind ?? 'match') === 'match'),
    extras: items.filter(i => (read(i).video_kind ?? 'match') !== 'match'),
  }
}

export interface Session<T = SessionMatch> {
  /** `played_on`, or null for matches that were never dated. */
  date: string | null
  /** First non-empty venue among the day's matches. */
  venue: string | null
  matches: T[]
  /** Matches played (see isPlayedMatch) and their total length. */
  matchCount: number
  totalSeconds: number
  /** The event, when one of the day's matches is a tournament or championship. */
  eventName: string | null
}

/**
 * Groups matches into sessions, newest first. Input is assumed to be sorted by
 * `played_on` descending — that is how both public queries fetch it — so the
 * grouping is a single pass and undated rows fall to the end together.
 *
 * `read` exists because the lists now carry decorated entries rather than bare
 * rows; it defaults to the identity, so a plain array still groups directly.
 */
export function groupBySession<T>(
  matches: T[],
  read: (item: T) => SessionFacts = item => item as unknown as SessionFacts,
): Session<T>[] {
  const sessions: Session<T>[] = []

  for (const match of matches) {
    const facts = read(match)
    let session = sessions.at(-1)
    if (!session || session.date !== facts.played_on) {
      session = { date: facts.played_on, venue: null, matches: [], matchCount: 0, totalSeconds: 0, eventName: null }
      sessions.push(session)
    }
    session.matches.push(match)
    // The hall comes from a played match first: a highlights upload can carry another.
    if (facts.venue && (!session.venue || (isPlayedMatch(facts) && !session.matches.slice(0, -1).some(m => isPlayedMatch(read(m)))))) {
      session.venue = facts.venue
    }
    if (!session.eventName && TOURNAMENT_SLUGS.has(facts.match_types?.slug ?? '') && facts.event_name?.trim()) {
      session.eventName = facts.event_name.trim()
    }
    if (isPlayedMatch(facts)) {
      session.matchCount += 1
      session.totalSeconds += facts.youtube_duration_seconds ?? 0
    }
  }

  return sessions
}

/** `4520` → `1h 15m`. Session length, where seconds are noise. */
export function formatSpan(seconds: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
