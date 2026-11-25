import type { BreakInput, DerivedMatch, Side, Span } from '../badminton'
import type { BoardState, PublishSettings } from './types'
import type { Chapter } from './text'
import { highlightSpans, playbackAt, withoutBreaks } from '../badminton'

/** Lengths of the rendered pieces; the compositions in brand/video/ are built to these. */
export const INTRO_SECONDS = 6
export const OUTRO_SECONDS = 15
export const TRANSITION_SECONDS = 2
/** A point is seen landing before the board ticks. */
export const SCORE_DELAY_SECONDS = 0.4
/** A set end with no tagged break: the sting waits for the celebration. */
export const SET_STING_DELAY_SECONDS = 1.5

export interface Transition {
  /** Output seconds the sting starts (body time, before the intro). */
  at: number
  kind: 'set' | 'break'
  /** For 'set': the set that just ended and its score. */
  setNumber?: number
  score?: [number, number]
}

export interface ScoreSpan {
  from: number
  to: number
  board: BoardState
  /** Stable id of the board's content; equal boards share a picture. */
  key: string
}

export interface EditPlan {
  /** Source spans kept, in order. */
  segments: Span[]
  bodyDuration: number
  transitions: Transition[]
  /** Body output time. */
  scores: ScoreSpan[]
  /** Source spans for the outro's slow-motion background, and the speed they play at. */
  outroClips: Span[]
  outroSpeed: number
  /** Final output time (intro included). */
  chapters: Chapter[]
  introSeconds: number
  outroSeconds: number
  totalDuration: number
}

export function defaultSettings(): PublishSettings {
  return {
    family: null,
    trimIn: null,
    trimOut: null,
    sourceOffsetSeconds: 0,
    crop: null,
    intro: true,
    outro: true,
    transitions: true,
    scoreboard: true,
    scoreboardCorner: 'tl',
    keepBreaks: [],
    outputHeight: null,
    thumbnail: { template: null, lines: [null, null], show: [true, true] },
    title: null,
    description: null,
  }
}

/** Saved JSON (possibly `{}` or from an older shape) → complete settings. */
export function readSettings(raw: unknown): PublishSettings {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<PublishSettings>
  return {
    ...base,
    ...r,
    thumbnail: { ...base.thumbnail, ...(r.thumbnail ?? {}) },
    keepBreaks: Array.isArray(r.keepBreaks) ? r.keepBreaks : [],
  }
}

/** Source time → output body time. A time inside a cut lands on the cut. */
export function toOutput(segments: readonly Span[], t: number): number {
  let out = 0
  for (const s of segments) {
    if (t < s.from) return out
    if (t < s.to) return out + (t - s.from)
    out += s.to - s.from
  }
  return out
}

function boardAt(derived: DerivedMatch, t: number): BoardState {
  const p = playbackAt(derived, t)
  const sets: [number, number][] = []
  for (const set of derived.sets) {
    if (set.number > p.setNumber) continue
    sets.push(set.number === p.setNumber ? [...p.score] : [...set.score])
  }
  if (!sets.length) sets.push([...p.score])
  const r = p.rally
  const ended = !!r && t >= r.endsAtSeconds
  return {
    sets,
    serving: p.servingSide,
    winner: ended && r?.endedMatch ? derived.matchWinnerSide : null,
  }
}

const boardKey = (b: BoardState) => `${b.sets.map(s => s.join('-')).join('_')}|${b.serving ?? 0}|${b.winner ?? 0}`

/**
 * The edit: what is kept, where the stings go, what the board shows when, and
 * the chapters. Pure, so the editor previews exactly what the render will cut.
 *
 * Tag times are YouTube times; `sourceOffsetSeconds` moves them onto the local file.
 */
export function buildEdit(input: {
  derived: DerivedMatch
  breaks: readonly BreakInput[]
  sourceDuration: number
  settings: PublishSettings
}): EditPlan {
  const { derived, settings } = input
  const off = settings.sourceOffsetSeconds
  const shift = (t: number) => t + off
  const shifted: BreakInput[] = input.breaks.map(b => ({
    idx: b.idx,
    startsAtSeconds: shift(b.startsAtSeconds),
    endsAtSeconds: b.endsAtSeconds === null ? null : shift(b.endsAtSeconds),
  }))

  const from = Math.max(0, settings.trimIn ?? 0)
  const to = Math.min(input.sourceDuration, settings.trimOut ?? input.sourceDuration)
  const cut = shifted.filter(b => !settings.keepBreaks.includes(b.idx))
  const segments = to > from ? withoutBreaks({ from, to }, cut).filter(s => s.to - s.from > 0.05) : []
  const bodyDuration = segments.reduce((n, s) => n + s.to - s.from, 0)
  const out = (t: number) => toOutput(segments, t)
  const inBody = (t: number) => segments.some(s => t >= s.from && t < s.to)

  // --- stings: one per cut between kept segments, one per untagged set end
  const states = derived.rallyStates
  const setEnds = derived.sets
    .filter(s => s.complete && s.lastRallyIdx !== null)
    .map(s => ({ set: s, at: shift(states.find(r => r.idx === s.lastRallyIdx)!.endsAtSeconds) }))
    .filter(e => !states.find(r => r.idx === e.set.lastRallyIdx)!.endedMatch)

  const transitions: Transition[] = []
  if (settings.transitions) {
    const claimed = new Set<number>()
    for (let i = 1; i < segments.length; i++) {
      const gapFrom = segments[i - 1]!.to
      const gapTo = segments[i]!.from
      // A gap made by the trim alone is not a cut anyone sees as a break.
      const isBreak = cut.some(b => b.startsAtSeconds < gapTo && (b.endsAtSeconds ?? Infinity) > gapFrom)
      if (!isBreak) continue
      // The set this break closes: one whose last point lands at or before the gap
      // and whose next rally starts at or after it.
      const end = setEnds.find(e => !claimed.has(e.set.number) && e.at <= gapFrom + 0.01
        && (states.find(r => r.idx === e.set.lastRallyIdx! + 1)?.endsAtSeconds ?? Infinity) + off >= gapTo)
      if (end) claimed.add(end.set.number)
      transitions.push({
        at: Math.max(0, out(gapTo) - TRANSITION_SECONDS / 2),
        kind: end ? 'set' : 'break',
        ...(end ? { setNumber: end.set.number, score: end.set.score } : {}),
      })
    }
    for (const e of setEnds) {
      if (claimed.has(e.set.number)) continue
      const at = e.at + SET_STING_DELAY_SECONDS
      if (!inBody(at)) continue
      transitions.push({ at: out(at), kind: 'set', setNumber: e.set.number, score: e.set.score })
    }
    transitions.sort((a, b) => a.at - b.at)
  }

  // --- scoreboard: a new picture at each point (plus a beat), clipped to the body
  const scores: ScoreSpan[] = []
  if (settings.scoreboard && states.length) {
    const changes = [segments[0]?.from ?? 0, ...states.map(r => shift(r.endsAtSeconds) + SCORE_DELAY_SECONDS)]
    const pushSpan = (a: number, b: number, board: BoardState) => {
      if (b - a < 1 / 30) return
      const key = boardKey(board)
      const last = scores.at(-1)
      if (last && last.key === key && Math.abs(last.to - a) < 1e-6) last.to = b
      else scores.push({ from: a, to: b, board, key })
    }
    for (let i = 0; i < changes.length; i++) {
      const a = changes[i]!
      const b = changes[i + 1] ?? Infinity
      const board = boardAt(derived, a - off - (i === 0 ? 0 : SCORE_DELAY_SECONDS) + 1e-3)
      pushSpan(out(a), Math.min(out(b), bodyDuration), board)
    }
  }

  // --- outro background: starred rallies in slow motion, else the last points
  const outroSeconds = settings.outro ? OUTRO_SECONDS : 0
  let outroClips: Span[] = []
  let outroSpeed = 1
  if (settings.outro && states.length) {
    const want = OUTRO_SECONDS * 0.5
    const pool = highlightSpans(states, input.breaks).map(s => ({ from: shift(s.from), to: shift(s.to) }))
    const fallback = [...states].reverse().map(r => ({ from: shift(r.startsAtSeconds), to: shift(r.endsAtSeconds) }))
    let total = 0
    for (const s of [...pool, ...fallback.filter(f => !pool.some(p => p.from < f.to && p.to > f.from)).reverse()]) {
      if (total >= want) break
      const a = Math.max(0, s.from)
      const b = Math.min(input.sourceDuration, s.to, a + (want - total))
      if (b - a < 0.3) continue
      outroClips.push({ from: a, to: b })
      total += b - a
    }
    outroSpeed = total ? Math.min(1, Math.max(0.25, total / OUTRO_SECONDS)) : 1
    if (!total) outroClips = []
  }

  // --- chapters
  const introSeconds = settings.intro ? INTRO_SECONDS : 0
  const chapters: Chapter[] = []
  for (const set of derived.sets) {
    if (set.firstRallyIdx === null) continue
    const first = states.find(r => r.idx === set.firstRallyIdx)!
    // Set 1 is the 0:00 chapter and covers the intro: YouTube rejects a chapter under 10 s.
    // A rally's span reaches back over the break before it: the set starts where play resumes.
    const end = shift(first.endsAtSeconds)
    const seg = segments.find(g => end > g.from && end <= g.to)
    const start = Math.max(shift(first.startsAtSeconds), seg?.from ?? -Infinity)
    const at = set.number === 1 ? 0 : introSeconds + out(start)
    chapters.push({ at, title: `Set ${set.number}` })
  }
  if (outroSeconds) chapters.push({ at: introSeconds + bodyDuration, title: 'Fin du match' })
  const deduped = chapters.filter((c, i) => !chapters.slice(0, i).some(p => p.at === c.at))

  return {
    segments,
    bodyDuration,
    transitions,
    scores,
    outroClips,
    outroSpeed,
    chapters: deduped,
    introSeconds,
    outroSeconds,
    totalDuration: introSeconds + bodyDuration + outroSeconds,
  }
}

/** Final score by set and the winner, for the result card and the description. */
export function matchResult(derived: DerivedMatch): { sets: [number, number][], winner: Side | null } {
  return {
    sets: derived.sets.filter(s => s.firstRallyIdx !== null).map(s => [...s.score] as [number, number]),
    winner: derived.matchWinnerSide,
  }
}
