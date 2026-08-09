<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, RallyInput, Side, Slot } from '~~/shared/badminton'

// `wide` drops the admin layout's max-width: tagging wants every pixel it can
// get for the point list.
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true })

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`tag-${matchId}`, async () => {
  const [match, participants, rallies, gameStarts, breaks] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).maybeSingle(),
    client.from('match_players')
      .select('slot, player_id, players(first_name, last_name)')
      .eq('match_id', matchId),
    client.from('rallies').select('*').eq('match_id', matchId).order('idx'),
    client.from('match_game_starts').select('*').eq('match_id', matchId),
    client.from('match_breaks').select('*').eq('match_id', matchId).order('idx'),
  ])
  return {
    match: match.data,
    participants: participants.data ?? [],
    rallies: rallies.data ?? [],
    gameStarts: gameStarts.data ?? [],
    breaks: breaks.data ?? [],
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

const slotToPlayerId = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) out[p.slot] = p.player_id
  return out
})

const config = computed<MatchConfig>(() => ({
  format: (match.value?.format ?? 'doubles') as MatchConfig['format'],
  rules: {
    bestOf: match.value?.best_of ?? 3,
    pointsToWin: match.value?.points_to_win ?? 21,
    winBy: match.value?.win_by ?? 2,
    pointsCap: match.value?.points_cap ?? 30,
  },
  initialServerSide: (match.value?.initial_server_side ?? null) as Side | null,
  side1RightCourtSlot: (match.value?.side1_right_court_slot ?? null) as Slot | null,
  side2RightCourtSlot: (match.value?.side2_right_court_slot ?? null) as Slot | null,
  gameStarts: (bundle.value?.gameStarts ?? []).map(g => ({
    gameNumber: g.game_number,
    serverSlot: g.server_slot as Slot | null,
    side1RightCourtSlot: g.side1_right_court_slot as Slot | null,
    side2RightCourtSlot: g.side2_right_court_slot as Slot | null,
  })),
}))

const initialRallies: RallyInput[] = (bundle.value?.rallies ?? []).map(r => ({
  idx: r.idx,
  winnerSide: r.winner_side as Side | null,
  isLet: r.is_let,
  isHighlight: r.is_highlight,
  scoredByPlayerId: r.scored_by_player_id,
  endedAtSeconds: Number(r.ended_at_seconds),
}))

const initialBreaks: BreakInput[] = (bundle.value?.breaks ?? []).map(b => ({
  idx: b.idx,
  startsAtSeconds: Number(b.starts_at_seconds),
  endsAtSeconds: b.ends_at_seconds === null ? null : Number(b.ends_at_seconds),
}))

const session = useTaggingSession(matchId, config, initialRallies, initialBreaks)

/**
 * Tagging progress is derived from the rally log, never tracked by hand: the
 * match is `tagged` once the scoring engine says it is complete.
 */
const taggingStatus = computed<'untagged' | 'in_progress' | 'tagged'>(() => {
  if (session.derived.value.complete) return 'tagged'
  return session.rallies.value.length ? 'in_progress' : 'untagged'
})

async function persistTaggingStatus(next: string) {
  await client.from('matches').update({ tagging_status: next }).eq('id', matchId)
  if (bundle.value?.match) bundle.value.match.tagging_status = next
}

// Reconcile once on open — the 0004 backfill guessed, and this is where the
// guess gets corrected — then follow every change for the rest of the session.
onMounted(() => {
  if (match.value && match.value.tagging_status !== taggingStatus.value) {
    persistTaggingStatus(taggingStatus.value)
  }
})
watch(taggingStatus, next => persistTaggingStatus(next))

// defineExpose wraps its object in proxyRefs, so currentTime/duration read as
// plain values here while staying reactive.
const stage = ref<{
  getTime: () => number
  toggle: () => void
  seekBy: (d: number) => void
  seekTo: (s: number) => void
  currentTime: number
  duration: number
} | null>(null)

const currentTime = computed(() => stage.value?.currentTime ?? 0)
const duration = computed(() => stage.value?.duration ?? 0)

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

  // Undo/redo first: the only bindings that use a modifier.
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      session.undo()
    }
    else if (key === 'y') {
      event.preventDefault()
      session.redo()
    }
    return
  }

  const time = stage.value?.getTime() ?? 0

  // Digits match on event.code: on AZERTY the unshifted digit row produces
  // & é " ' rather than 1 2 3 4. Numpad1-4 report their own codes and are
  // accepted alongside, so either hand works.
  const digit = event.code.startsWith('Digit')
    ? Number(event.code.slice(5))
    : event.code.startsWith('Numpad') ? Number(event.code.slice(6)) : Number.NaN
  if (!Number.isNaN(digit)) {
    if (digit >= 1 && digit <= 4) {
      event.preventDefault()
      session.setScorerOnLast(slotToPlayerId.value[digit] ?? null)
    }
    return
  }

  // Letters match on event.key: event.code reports physical position, so the
  // AZERTY A key would report KeyQ.
  switch (event.key.toLowerCase()) {
    case 'a':
      event.preventDefault()
      session.addRally(1, time)
      break
    case 'z':
      event.preventDefault()
      session.addRally(2, time)
      break
    case 'r':
      event.preventDefault()
      session.addLet(time)
      break
    case 'p':
      event.preventDefault()
      session.toggleHighlightOnLast()
      break
    case 'm':
      event.preventDefault()
      session.toggleBreak(time)
      break
    case ' ':
      event.preventDefault()
      stage.value?.toggle()
      break
    case 'arrowleft':
      event.preventDefault()
      stage.value?.seekBy(-5)
      break
    case 'arrowright':
      event.preventDefault()
      stage.value?.seekBy(5)
      break
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (session.dirty.value) event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
})

onBeforeRouteLeave(() => {
  if (!session.dirty.value) return true
  return confirm('You have unsaved tagging changes. Leave anyway?')
})

const saveLabel = computed(() => {
  if (session.saveState.value === 'saving') return 'Saving…'
  if (session.saveState.value === 'error') return `Save failed: ${session.saveError.value}`
  return session.dirty.value ? 'Unsaved' : 'Saved'
})
</script>

<template>
  <div v-if="match">
    <div class="flex items-center justify-between">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="truncate text-xl font-bold">
          {{ match.title }}
        </h1>
        <VideoStatusBadge
          :tagging-status="taggingStatus"
          :visibility="match.visibility"
        />
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span
          data-testid="save-state"
          class="text-slate-400"
          :class="{ 'text-amber-400': session.saveState.value === 'error' }"
        >{{ saveLabel }}</span>
        <button
          data-testid="undo"
          class="rounded bg-slate-800 px-3 py-1 disabled:opacity-40"
          :disabled="!session.canUndo.value"
          @click="session.undo()"
        >
          Undo
        </button>
        <button
          data-testid="redo"
          class="rounded bg-slate-800 px-3 py-1 disabled:opacity-40"
          :disabled="!session.canRedo.value"
          @click="session.redo()"
        >
          Redo
        </button>
        <button data-testid="save-now" class="rounded bg-emerald-600 px-3 py-1" @click="session.saveNow()">
          Save now
        </button>
      </div>
    </div>

    <!--
      The point list gets a generous fixed column and the video takes what is
      left, rather than the reverse: the video is already height-capped, so
      extra width past that cap would only pad it.
    -->
    <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42rem)]">
      <div>
        <PlayerYouTubeStage
          ref="stage"
          :video-id="match.youtube_video_id"
          restore-focus
        />
        <PlayerMatchTimeline
          class="mt-3"
          :derived="session.derived.value"
          :duration="duration"
          :current-time="currentTime"
          :breaks="session.breaks.value"
          @seek="(s: number) => stage?.seekTo(s)"
        />
        <p
          v-if="session.openBreak.value"
          data-testid="break-open"
          class="mt-2 rounded bg-amber-950 px-2 py-1 text-xs text-amber-300"
        >
          Break running since {{ Math.floor(session.openBreak.value.startsAtSeconds / 60) }}m —
          press <span class="font-mono font-semibold">M</span> again to end it.
        </p>
        <PlayerMarkerNavigator
          class="mt-4"
          :derived="session.derived.value"
          :current-time="currentTime"
          @seek="(s: number) => stage?.seekTo(s)"
        />
        <TaggingScoreBoard class="mt-4" :derived="session.derived.value" :names="names" />
        <TaggingKeyHelp class="mt-4" />
      </div>
      <TaggingPointList
        :rallies="session.rallies.value"
        :derived="session.derived.value"
        :names="names"
        :slot-to-player-id="slotToPlayerId"
        @seek="(s: number) => stage?.seekTo(s)"
        @flip="session.flipWinner"
        @toggle-let="session.toggleLet"
        @toggle-highlight="session.toggleHighlight"
        @set-scorer="session.setScorer"
        @delete="session.deleteRally"
      />
    </div>
  </div>
  <p v-else class="text-slate-400">
    Match not found.
  </p>
</template>
