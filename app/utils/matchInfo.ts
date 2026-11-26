import type { Database } from '~/types/database.types'
import type { MatchFormat } from '~~/shared/badminton'
import type { Category, MatchInfo } from '~~/shared/publish'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
type Player = Row<'players'>

/** The match facts the YouTube and clip editors print, from a match row (with `match_types(slug)`) and its players. */
export function matchInfoFrom(
  m: Row<'matches'> & { match_types?: unknown },
  participants: { slot: number, players: unknown }[],
): MatchInfo {
  const bySlot: Record<number, Player | null> = {}
  for (const p of participants) bySlot[p.slot] = p.players as Player | null
  const format = m.format as MatchFormat
  const category = m.category as Category | null
  const rankKey = format === 'singles' ? 'rank_singles' : category === 'mixed' ? 'rank_mixed' : 'rank_doubles'
  const side = (slots: number[]) => {
    const players = slots.map(s => bySlot[s]).filter((p): p is Player => Boolean(p))
    return {
      first: players.map(p => p.first_name),
      full: players.map(p => `${p.first_name} ${p.last_name}`),
      club: players[0]?.club ?? null,
      ranks: players.map(p => p[rankKey]),
    }
  }
  const singles = format === 'singles'
  return {
    id: m.id,
    format,
    category,
    typeSlug: (m.match_types as { slug: string } | null)?.slug ?? null,
    eventName: m.event_name,
    round: m.round,
    venue: m.venue,
    playedOn: m.played_on,
    sides: [side(singles ? [1] : [1, 2]), side(singles ? [3] : [3, 4])],
  }
}
