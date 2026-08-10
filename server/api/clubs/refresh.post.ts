import { requireAdmin } from '../../utils/auth'
import { BadisteScrapeError, DEPARTMENT, fetchClubs, SEEDED_PRIORITY } from '../../utils/badiste'

/**
 * Re-imports the club list from badiste.
 *
 *   POST /api/clubs/refresh
 *
 * Rewrites rows the importer owns (`source = 'badiste'`), leaves rows you added
 * by hand alone, and archives rather than deletes a club badiste has dropped —
 * players may still point at it.
 *
 * `priority` is carried through explicitly rather than omitted. The upsert
 * writes every column it is given, so leaving it out would reset the ranking
 * you chose on /admin/clubs back to the default on the next refresh.
 */
export default defineEventHandler(async (event) => {
  const { client } = await requireAdmin(event)

  let clubs
  try {
    clubs = await fetchClubs()
  }
  catch (cause) {
    if (cause instanceof BadisteScrapeError) {
      throw createError({ statusCode: 502, statusMessage: cause.message })
    }
    throw createError({
      statusCode: 502,
      statusMessage: `badiste request failed: ${(cause as Error).message}`,
    })
  }

  const { data: existing, error: readError } = await client
    .from('clubs')
    .select('id, myffbad_club_id, source, archived_at, priority')
  if (readError) {
    throw createError({ statusCode: 500, statusMessage: readError.message })
  }

  const known = new Map(
    (existing ?? [])
      .filter(row => row.myffbad_club_id)
      .map(row => [row.myffbad_club_id!, row]),
  )

  const { error: upsertError } = await client.from('clubs').upsert(
    clubs.map((club) => {
      const current = known.get(club.myffbadClubId)
      return {
        ...(current?.id ? { id: current.id } : {}),
        myffbad_club_id: club.myffbadClubId,
        name: club.name,
        acronym: club.acronym,
        city: club.city,
        department: club.department,
        source: 'badiste',
        priority: current?.priority ?? SEEDED_PRIORITY[club.myffbadClubId] ?? 0,
        // A club that came back is no longer archived.
        archived_at: null,
      }
    }),
    { onConflict: 'myffbad_club_id' },
  )
  if (upsertError) {
    throw createError({ statusCode: 500, statusMessage: upsertError.message })
  }

  // Anything badiste still owns but no longer lists has closed or moved.
  const listed = new Set(clubs.map(c => c.myffbadClubId))
  const vanished = (existing ?? []).filter(
    row => row.source === 'badiste'
      && !row.archived_at
      && (!row.myffbad_club_id || !listed.has(row.myffbad_club_id)),
  )
  if (vanished.length) {
    const { error: archiveError } = await client
      .from('clubs')
      .update({ archived_at: new Date().toISOString() })
      .in('id', vanished.map(row => row.id))
    if (archiveError) {
      throw createError({ statusCode: 500, statusMessage: archiveError.message })
    }
  }

  return {
    department: DEPARTMENT,
    imported: clubs.length,
    added: clubs.filter(c => !known.has(c.myffbadClubId)).length,
    archived: vanished.length,
  }
})
