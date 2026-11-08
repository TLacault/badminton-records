import { requireAdmin } from '../../utils/auth'
import { searchPlayers } from '../../utils/myffbad'

/**
 * Re-reads ranks, CPPH, category and club from MyFFBaD for every roster player
 * that has a licence number.
 *
 *   POST /api/players/refresh
 *
 * MyFFBaD's search takes a licence number as the term and answers with that one
 * licensee, so this is one page per player. Names are left alone: they may have
 * been corrected by hand, and a rank is what goes stale, not a name.
 */

/** Parallel requests to someone else's site. Low on purpose. */
const CONCURRENCY = 4

export default defineEventHandler(async (event) => {
  const { client } = await requireAdmin(event)

  const [{ data: players, error: readError }, { data: clubs }] = await Promise.all([
    client.from('players').select('id, ffbad_license').not('ffbad_license', 'is', null),
    client.from('clubs').select('id, myffbad_club_id').not('myffbad_club_id', 'is', null),
  ])
  if (readError) throw createError({ statusCode: 500, statusMessage: readError.message })

  const clubIds = new Map((clubs ?? []).map(c => [c.myffbad_club_id!, c.id]))
  const queue = (players ?? []).filter(p => p.ffbad_license?.trim())
  const failed: string[] = []
  const notFound: string[] = []
  let updated = 0

  // ponytail: whole roster in one request; batch it client-side if it outgrows the function timeout.
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const licence = p.ffbad_license!.trim()
      try {
        const { players: found } = await searchPlayers(licence, 'all')
        const hit = found.find(f => f.licence === licence)
        if (!hit) {
          notFound.push(licence)
          continue
        }
        const { error } = await client.from('players').update({
          rank_singles: hit.rankSingles,
          rank_doubles: hit.rankDoubles,
          rank_mixed: hit.rankMixed,
          cpph: hit.cpph,
          category: hit.category,
          club: hit.club,
          club_id: hit.clubId ? clubIds.get(hit.clubId) ?? null : null,
          myffbad_person_id: hit.personId || null,
        }).eq('id', p.id)
        if (error) throw error
        updated += 1
      }
      catch (cause) {
        // One bad row should not cost the rest of the roster its refresh.
        failed.push(licence)
        console.warn(`[players/refresh] ${licence}: ${(cause as Error).message}`)
      }
    }
  }

  const total = queue.length
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return { total, updated, notFound, failed }
})
