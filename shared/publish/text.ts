import type { Category, FamilyId, MatchInfo, PublishSettings } from './types'
import type { MatchFormat } from '../badminton'

export interface Family {
  id: FamilyId
  /** Printed on the template's tag and in titles. */
  label: string
  colour: string
  /** File in brand/thumbnail/. */
  template: string
}

/** Colours sampled from Tim's templates in brand/thumbnail/. */
export const FAMILIES: Record<FamilyId, Family> = {
  tournois: { id: 'tournois', label: 'Tournois', colour: '#cb2543', template: 'tournois.png' },
  interclub: { id: 'interclub', label: 'Interclub', colour: '#537eff', template: 'interclub.png' },
  jeux_libres: { id: 'jeux_libres', label: 'Jeux libres', colour: '#9f53ff', template: 'jeux_libres.png' },
}

/** match_types.slug → family. Unknown and missing types are free play. */
export function familyForType(slug: string | null): FamilyId {
  if (slug === 'tournament' || slug === 'championship') return 'tournois'
  if (slug === 'interclubs') return 'interclub'
  return 'jeux_libres'
}

/** The family (tag, colour, thumbnail template) always follows the match type set in Edit match. */
export function familyOf(info: MatchInfo): Family {
  return FAMILIES[familyForType(info.typeSlug)]
}

const DISCIPLINE: Record<MatchFormat, Record<Category | 'none', [string, string]>> = {
  singles: { men: ['Simple hommes', 'SH'], women: ['Simple dames', 'SD'], mixed: ['Simple', 'S'], none: ['Simple', 'S'] },
  doubles: { men: ['Doubles hommes', 'DH'], women: ['Doubles dames', 'DD'], mixed: ['Doubles mixtes', 'DMx'], none: ['Doubles', 'D'] },
}

/** "Doubles hommes" (long) or "DH" (short). */
export function discipline(format: MatchFormat, category: Category | null, short = false): string {
  return DISCIPLINE[format][category ?? 'none'][short ? 1 : 0]
}

export function year(info: MatchInfo): string {
  return info.playedOn?.slice(0, 4) ?? ''
}

/** "Tim & Adrien" */
export function sideName(info: MatchInfo, side: 0 | 1): string {
  return info.sides[side].first.join(' & ') || (side === 0 ? 'Joueur 1' : 'Joueur 2')
}

/** The opponents' club, for interclub: the side-2 club. */
export function opponentClub(info: MatchInfo): string {
  return info.sides[1].club ?? ''
}

/** Event + year, without repeating a year already in the name. */
function eventLine(info: MatchInfo): string {
  const name = info.eventName?.trim() ?? ''
  const y = year(info)
  return name && y && !name.includes(y) ? `${name} ${y}` : name || y
}

/**
 * The two bottom bands of the thumbnail, per family, as Tim's examples set them:
 * Tournois = event / discipline • round; Interclub = opponent club / discipline;
 * Jeux libres = discipline / side 1 VS side 2. Uppercase, as drawn.
 */
export function defaultThumbnailLines(info: MatchInfo, family: FamilyId): [string, string] {
  const disc = discipline(info.format, info.category)
  const lines: [string, string]
    = family === 'tournois'
      ? [eventLine(info), [disc, info.round].filter(Boolean).join(' • ')]
      : family === 'interclub'
        ? [opponentClub(info), disc]
        : [disc, `${sideName(info, 0)}  VS  ${sideName(info, 1)}`]
  return [lines[0].toUpperCase(), lines[1].toUpperCase()]
}

/** The lines the thumbnail actually draws: overrides first, hidden lines dropped. */
export function thumbnailLines(info: MatchInfo, settings: PublishSettings): string[] {
  const defaults = defaultThumbnailLines(info, familyOf(info).id)
  return [0, 1]
    .filter(i => settings.thumbnail.show[i])
    .map(i => (settings.thumbnail.lines[i] ?? defaults[i]!).toUpperCase())
    .filter(Boolean)
}

export const TITLE_MAX = 100

/**
 * "Tournois Senior de Gradignan 2026 | DH Finale". Free play has no event to
 * tell its videos apart, so it gets the players: "Jeux libres 2026 | DH | Tim & Adrien vs Thomas & Anthony".
 * Cut to YouTube's 100 characters.
 */
export function defaultTitle(info: MatchInfo, familyId: FamilyId): string {
  const disc = discipline(info.format, info.category, true)
  const head = familyId === 'tournois'
    ? (info.eventName?.trim() ? eventLine(info) : `${FAMILIES.tournois.label} ${year(info)}`.trim())
    : familyId === 'interclub'
      ? `Interclub${opponentClub(info) ? ` vs ${opponentClub(info)}` : ''} ${year(info)}`.trim()
      : `${FAMILIES.jeux_libres.label} ${year(info)}`.trim()
  const parts = [head, [disc, info.round].filter(Boolean).join(' ')]
  if (familyId === 'jeux_libres') parts.push(`${sideName(info, 0)} vs ${sideName(info, 1)}`)
  const full = parts.join(' | ')
  return full.length <= TITLE_MAX ? full : `${full.slice(0, TITLE_MAX - 1)}…`
}

/** The two films cut from a match's rallies: landscape Highlights, portrait Shorts. */
export type ClipFormat = 'Highlights' | 'Shorts' | 'Edit'

/**
 * A clip: "Gradignan 2026 | DH Poules #3 | Highlights" (or "| Shorts"). Shorter
 * than the YouTube title: the place stands for the event when there is one.
 */
export function clipTitle(info: MatchInfo, familyId: FamilyId, format: ClipFormat = 'Highlights'): string {
  const place = info.venue?.trim() ? `${info.venue.trim()} ${year(info)}`.trim() : defaultTitle(info, familyId).split(' | ')[0]!
  const disc = [discipline(info.format, info.category, true), info.round].filter(Boolean).join(' ')
  return [place, disc, format].join(' | ')
}

/** The card text the intros and the vertical frame print, uppercase. */
export function cardText(info: MatchInfo, familyId: FamilyId): { tag: string, event: string, detail: string, place: string } {
  const disc = discipline(info.format, info.category)
  const date = info.playedOn ? new Date(`${info.playedOn}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const event = familyId === 'tournois'
    ? (info.eventName?.trim() ? eventLine(info) : `${FAMILIES.tournois.label} ${year(info)}`.trim())
    : familyId === 'interclub'
      ? `Interclub${opponentClub(info) ? ` vs ${opponentClub(info)}` : ''}`
      : `${FAMILIES.jeux_libres.label} ${year(info)}`.trim()
  const detail = familyId === 'tournois' ? [disc, info.round].filter(Boolean).join(' • ') : disc
  return {
    tag: FAMILIES[familyId].label.toUpperCase(),
    event: event.toUpperCase(),
    detail: detail.toUpperCase(),
    place: [info.venue, date].filter(Boolean).join(' · ').toUpperCase(),
  }
}

export interface Chapter { at: number, title: string }

/** "1:02:03" / "12:03" / "0:05" — the timestamp shape YouTube turns into chapters. */
export function chapterStamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`
}

/**
 * YouTube only shows chapters when the first is at 0:00, there are at least
 * three, and each lasts 10 s or more. Anything else is dropped whole rather
 * than published half-working.
 */
export function validChapters(chapters: Chapter[], total: number): Chapter[] {
  const sorted = [...chapters].sort((a, b) => a.at - b.at)
  if (sorted.length < 3 || sorted[0]!.at !== 0) return []
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i + 1]?.at ?? total
    if (end - sorted[i]!.at < 10) return []
  }
  return sorted
}

export function defaultDescription(
  info: MatchInfo,
  familyId: FamilyId,
  opts: { setScores: [number, number][], winner: 0 | 1 | null, chapters: Chapter[], total: number, matchUrl: string | null },
): string {
  const out: string[] = []
  const family = FAMILIES[familyId]
  const head = [
    familyId === 'tournois' ? eventLine(info) : familyId === 'interclub' ? `Interclub${opponentClub(info) ? ` contre ${opponentClub(info)}` : ''}` : family.label,
    discipline(info.format, info.category),
    familyId === 'tournois' ? info.round : null,
  ].filter(Boolean).join(' · ')
  out.push(head)
  out.push(`${info.sides[0].full.join(' & ')} vs ${info.sides[1].full.join(' & ')}`)
  const place = [info.venue, info.playedOn ? new Date(`${info.playedOn}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null].filter(Boolean).join(' · ')
  if (place) out.push(place)
  if (opts.setScores.length) {
    const score = opts.setScores.map(([a, b]) => `${a}-${b}`).join(' / ')
    const won = opts.winner === null ? '' : ` · victoire ${sideName(info, opts.winner)}`
    out.push(`Score : ${score}${won}`)
  }

  const chapters = validChapters(opts.chapters, opts.total)
  if (chapters.length) {
    out.push('', 'Chapitres')
    for (const c of chapters) out.push(`${chapterStamp(c.at)} ${c.title}`)
  }

  const players = info.sides.flatMap(s => s.full.map((name, i) => ({ name, rank: s.ranks[i], club: s.club })))
  if (players.length) {
    out.push('', 'Joueurs')
    for (const p of players) out.push(`• ${p.name}${p.club ? ` (${p.club})` : ''}${p.rank ? ` · ${p.rank}` : ''}`)
  }

  if (opts.matchUrl) out.push('', `Match point par point (score, service, temps forts) : ${opts.matchUrl}`)
  const tags = ['#badminton', `#${discipline(info.format, info.category).replace(/\s+/g, '')}`, `#${family.label.replace(/\s+/g, '')}`]
  out.push('', tags.join(' '))
  return out.join('\n')
}

/**
 * The clip's description: the match's, minus chapters (the clip has none), led
 * by its format ("Highlights" / "Shorts") and pointing at the full video.
 */
export function clipDescription(
  info: MatchInfo,
  familyId: FamilyId,
  format: ClipFormat,
  opts: { setScores: [number, number][], winner: 0 | 1 | null, matchUrl: string | null, videoId: string | null },
): string {
  const lines = defaultDescription(info, familyId, { ...opts, chapters: [], total: 0 }).split('\n')
  lines[0] = `${format} · ${lines[0]}`
  if (opts.videoId) lines.splice(lines.indexOf(''), 0, '', `Match complet : https://youtu.be/${opts.videoId}`)
  return lines.join('\n').replace('#badminton', `#badminton #${format.toLowerCase()}`)
}
