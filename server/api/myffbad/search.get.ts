import { requireAdmin } from '../../utils/auth'
import { MyffbadScrapeError, rankBySearchPriority, searchPlayers } from '../../utils/myffbad'

/**
 * Admin-only proxy for MyFFBaD player search.
 *
 * MyFFBaD answers anonymously, so the proxy is not hiding a credential. It is
 * still admin-only for a different reason: an open route here would turn this
 * deployment into a public scraping relay for myffbad.fr.
 *
 *   GET /api/myffbad/search?q=tim+lacault            → our clubs only
 *   GET /api/myffbad/search?q=tim+lacault&scope=all  → everyone
 *   GET /api/myffbad/search?q=…&debug=1              → plus the raw records
 */

/**
 * A surname alone can match thousands. Ten keeps the dropdown scannable; the
 * response says how many were held back so the UI can offer the rest.
 */
const RESULT_LIMIT = 10

export default defineEventHandler(async (event) => {
  const { client } = await requireAdmin(event)

  const query = getQuery(event)
  const term = String(query.q ?? '').trim()
  const scope = query.scope === 'all' ? 'all' : 'local'
  if (term.length < 2) {
    return { players: [], total: 0, hidden: 0, scope, truncated: false }
  }

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

  try {
    const { players, total, maxPages, rows } = await searchPlayers(term)
    const { shown, hidden } = rankBySearchPriority(players, priorities, scope)
    const page = shown.slice(0, RESULT_LIMIT)
    return {
      players: page,
      total: shown.length,
      hidden: scope === 'all' ? 0 : hidden,
      scope,
      // Either more matched than we show, or MyFFBaD had further pages we never
      // fetched — both mean the person you want may not be listed.
      truncated: shown.length > page.length || (scope === 'all' && maxPages > 1),
      ...(query.debug ? { rows, total } : {}),
    }
  }
  catch (cause) {
    if (cause instanceof MyffbadScrapeError) {
      throw createError({ statusCode: 502, statusMessage: cause.message })
    }
    throw createError({
      statusCode: 502,
      statusMessage: `MyFFBaD request failed: ${(cause as Error).message}`,
    })
  }
})
