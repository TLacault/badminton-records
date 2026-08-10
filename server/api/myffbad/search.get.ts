import { requireAdmin } from '../../utils/auth'
import { MyffbadScrapeError, searchPlayers } from '../../utils/myffbad'

/**
 * Admin-only proxy for MyFFBaD player search.
 *
 * MyFFBaD answers anonymously, so the proxy is not hiding a credential. It is
 * still admin-only for a different reason: an open route here would turn this
 * deployment into a public scraping relay for myffbad.fr.
 *
 *   GET /api/myffbad/search?q=tim+lacault
 *   GET /api/myffbad/search?q=tim+lacault&debug=1  → also returns the records
 *   as MyFFBaD sent them, which is how you re-map fields in
 *   server/utils/myffbad.ts after a site change.
 */

/**
 * A surname alone can match thousands. Ten keeps the dropdown scannable; the
 * response says how many there really were so the UI can ask for a first name.
 */
const RESULT_LIMIT = 10

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const term = String(query.q ?? '').trim()
  if (term.length < 2) return { players: [], total: 0, truncated: false }

  try {
    const { players, total, maxPages, rows } = await searchPlayers(term)
    const shown = players.slice(0, RESULT_LIMIT)
    return {
      players: shown,
      total,
      maxPages,
      // Either this page held more than we show, or there are further pages we
      // never fetched — both mean "the person you want may not be listed".
      truncated: players.length > shown.length || maxPages > 1,
      ...(query.debug ? { rows } : {}),
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
