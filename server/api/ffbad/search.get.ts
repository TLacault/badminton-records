import type { Database } from '~/types/database.types'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { FfbadError, searchByName } from '../../utils/ffbad'

/**
 * Admin-only proxy for FFBaD licensee search.
 *
 * A proxy rather than a direct call because the FFBaD credentials are a login
 * and password, which must never reach the browser.
 *
 *   GET /api/ffbad/search?q=lacault
 *   GET /api/ffbad/search?q=lacault&debug=1   → also returns the raw payload,
 *   which is how you correct the field mapping in server/utils/ffbad.ts.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }

  const client = await serverSupabaseClient<Database>(event)
  const { data: profile } = await client
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin role required' })
  }

  const query = getQuery(event)
  const term = String(query.q ?? '').trim()
  if (term.length < 2) return { players: [] }

  const config = useRuntimeConfig(event)
  if (!config.ffbadLogin || !config.ffbadPassword) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'FFBaD credentials are not configured. Set FFBAD_LOGIN and FFBAD_PASSWORD in .env.',
    })
  }

  try {
    const { players, raw } = await searchByName(
      {
        baseUrl: config.ffbadApiUrl,
        login: config.ffbadLogin,
        password: config.ffbadPassword,
      },
      term,
    )
    return query.debug ? { players, raw } : { players }
  }
  catch (cause) {
    if (cause instanceof FfbadError) {
      throw createError({ statusCode: 502, statusMessage: cause.message })
    }
    throw createError({
      statusCode: 502,
      statusMessage: `FFBaD request failed: ${(cause as Error).message}`,
    })
  }
})
