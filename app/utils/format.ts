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
