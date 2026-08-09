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
}

export interface Session<T = SessionMatch> {
  /** `played_on`, or null for matches that were never dated. */
  date: string | null
  /** First non-empty venue among the day's matches. */
  venue: string | null
  matches: T[]
  totalSeconds: number
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
    const last = sessions.at(-1)
    if (last && last.date === facts.played_on) {
      last.matches.push(match)
      last.venue ??= facts.venue || null
      last.totalSeconds += facts.youtube_duration_seconds ?? 0
      continue
    }
    sessions.push({
      date: facts.played_on,
      venue: facts.venue || null,
      matches: [match],
      totalSeconds: facts.youtube_duration_seconds ?? 0,
    })
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
