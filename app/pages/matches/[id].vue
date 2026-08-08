<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchConfig, Side, Slot } from '~~/shared/badminton'
import { deriveMatch } from '~~/shared/badminton'

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`match-${matchId}`, async () => {
  const [match, participants, rallies, gameStarts] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).maybeSingle(),
    client.from('match_players')
      .select('slot, players(first_name, last_name)').eq('match_id', matchId),
    client.from('rallies').select('*').eq('match_id', matchId).order('idx'),
    client.from('match_game_starts').select('*').eq('match_id', matchId),
  ])
  return {
    match: match.data,
    participants: participants.data ?? [],
    rallies: rallies.data ?? [],
    gameStarts: gameStarts.data ?? [],
  }
})

const match = computed(() => bundle.value?.match ?? null)

const names = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) {
    const player = p.players as { first_name: string, last_name: string } | null
    out[p.slot] = player ? `${player.first_name} ${player.last_name}` : `Slot ${p.slot}`
  }
  return out
})

const sideNames = computed<Record<number, string>>(() => ({
  1: [names.value[1], names.value[2]].filter(Boolean).join(' / ') || 'Us',
  2: [names.value[3], names.value[4]].filter(Boolean).join(' / ') || 'Them',
}))

const derived = computed(() => {
  const m = match.value
  if (!m) return null
  const config: MatchConfig = {
    format: m.format as MatchConfig['format'],
    rules: {
      bestOf: m.best_of,
      pointsToWin: m.points_to_win,
      winBy: m.win_by,
      pointsCap: m.points_cap,
    },
    initialServerSide: m.initial_server_side as Side | null,
    side1RightCourtSlot: m.side1_right_court_slot as Slot | null,
    side2RightCourtSlot: m.side2_right_court_slot as Slot | null,
    gameStarts: (bundle.value?.gameStarts ?? []).map(g => ({
      gameNumber: g.game_number,
      serverSlot: g.server_slot as Slot | null,
      side1RightCourtSlot: g.side1_right_court_slot as Slot | null,
      side2RightCourtSlot: g.side2_right_court_slot as Slot | null,
    })),
  }
  return deriveMatch(config, (bundle.value?.rallies ?? []).map(r => ({
    idx: r.idx,
    winnerSide: r.winner_side as Side | null,
    isLet: r.is_let,
    isHighlight: r.is_highlight,
    scoredByPlayerId: r.scored_by_player_id,
    endedAtSeconds: Number(r.ended_at_seconds),
  })))
})

const highlightCount = computed(
  () => derived.value?.rallyStates.filter(r => r.isHighlight).length ?? 0,
)
</script>

<template>
  <div v-if="match" data-testid="public-match">
    <h1 class="text-2xl font-bold">
      {{ match.title }}
    </h1>
    <p class="mt-1 text-sm text-slate-400">
      {{ match.played_on || 'Date unknown' }} · {{ match.format }}{{ match.venue ? ` · ${match.venue}` : '' }}
    </p>

    <div v-if="match.youtube_video_id" class="mt-6 aspect-video w-full overflow-hidden rounded">
      <iframe
        class="h-full w-full"
        :src="`https://www.youtube.com/embed/${match.youtube_video_id}`"
        title="Match video"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>

    <div class="mt-6 rounded border border-slate-800 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="font-medium">{{ sideNames[1] }}</span>
        <span data-testid="public-score" class="font-mono text-lg tabular-nums">
          {{ derived?.games.map(g => `${g.score[0]}-${g.score[1]}`).join('  ') || '—' }}
        </span>
        <span class="font-medium">{{ sideNames[2] }}</span>
      </div>
      <p v-if="derived?.complete && derived.matchWinnerSide" class="mt-2 text-center text-sm text-emerald-400">
        Winner: {{ sideNames[derived.matchWinnerSide] }}
      </p>
      <p data-testid="public-counts" class="mt-2 text-center text-xs text-slate-500">
        {{ derived?.rallyStates.length ?? 0 }} rallies · {{ highlightCount }} highlights
      </p>
    </div>
  </div>
  <p v-else data-testid="public-notfound" class="text-slate-400">
    Match not found.
  </p>
</template>
