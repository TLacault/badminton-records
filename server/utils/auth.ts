import type { Database } from '~/types/database.types'
import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

/**
 * Resolves the caller and asserts they are an admin.
 *
 * Two traps this exists to keep in one place:
 *
 * 1. `serverSupabaseUser()` returns JWT *claims*, not a `User`. The id lives
 *    under `sub`; `.id` is undefined. `JwtPayload` carries an
 *    `[key: string]: any` index signature, so `user.id` type-checks happily and
 *    only fails at runtime — see the same warning in useCurrentProfile.
 *
 * 2. Do not filter the profile lookup by id at all. RLS on `profiles` already
 *    restricts the caller to their own row, so a filter adds nothing — and a
 *    filter on the wrong key makes every admin look like a guest.
 */
export async function requireAdmin(event: H3Event) {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }

  const client = await serverSupabaseClient<Database>(event)

  const { data: profile, error } = await client
    .from('profiles')
    .select('role')
    .limit(1)
    .maybeSingle()

  // Surfaced rather than swallowed: ignoring this is what turned a hard
  // PostgREST 400 into a misleading "Admin role required".
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Could not read profile: ${error.message}`,
    })
  }
  if (profile?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin role required' })
  }

  return { client, userId: claims.sub }
}
