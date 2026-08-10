/**
 * Scraper for badiste.fr's departmental club list.
 *
 * MyFFBaD gives a player's club as a name and an id, but no acronym and no way
 * to tell a local club from one three regions away. badiste publishes exactly
 * that, one table per department, with each row linking to the club's MyFFBaD
 * page — so `myffbad.fr/club/830` in the link and `ClubId: "830"` on a player
 * row are the same key, and the join is exact rather than name-matched.
 *
 * Same bargain as server/utils/myffbad.ts: it will break when the page
 * changes, and it breaks loudly. The fixture under `__fixtures__/` records the
 * page as it last worked.
 */

/**
 * Gironde, the only department we play in. The path carries the department's
 * name as well as its number, so another one means another slug here rather
 * than a parameter — there is no arithmetic that turns 33 into "gironde".
 */
export const DEPARTMENT = '33'
const LIST_URL = 'https://badiste.fr/liste-club-badminton/33-gironde.html'

/**
 * Search priority for clubs we care about, applied when a club is first
 * imported. Keyed by MyFFBaD club id — 830 is Union Sportive Talence, ours.
 * After the first import the value in the database wins, so changing the
 * ranking on /admin/clubs sticks across refreshes.
 */
export const SEEDED_PRIORITY: Record<string, number> = {
  830: 100,
}

export interface BadisteClub {
  /** MyFFBaD's club id, taken from the row's link. The upsert key. */
  myffbadClubId: string
  name: string
  acronym: string | null
  city: string | null
  department: string
}

export class BadisteScrapeError extends Error {}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Reads the club table.
 *
 * A row counts only if it links to a MyFFBaD club — that skips the header, the
 * "Télécharger" toolbar row and anything else the page puts in the table,
 * without depending on how many columns the stats section happens to have this
 * month.
 */
export function parseClubList(html: string, department: string): BadisteClub[] {
  const clubs: BadisteClub[] = []
  const seen = new Set<string>()

  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const link = /href="https:\/\/myffbad\.fr\/club\/(\d+)"/.exec(row!)
    if (!link) continue

    const cells = [...row!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(match => stripTags(match[1]!))
    // rank, name, acronym, department, city, …statistics we do not want.
    if (cells.length < 5) continue

    const myffbadClubId = link[1]!
    const name = cells[1]!
    if (!name || seen.has(myffbadClubId)) continue
    seen.add(myffbadClubId)

    clubs.push({
      myffbadClubId,
      name,
      acronym: cells[2] || null,
      city: cells[4] || null,
      department: cells[3] || department,
    })
  }

  if (!clubs.length) {
    throw new BadisteScrapeError(
      'badiste returned a page with no club rows. The site has probably '
      + 'changed — server/utils/badiste.ts needs updating.',
    )
  }
  return clubs
}

/**
 * Fetches one department's clubs.
 *
 * The page is served as iso-8859-15, so it is read as bytes and decoded
 * explicitly; letting it be treated as UTF-8 turns every accent into a
 * replacement character and lands `AMBAR�S-ET-LAGRAVE` in the database.
 */
export async function fetchClubs(): Promise<BadisteClub[]> {
  const buffer = await $fetch<ArrayBuffer>(LIST_URL, {
    responseType: 'arrayBuffer',
    headers: {
      'User-Agent': 'badminton-records/1.0 (club list; +https://badiste.fr)',
    },
  })
  const html = new TextDecoder('iso-8859-15').decode(buffer)
  return parseClubList(html, DEPARTMENT)
}
