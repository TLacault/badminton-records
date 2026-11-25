import type { MatchFormat, Side } from '../badminton'

export type FamilyId = 'tournois' | 'interclub' | 'jeux_libres'
export type Category = 'men' | 'women' | 'mixed'
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

/** Normalised to the source frame: 0–1 on both axes. */
export interface CropRect { x: number, y: number, w: number, h: number }

/**
 * Everything the editor saves on `matches.publish_settings`.
 * Missing keys fall back to `defaultSettings()`, so old rows and `{}` both work.
 */
export interface PublishSettings {
  /** null = from the match type (familyForType). */
  family: FamilyId | null
  /** Source seconds; null = start / end of the file. */
  trimIn: number | null
  trimOut: number | null
  /** Added to every tag timestamp: tags were taken on the YouTube copy, the render reads the local original. */
  sourceOffsetSeconds: number
  crop: CropRect | null
  intro: boolean
  outro: boolean
  transitions: boolean
  scoreboard: boolean
  scoreboardCorner: Corner
  /** Break idx (match_breaks.idx) left in the video instead of being cut. */
  keepBreaks: number[]
  /** null = source height (capped at 2160). */
  outputHeight: 720 | 1080 | 1440 | 2160 | null
  thumbnail: {
    /** File name in brand/thumbnail/; null = the family's template. */
    template: string | null
    /** null = the generated default for that line. */
    lines: [string | null, string | null]
    show: [boolean, boolean]
  }
  title: string | null
  description: string | null
}

export interface SideInfo {
  /** "Tim", "Adrien" */
  first: string[]
  /** "Tim Lacault" */
  full: string[]
  /** Club name of the side's first player, if known. */
  club: string | null
  /** "D7", "P10"… per player, for the description. */
  ranks: (string | null)[]
}

/** The match facts every generated text and card reads. */
export interface MatchInfo {
  id: string
  format: MatchFormat
  category: Category | null
  typeSlug: string | null
  eventName: string | null
  round: string | null
  venue: string | null
  /** ISO date, "2026-11-24". */
  playedOn: string | null
  sides: [SideInfo, SideInfo]
}

/** What the burned-in scoreboard shows. */
export interface BoardState {
  /** One entry per set reached; the last is the live one. */
  sets: [number, number][]
  serving: Side | null
  winner: Side | null
}
