<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import { ChevronLeft, ChevronRight, Star, Trophy } from '@lucide/vue'
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
    format: m.format as MatchFormat,
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

// defineExpose wraps its object in proxyRefs, so these read as plain values
// here while staying reactive.
const stage = ref<{
  currentTime: number
  duration: number
  seekTo: (s: number) => void
} | null>(null)

const currentTime = computed(() => stage.value?.currentTime ?? 0)
const duration = computed(() => stage.value?.duration ?? 0)
const playback = useMatchPlayback(derived, currentTime)

type Mode = 'points' | 'sets' | 'highlights'
const mode = ref<Mode>('points')

interface Marker { key: string, label: string, sub: string, time: number }

function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** What the prev/next buttons and the list step through, per mode. */
const markers = computed<Marker[]>(() => {
  const states = derived.value?.rallyStates ?? []
  if (mode.value === 'sets') {
    return (derived.value?.games ?? [])
      .filter(g => g.firstRallyIdx !== null)
      .map((g) => {
        const first = states.find(s => s.idx === g.firstRallyIdx)
        return {
          key: `g${g.number}`,
          label: `Game ${g.number}`,
          sub: `${g.score[0]}–${g.score[1]}`,
          time: first?.startsAtSeconds ?? 0,
        }
      })
  }
  const source = mode.value === 'highlights' ? states.filter(s => s.isHighlight) : states
  return source.map(s => ({
    key: `r${s.idx}`,
    label: `${s.scoreAfter[0]}–${s.scoreAfter[1]}`,
    sub: formatClock(s.startsAtSeconds),
    time: s.startsAtSeconds,
  }))
})

/** Index of the marker currently playing — the last one already started. */
const activeMarker = computed(() => {
  let found = -1
  markers.value.forEach((m, i) => {
    if (m.time <= currentTime.value + 0.25) found = i
  })
  return found
})

function jumpTo(index: number) {
  const marker = markers.value[index]
  if (marker) stage.value?.seekTo(marker.time)
}
function previous() {
  jumpTo(Math.max(0, activeMarker.value - 1))
}
function next() {
  jumpTo(Math.min(markers.value.length - 1, activeMarker.value + 1))
}

const modes: Array<{ id: Mode, label: string }> = [
  { id: 'points', label: 'Points' },
  { id: 'sets', label: 'Sets' },
  { id: 'highlights', label: 'Highlights' },
]

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
      {{ formatDate(match.played_on) }} · {{ match.format
      }}{{ match.venue ? ` · ${match.venue}` : '' }}
    </p>

    <div class="mt-6">
      <PlayerYouTubeStage
        ref="stage"
        :video-id="match.youtube_video_id"
        :show-controls="true"
      >
        <template #overlay>
          <PlayerScoreOverlay
            :playback="playback"
            :names="names"
            :format="(match.format as MatchFormat)"
          />
        </template>
      </PlayerYouTubeStage>

      <PlayerMatchTimeline
        class="mt-3"
        :derived="derived"
        :duration="duration"
        :current-time="currentTime"
        @seek="(s) => stage?.seekTo(s)"
      />
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <div data-testid="mode-switch" class="inline-flex rounded border border-slate-800 p-0.5">
        <button
          v-for="m in modes"
          :key="m.id"
          class="rounded px-3 py-1 text-sm"
          :class="mode === m.id ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button
          data-testid="marker-prev"
          class="rounded bg-slate-800 p-1.5 hover:bg-slate-700 disabled:opacity-40"
          :disabled="activeMarker <= 0"
          title="Previous"
          @click="previous"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          data-testid="marker-next"
          class="rounded bg-slate-800 p-1.5 hover:bg-slate-700 disabled:opacity-40"
          :disabled="activeMarker >= markers.length - 1"
          title="Next"
          @click="next"
        >
          <ChevronRight :size="16" />
        </button>
      </div>

      <span class="text-sm text-slate-500">
        {{ markers.length }} {{ mode }}
      </span>
    </div>

    <ul
      v-if="markers.length"
      data-testid="marker-list"
      class="mt-3 flex flex-wrap gap-1.5"
    >
      <li v-for="(m, i) in markers" :key="m.key">
        <button
          class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs tabular-nums"
          :class="i === activeMarker
            ? 'border-emerald-500 bg-emerald-950 text-emerald-200'
            : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-100'"
          @click="jumpTo(i)"
        >
          <Star v-if="mode === 'highlights'" :size="11" class="fill-amber-400 text-amber-400" />
          <span class="font-medium">{{ m.label }}</span>
          <span class="text-slate-500">{{ m.sub }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="mt-3 text-sm text-slate-500">
      No {{ mode }} tagged for this match yet.
    </p>

    <div class="mt-6 rounded border border-slate-800 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="font-medium">{{ sideNames[1] }}</span>
        <span data-testid="public-score" class="font-mono text-lg tabular-nums">
          {{ derived?.games.map(g => `${g.score[0]}-${g.score[1]}`).join('  ') || '—' }}
        </span>
        <span class="font-medium">{{ sideNames[2] }}</span>
      </div>
      <p
        v-if="derived?.complete && derived.matchWinnerSide"
        class="mt-2 flex items-center justify-center gap-1.5 text-sm text-emerald-400"
      >
        <Trophy :size="14" /> Winner: {{ sideNames[derived.matchWinnerSide] }}
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
