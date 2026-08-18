import type { MyffbadPlayer } from '../../utils/myffbad'
import { requireAdmin } from '../../utils/auth'
import { MyffbadScrapeError, rankBySearchPriority, searchPlayers, sortByName } from '../../utils/myffbad'

/**
 * Admin-only proxy for MyFFBaD player search.
 *
 * MyFFBaD answers anonymously, so the proxy is not hiding a credential. It is
 * still admin-only for a different reason: an open route here would turn this
 * deployment into a public scraping relay for myffbad.fr.
 *
 *   GET /api/myffbad/search?q=tim+lacault            → our club only
 *   GET /api/myffbad/search?q=tim+lacault&scope=all  → every club in France
 *   GET /api/myffbad/search?q=…&debug=1              → plus the raw records
 *
 * The two scopes are two different requests to MyFFBaD, not one request
 * filtered two ways: the club leg asks the site for our club, so a common
 * surname cannot push our own licensee off the only page we fetch.
 */

/**
 * A surname alone can match thousands. Ten keeps the dropdown scannable; the
 * response says when more were held back so the UI can say so too.
 */
const RESULT_LIMIT = 10

export default defineEventHandler(async (event) => {
  const { client } = await requireAdmin(event)

  const query = getQuery(event)
  const term = String(query.q ?? '').trim()
  const scope = query.scope === 'all' ? 'all' : 'club'
  if (term.length < 2) {
    return { players: [], total: 0, scope, truncated: false }
  }

  try {
    const { players, total, maxPages, rows } = await searchPlayers(term, scope)

    // Only the country-wide leg needs the club list: it is what floats the
    // people we play to the top of a page of strangers. The club leg is one
    // club by construction, so surname order is the only order it can want.
    let ordered: MyffbadPlayer[] = sortByName(players)
    if (scope === 'all') {
      const { data: clubs, error: clubError } = await client
        .from('clubs')
        .select('myffbad_club_id, priority')
        .is('archived_at', null)
      if (clubError) {
        throw createError({ statusCode: 500, statusMessage: clubError.message })
      }
      const priorities = new Map(
        (clubs ?? [])
          .filter(row => row.myffbad_club_id)
          .map(row => [row.myffbad_club_id!, row.priority]),
      )
      ordered = rankBySearchPriority(players, priorities)
    }

    const page = ordered.slice(0, RESULT_LIMIT)
    return {
      players: page,
      total: ordered.length,
      scope,
      // Either more matched than we show, or MyFFBaD had further pages we never
      // fetched — both mean the person you want may not be listed.
      truncated: ordered.length > page.length || maxPages > 1,
      ...(query.debug ? { rows, total } : {}),
    }
  }
  catch (cause) {
    if (cause instanceof MyffbadScrapeError) {
      throw createError({ statusCode: 502, statusMessage: cause.message })
    }
    if ((cause as { statusCode?: number }).statusCode) throw cause
    throw createError({
      statusCode: 502,
      statusMessage: `MyFFBaD request failed: ${(cause as Error).message}`,
    })
  }
})
