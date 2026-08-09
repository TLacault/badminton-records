<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, RallyInput, Side, Slot } from '~~/shared/badminton'
import type { PlayerInfoSource } from '~/utils/players'
import { Pencil, RotateCcw } from '@lucide/vue'

// `wide` drops the admin layout's max-width: tagging wants every pixel it can
// get for the point list.
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true })

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`tag-${matchId}`, async () => {
  const [match, participants, rallies, setStarts, breaks] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).maybeSingle(),
    client.from('match_players')
      .select('slot, player_id, players(*)')
      .eq('match_id', matchId),
    client.from('rallies').select('*').eq('match_id', matchId).order('idx'),
    client.from('match_set_starts').select('*').eq('match_id', matchId),
    client.from('match_breaks').select('*').eq('match_id', matchId).order('idx'),
  ])
  return {
    match: match.data,
    participants: participants.data ?? [],
    rallies: rallies.data ?? [],
    setStarts: setStarts.data ?? [],
    breaks: breaks.data ?? [],
  }
})

const match = computed(() => bundle.value?.match ?? null)

type RosterRow = PlayerInfoSource & { first_name: string, last_name: string }

const names = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) {
    const player = p.players as RosterRow | null
    out[p.slot] = player ? `${player.first_name} ${player.last_name}` : `Slot ${p.slot}`
  }
  return out
})

const slotToPlayerId = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) out[p.slot] = p.player_id
  return out
})

/** First names only, for the scoreboard and the side columns. */
const sideLabels = computed<Record<number, string>>(() => {
  const first = (slot: number) => names.value[slot]?.split(' ')[0]
  const side = (a: number, b: number, fallback: string) => {
    const both = [first(a), first(b)].filter(Boolean)
    return both.length ? both.join(' & ') : fallback
  }
  return { 1: side(1, 2, 'Us'), 2: side(3, 4, 'Opponents') }
})

/** Club per slot, for the acronym tags on the scoreboard. */
const clubs = computed<Record<number, string | null>>(() => {
  const out: Record<number, string | null> = {}
  for (const p of bundle.value?.participants ?? []) {
    out[p.slot] = (p.players as RosterRow | null)?.club ?? null
  }
  return out
})

/** Roster rows by id, for the personal details in the match panel. */
const playerRows = computed<Record<string, PlayerInfoSource>>(() => {
  const out: Record<string, PlayerInfoSource> = {}
  for (const p of bundle.value?.participants ?? []) {
    const player = p.players as RosterRow | null
    if (player) out[p.player_id] = player
  }
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
  setStarts: (bundle.value?.setStarts ?? []).map(g => ({
    setNumber: g.set_number,
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
  play: () => void
  currentTime: number
  duration: number
} | null>(null)

/** Timeline clicks resume playback: you clicked because you want to watch it. */
function seekAndPlay(seconds: number) {
  stage.value?.seekTo(seconds)
  stage.value?.play()
}

const currentTime = computed(() => stage.value?.currentTime ?? 0)
const duration = computed(() => stage.value?.duration ?? 0)
const playback = useMatchPlayback(session.derived, currentTime)

const { actionFor } = useKeybinds()

/**
 * Start the match over.
 *
 * Everything the YouTube import supplied is kept — title, date, video id,
 * thumbnail, duration — because that is not ours to throw away and re-importing
 * will not bring it back for a video already known. Everything a human entered
 * or tagged goes: the rally log, the breaks, the set starts, the roster, the
 * scoring rules and the type all return to what a fresh match starts with,
 * including our half of the court.
 */
const resetting = ref(false)

async function resetMatch() {
  const confirmed = confirm(
    'Clear every tagged point, break and set start on this match, along with '
    + 'the roster, scoring rules and type? The video, title and date stay. '
    + 'This cannot be undone.',
  )
  if (!confirmed) return

  resetting.value = true
  await Promise.all([
    client.from('rallies').delete().eq('match_id', matchId),
    client.from('match_breaks').delete().eq('match_id', matchId),
    client.from('match_set_starts').delete().eq('match_id', matchId),
    client.from('match_players').delete().eq('match_id', matchId),
  ])

  await client.from('matches').update({
    venue: 'Talence',
    format: 'doubles',
    match_type_id: null,
    player_info_fields: [],
    best_of: 3,
    points_to_win: 15,
    win_by: 2,
    points_cap: 21,
    initial_server_side: null,
    side1_right_court_slot: null,
    side2_right_court_slot: null,
    tagging_status: 'untagged',
  }).eq('id', matchId)

  const { data: roster } = await client.from('players').select('id, first_name, last_name')
  const home = homePairSlots(roster ?? [])
  const rows = Object.entries(home).map(([slot, playerId]) => ({
    match_id: matchId,
    slot: Number(slot),
    player_id: playerId,
  }))
  if (rows.length) await client.from('match_players').insert(rows)

  // A full reload rather than a refetch: the tagging session still holds the
  // old rally log in memory, and its next autosave would write it all back.
  window.location.reload()
}

/**
 * Every key comes from the editable bindings, so nothing here assumes a
 * layout. The cheat sheet listens in the capture phase while it is waiting
 * for a key, which stops a rebind from also scoring a point.
 */
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

  const action = actionFor(event)
  if (!action) return

  event.preventDefault()
  const time = stage.value?.getTime() ?? 0

  switch (action) {
    case 'pointUs': session.addRally(1, time); break
    case 'pointThem': session.addRally(2, time); break
    case 'let': session.addLet(time); break
    case 'highlight': session.toggleHighlightOnLast(); break
    case 'break': session.toggleBreak(time); break
    case 'scorer1': session.setScorerOnLast(slotToPlayerId.value[1] ?? null); break
    case 'scorer2': session.setScorerOnLast(slotToPlayerId.value[2] ?? null); break
    case 'scorer3': session.setScorerOnLast(slotToPlayerId.value[3] ?? null); break
    case 'scorer4': session.setScorerOnLast(slotToPlayerId.value[4] ?? null); break
    case 'playPause': stage.value?.toggle(); break
    case 'seekBack': stage.value?.seekBy(-5); break
    case 'seekForward': stage.value?.seekBy(5); break
    case 'undo': session.undo(); break
    case 'redo': session.redo(); break
    case 'save': session.saveNow(); break
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
      <!-- No title: it is the YouTube upload name, it is long, and the video
           underneath already says which match this is. -->
      <VideoStatusBadge
        :tagging-status="taggingStatus"
        :visibility="match.visibility"
      />
      <div class="flex items-center gap-3 text-sm">
        <span
          data-testid="save-state"
          class="text-ink-subtle"
          :class="{ 'text-accent': session.saveState.value === 'error' }"
        >{{ saveLabel }}</span>
        <button
          data-testid="undo"
          class="btn btn-sm btn-ghost"
          :disabled="!session.canUndo.value"
          @click="session.undo()"
        >
          Undo
        </button>
        <button
          data-testid="redo"
          class="btn btn-sm btn-ghost"
          :disabled="!session.canRedo.value"
          @click="session.redo()"
        >
          Redo
        </button>
        <button
          data-testid="reset-match"
          type="button"
          class="btn btn-sm btn-ghost"
          :disabled="resetting"
          title="Clear every tag and start this match over"
          @click="resetMatch"
        >
          <RotateCcw :size="14" :class="resetting ? 'animate-spin' : ''" aria-hidden="true" />
          Reset
        </button>
        <NuxtLink data-testid="open-edit" :to="`/admin/matches/${matchId}`" class="btn btn-sm btn-primary">
          <Pencil :size="14" aria-hidden="true" />
          Edit match
        </NuxtLink>
      </div>
    </div>

    <!--
      The point list gets a generous fixed column and the video takes all the
      rest, so the rally is as large as the screen allows while the list it
      feeds stays fully readable beside it.
    -->
    <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42rem)]">
      <div>
        <PlayerYouTubeStage
          ref="stage"
          :video-id="match.youtube_video_id"
          restore-focus
        >
          <template #overlay>
            <PlayerScoreBoard
              :playback="playback"
              :derived="session.derived.value"
              :names="names"
              :side-labels="sideLabels"
              :clubs="clubs"
              :format="(match.format as MatchFormat)"
            />
          </template>
        </PlayerYouTubeStage>
        <PlayerMatchTimeline
          class="mt-3"
          :derived="session.derived.value"
          :duration="duration"
          :current-time="currentTime"
          :breaks="session.breaks.value"
          @seek="seekAndPlay"
        />
        <p
          v-if="session.openBreak.value"
          data-testid="break-open"
          class="mt-2 rounded-lg border border-accent/35 bg-accent-soft px-3 py-1.5 text-xs text-accent"
        >
          Break running since {{ Math.floor(session.openBreak.value.startsAtSeconds / 60) }}m —
          press the break key again to end it.
        </p>
        <PlayerMarkerNavigator
          class="mt-4"
          :derived="session.derived.value"
          :current-time="currentTime"
          :breaks="session.breaks.value"
          @seek="(s: number) => stage?.seekTo(s)"
        />
        <TaggingKeyHelp class="mt-4" />
        <MatchDetails
          class="mt-4"
          :derived="session.derived.value"
          :breaks="session.breaks.value"
          :format="(match.format as MatchFormat)"
          :names="names"
          :side-labels="sideLabels"
          :slot-to-player-id="slotToPlayerId"
          :player-rows="playerRows"
          :player-info-fields="match.player_info_fields ?? []"
        />
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
        @set-timestamp="session.setTimestamp"
        @delete="session.deleteRally"
      />
    </div>
  </div>
  <p v-else class="text-slate-400">
    Match not found.
  </p>
</template>
