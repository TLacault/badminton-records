/** `3725` → `1:02:05`, `125` → `2:05`. Null for unknown durations. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * Parses a hand-typed timecode back to seconds. Accepts `mm:ss`, `h:mm:ss`, or
 * a bare number of seconds. Returns null for anything it cannot read, so the
 * caller can leave the existing value alone rather than write a NaN.
 */
export function parseClock(value: string): number | null {
  const text = value.trim()
  if (!text) return null

  const parts = text.split(':')
  if (parts.length > 3) return null

  let seconds = 0
  for (const part of parts) {
    // Reject "1:2x" rather than silently reading it as 1:2.
    if (!/^\d+(?:\.\d+)?$/.test(part.trim())) return null
    seconds = seconds * 60 + Number(part)
  }
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

/** Date only, in the user's locale. Falsy input becomes an em dash. */
export function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

/*
 * These strings are server-rendered, so the locale must be passed in rather
 * than left to `toLocaleDateString()`: with no argument it resolves to the
 * *server's* default and the browser then renders a different string on
 * hydration. The caller reads it from the language cookie, which travels with
 * the request, so both sides format the same date the same way.
 *
 * Cached per tag — constructing an Intl.DateTimeFormat is not cheap, and a
 * match list formats one date per row.
 */
const LONG = new Map<string, Intl.DateTimeFormat>()
const SHORT = new Map<string, Intl.DateTimeFormat>()

function formatter(cache: Map<string, Intl.DateTimeFormat>, tag: string, opts: Intl.DateTimeFormatOptions) {
  let f = cache.get(tag)
  if (!f) {
    f = new Intl.DateTimeFormat(tag, opts)
    cache.set(tag, f)
  }
  return f
}

/** `2026-08-09` → `Sun 9 Aug 2026`, or `dim. 9 août 2026`. */
export function formatDateLong(value: string | null, locale = 'en-GB', undated = 'Undated'): string {
  if (!value) return undated
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undated
  return formatter(LONG, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

/** `2026-08-09` → `9 Aug 2026`, or `9 août 2026`. */
export function formatDateShort(value: string | null, locale = 'en-GB', undated = 'Undated'): string {
  if (!value) return undated
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undated
  return formatter(SHORT, locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}
