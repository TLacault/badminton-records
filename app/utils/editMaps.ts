import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditKind, EditMaps, EditPiece } from '~~/shared/publish'

/** Records where a render placed the raw footage, next to that render's siblings. */
export async function saveEditMap(client: SupabaseClient, matchId: string, kind: EditKind, pieces: EditPiece[]) {
  const { data } = await client.from('matches').select('edit_maps').eq('id', matchId).single()
  const maps = { ...((data?.edit_maps ?? {}) as EditMaps), [kind]: pieces }
  await client.from('matches').update({ edit_maps: maps }).eq('id', matchId)
}
