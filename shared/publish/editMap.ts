/**
 * Where the raw recording's moments land in a video cut from it.
 *
 * Saved on the raw match at render time (`matches.edit_maps`), one list per
 * render: the YouTube version, the highlights (landscape clip), the edit
 * (portrait clip). A linked video reads its list and places the raw tags on
 * its own timeline: no tag is ever copied.
 */

export type EditKind = 'match' | 'highlights' | 'edit'

/** Source seconds [from, to] play from output second `at`, `speed` × faster. */
export interface EditPiece { from: number, to: number, at: number, speed: number }

export type EditMaps = Partial<Record<EditKind, EditPiece[]>>

/**
 * Raw time → edited time. A moment that was cut lands where the edit resumes
 * (the start of the next piece in source order, or the end of the film), so the
 * score jumps across a cut instead of running backwards.
 * ponytail: assumes pieces in source order (clips sorted by time); a reordered
 * clip still maps inside itself, only the collapse point of cut time drifts.
 */
export function mapToEdit(pieces: readonly EditPiece[], t: number): number {
  let next: EditPiece | null = null
  let end = 0
  for (const p of pieces) {
    if (t >= p.from && t <= p.to) return p.at + (t - p.from) / (p.speed || 1)
    if (p.from > t && (!next || p.from < next.from)) next = p
    end = Math.max(end, p.at + (p.to - p.from) / (p.speed || 1))
  }
  return next ? next.at : end
}

/** The YouTube render: the intro, then the kept spans end to end. */
export function youtubeEditMap(segments: readonly { from: number, to: number }[], introSeconds: number): EditPiece[] {
  let at = introSeconds
  return segments.map((s) => {
    const piece = { from: s.from, to: s.to, at, speed: 1 }
    at += s.to - s.from
    return piece
  })
}

/** A clip render: its clip pieces as the preview lays them out (bookends and joins included). */
export function clipEditMap(pieces: readonly { kind: string, from: number, to: number, speed: number, startsAt: number }[]): EditPiece[] {
  return pieces.filter(p => p.kind === 'clip').map(p => ({ from: p.from, to: p.to, at: p.startsAt, speed: p.speed || 1 }))
}
