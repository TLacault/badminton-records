/**
 * The personal details a match page may print beside a player's name.
 *
 * Which of them appear is a per-match choice (`matches.player_info_fields`):
 * an interclub tie wants ranks and licences on the sheet, a Tuesday evening
 * wants a first name. The vocabulary lives here so the admin checkboxes and
 * the public table can never drift apart.
 */

/**
 * Our half of the court. Matched by name against the roster rather than by a
 * hardcoded id, so the seed survives a database reset — and so that adding the
 * pair to a new match is one lookup rather than two dropdowns, every time.
 */
export const HOME_PAIR = [
  { first_name: 'Tim', last_name: 'Lacault' },
  { first_name: 'Adrien', last_name: 'Chapour' },
]

/**
 * Names compare folded: the MyFFBaD lookup normalises `LACAULT` to `Lacault`,
 * but a row typed by hand — or imported before that normalisation existed —
 * can be cased and spaced any way at all, and an exact compare would silently
 * stop matching the people this file exists to find.
 */
function fold(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')
}

/** Player ids for slots 1 and 2, for whichever of the pair the roster holds. */
export function homePairSlots(
  roster: { id: string, first_name: string, last_name: string }[],
): Record<number, string> {
  const out: Record<number, string> = {}
  HOME_PAIR.forEach((wanted, index) => {
    const found = roster.find(
      p => fold(p.first_name) === fold(wanted.first_name)
        && fold(p.last_name) === fold(wanted.last_name),
    )
    if (found) out[index + 1] = found.id
  })
  return out
}

/**
 * The stand-in for someone whose name we do not have — a fourth player who
 * turned up once, an opponent nobody wrote down. A real roster row, so the
 * slot can be filled and the match tagged, named rather than seeded by id for
 * the same reason the home pair is.
 */
export const PLACEHOLDER_NAME = 'place holder'

/** The stand-in, if the roster holds one. Any casing, any spacing. */
export function findPlaceholder<T extends { first_name: string, last_name: string }>(
  roster: readonly T[],
): T | null {
  return roster.find(p => fold(`${p.first_name} ${p.last_name}`) === PLACEHOLDER_NAME) ?? null
}

export interface PlayerInfoSource {
  club?: string | null
  rank_singles?: string | null
  rank_doubles?: string | null
  rank_mixed?: string | null
  ffbad_license?: string | null
}

export interface PlayerInfoField {
  id: string
  label: string
  read: (player: PlayerInfoSource) => string | null
}

export const PLAYER_INFO_FIELDS: PlayerInfoField[] = [
  { id: 'club', label: 'Club', read: p => p.club || null },
  { id: 'rank_singles', label: 'Singles rank', read: p => p.rank_singles || null },
  { id: 'rank_doubles', label: 'Doubles rank', read: p => p.rank_doubles || null },
  { id: 'rank_mixed', label: 'Mixed rank', read: p => p.rank_mixed || null },
  { id: 'licence', label: 'Licence', read: p => p.ffbad_license || null },
]

/**
 * `U.S. Talence` → `UST`, `Bordeaux` → `BOR`.
 *
 * The roster stores a club as free text and has no acronym column, so one is
 * built: initials when the name is several words, the first three letters when
 * it is one. Short entries like `UST` are already the acronym and survive
 * unchanged.
 */
export function clubTag(club: string | null | undefined): string | null {
  if (!club) return null
  const words = club.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!words.length) return null
  const acronym = words.length > 1
    ? words.slice(0, 3).map(w => w[0]).join('')
    : words[0]!.slice(0, 3)
  return acronym.toUpperCase()
}

/**
 * A player's page on the federation's public site.
 *
 * Derived from the licence rather than stored: the licence is already the path
 * segment MyFFBaD uses, so a second column would only be a copy that can rot.
 */
export function myffbadProfileUrl(
  licence: string | null | undefined,
): string | null {
  const trimmed = licence?.trim()
  return trimmed ? `https://myffbad.fr/joueur/${trimmed}` : null
}

/** The selected details this player actually has a value for. */
export function playerInfoChips(
  player: PlayerInfoSource | null | undefined,
  fields: readonly string[],
): { id: string, label: string, value: string }[] {
  if (!player) return []
  return PLAYER_INFO_FIELDS
    .filter(field => fields.includes(field.id))
    .map(field => ({ id: field.id, label: field.label, value: field.read(player) ?? '' }))
    .filter(chip => chip.value !== '')
}
