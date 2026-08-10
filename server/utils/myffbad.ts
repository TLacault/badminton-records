/**
 * Scraper for MyFFBaD player search (https://myffbad.fr/recherche/joueur).
 *
 * The federation's own web services are not open to the public, so the roster
 * lookup reads the public site instead. No login: the search page answers
 * anonymously, which keeps the whole thing to one URL and one JSON blob.
 *
 * MyFFBaD is a Next.js app. The search results are not in the rendered markup
 * but in the React Server Components payload, which the page ships as a series
 * of `self.__next_f.push([1, "<chunk>"])` calls. Concatenating the chunks gives
 * a text stream that contains, exactly once, a `"results":[…]` array of player
 * records. That array is what we want.
 *
 * This will break the day MyFFBaD changes its page. When it does, the failure
 * is loud rather than silent — see `parseSearchPage` — and the fixtures under
 * `__fixtures__/` record what the page looked like when it last worked.
 */

const SEARCH_URL = 'https://myffbad.fr/recherche/joueur'

/** Printed by the site when a query matches nobody. */
const NO_RESULTS_MARKER = 'Aucun résultat pour cette recherche.'

export interface MyffbadPlayer {
  personId: string
  licence: string
  firstName: string
  lastName: string
  /** MyFFBaD's club id — the exact key the badiste club list links to. */
  clubId: string | null
  club: string | null
  category: string | null
  rankSingles: string | null
  rankDoubles: string | null
  rankMixed: string | null
  cpph: number | null
}

export interface MyffbadSearchResult {
  players: MyffbadPlayer[]
  /** Rows on this page, before any display cap. */
  total: number
  maxPages: number
  /** The records as MyFFBaD sent them, for `?debug=1` when a mapping breaks. */
  rows: Record<string, unknown>[]
}

/**
 * The page loaded but did not look the way we expect. Distinct from "nobody
 * matched" on purpose: one means fix the scraper, the other means try another
 * spelling, and the admin should never have to guess which.
 */
export class MyffbadScrapeError extends Error {}

/**
 * Reads the JSON string literal starting at `start`, honouring backslash
 * escapes, and returns its decoded value.
 */
function readJsonString(source: string, start: number): string | null {
  if (source[start] !== '"') return null
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '"') {
      try {
        return JSON.parse(source.slice(start, i + 1)) as string
      }
      catch {
        return null
      }
    }
  }
  return null
}

/**
 * Returns the array literal that opens at `open`, balanced on brackets and
 * blind to brackets inside strings — a club named `Badminton [33]` would
 * otherwise cut the slice short.
 */
function readArrayLiteral(source: string, open: number): string | null {
  let depth = 0
  let inString = false
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      if (ch === '\\') i += 1
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return null
}

/**
 * Joins the RSC chunks into one text stream.
 *
 * Decoding each chunk properly rather than running a global `\"` → `"` replace
 * over the document: the crude version corrupts any value holding a real
 * backslash, and it cannot tell a chunk boundary from a quote.
 */
export function extractFlight(html: string): string {
  const marker = 'self.__next_f.push([1,'
  let out = ''
  let at = html.indexOf(marker)
  while (at !== -1) {
    const chunk = readJsonString(html, at + marker.length)
    if (chunk !== null) out += chunk
    at = html.indexOf(marker, at + marker.length)
  }
  return out
}

/** The `results` array from the flight stream, or null if it is not there. */
export function extractResults(flight: string): Record<string, unknown>[] | null {
  const key = '"results":'
  const at = flight.indexOf(key)
  if (at === -1) return null
  const open = flight.indexOf('[', at + key.length)
  if (open === -1) return null
  const literal = readArrayLiteral(flight, open)
  if (!literal) return null
  try {
    const parsed = JSON.parse(literal) as unknown
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : null
  }
  catch {
    return null
  }
}

function isUpperCaseToken(token: string): boolean {
  return /\p{L}/u.test(token) && token === token.toLocaleUpperCase('fr-FR')
}

/**
 * Name particles, which stay lower-case inside a surname: `DE LA CROIX` reads
 * as `De la Croix`, not `De La Croix`. A leading particle keeps its capital —
 * `LE GALL` is `Le Gall` — because that is how such names are written when the
 * surname stands on its own.
 */
const PARTICLES = new Set([
  'de', 'du', 'des', 'da', 'del', 'della', 'di', 'la', 'le', 'les',
  'van', 'von', 'der', 'den', 'ter', 'bin', 'al',
])

function capitaliseSegment(segment: string): string {
  if (!segment) return segment
  return segment.charAt(0).toLocaleUpperCase('fr-FR')
    + segment.slice(1).toLocaleLowerCase('fr-FR')
}

/** Capitalises each part of a hyphenated or elided word: `D'ARTAGNAN` → `D'Artagnan`. */
function capitaliseWord(word: string): string {
  return word
    .split(/([-'’])/)
    .map(part => (/^[-'’]$/.test(part) ? part : capitaliseSegment(part)))
    .join('')
}

/**
 * `LACAULT` → `Lacault`, `JEAN-PIERRE` → `Jean-Pierre`.
 *
 * MyFFBaD shouts surnames. Storing them that way would shout them through
 * every scoreboard and table in the app, and would stop `HOME_PAIR` matching
 * the roster by name, so the case is normalised on the way in.
 */
export function toTitleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('fr-FR')
      return index > 0 && PARTICLES.has(lower) ? lower : capitaliseWord(word)
    })
    .join(' ')
}

/**
 * `"Tim LACAULT"` → `Tim` / `LACAULT`, `"Jean DE LA CROIX"` → `Jean` / `DE LA
 * CROIX`. MyFFBaD prints the surname in capitals, so the trailing run of
 * upper-case tokens is the surname and whatever precedes it is the first name.
 *
 * When the rule cannot split — one token, or capitals throughout — everything
 * goes to the surname rather than being guessed at. The admin form is filled,
 * not saved, so a human sees it before it reaches the roster.
 */
export function splitName(full: string): { firstName: string, lastName: string } {
  const tokens = full.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return { firstName: '', lastName: '' }

  let cut = tokens.length
  while (cut > 0 && isUpperCaseToken(tokens[cut - 1]!)) cut -= 1

  if (cut === 0 || cut === tokens.length) {
    return { firstName: '', lastName: tokens.join(' ') }
  }
  return {
    firstName: tokens.slice(0, cut).join(' '),
    lastName: tokens.slice(cut).join(' '),
  }
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function decimal(value: unknown): number | null {
  const raw = text(value)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The one place that knows MyFFBaD's field names. Everything downstream works
 * with `MyffbadPlayer`, so a renamed field is a one-line fix here.
 */
export function normalisePlayer(row: Record<string, unknown>): MyffbadPlayer | null {
  const licence = text(row.PersonLicence)
  if (!licence) return null
  const { firstName, lastName } = splitName(text(row.PersonName) ?? '')
  return {
    personId: text(row.PersonId) ?? '',
    licence,
    firstName: toTitleCase(firstName),
    lastName: toTitleCase(lastName),
    clubId: text(row.ClubId),
    club: text(row.ClubName),
    category: text(row.CategoryName),
    rankSingles: text(row.SimpleSubLevel),
    rankDoubles: text(row.DoubleSubLevel),
    rankMixed: text(row.MixteSubLevel),
    // Birth date is absent from the public payload, so the roster's birth_year
    // stays a manual field. Nothing to map here.
    cpph: decimal(row.GlobalRating),
  }
}

/**
 * Turns a search page into players.
 *
 * A page with no `results` block is only an empty search when the site says so
 * in as many words; otherwise the page has changed shape and we say that
 * instead of quietly reporting nobody found.
 */
export function parseSearchPage(html: string): MyffbadSearchResult {
  const flight = extractFlight(html)
  const rows = extractResults(flight)

  if (!rows) {
    if (html.includes(NO_RESULTS_MARKER) || flight.includes(NO_RESULTS_MARKER)) {
      return { players: [], total: 0, maxPages: 0, rows: [] }
    }
    throw new MyffbadScrapeError(
      'MyFFBaD returned a page without a results block. The site has probably '
      + 'changed — server/utils/myffbad.ts needs updating.',
    )
  }

  const paging = /"page":(\d+),"maxPages":(\d+)/.exec(flight)
  return {
    players: rows
      .map(normalisePlayer)
      .filter((p): p is MyffbadPlayer => p !== null),
    total: rows.length,
    maxPages: paging ? Number(paging[2]) : 1,
    rows,
  }
}

/** Fetches and parses one page of results for `term`. */
export async function searchPlayers(term: string): Promise<MyffbadSearchResult> {
  const html = await $fetch<string>(SEARCH_URL, {
    responseType: 'text',
    query: { search: term },
    headers: {
      'User-Agent': 'badminton-records/1.0 (roster lookup; +https://myffbad.fr)',
    },
  })
  return parseSearchPage(html)
}
