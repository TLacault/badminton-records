<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, RallyInput, Side, Slot } from '~~/shared/badminton'
import type { PlayerInfoSource } from '~/utils/players'
import { Pencil, RotateCcw } from '@lucide/vue'
import { currentRallyAt } from '~~/shared/badminton'
import { youtubeTitle } from '~/utils/matchSummary'

// `wide` drops the admin layout's max-width: tagging wants every pixel it can
// get for the point list.
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true })

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`tag-${matchId}`, async () => {
  const [match, participants, rallies, setStarts, breaks] = await Promise.all([
    client.from('matches').select('*, match_types(label)').eq('id', matchId).maybeSingle(),
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

/**
 * The name this recording should be uploaded under.
 *
 * Built from the roster once the opponents are set, and otherwise left as the
 * name it was imported with — a half-filled match should not lose the only
 * title it has. This is the one screen that shows the stored title at all: it
 * is where the title gets written, rather than read.
 */
const uploadTitle = computed(() => {
  const row = match.value
  if (!row) return { text: '', generated: false }
  const summary = {
    title: row.title,
    format: row.format,
    match_players: (bundle.value?.participants ?? []).map(p => ({
      slot: p.slot,
      players: p.players,
    })),
  }
  const text = youtubeTitle(summary, row.match_types?.label)
  return { text, generated: text !== row.title }
})

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
 * first point recorded makes the match `in_progress`, and it turns `tagged` the
 * moment the scoring engine says a side has won the sets it needed — two of
 * three, three of five, whatever the match's own rules say.
 *
 * `untagged` is a starting state, not one a match returns to. Undoing back to
 * an empty log, or wiping the match with Reset, leaves it `in_progress`: the
 * edit is under way, it just has nothing to show yet. Anything else would flip
 * the public chip off and on as the admin works.
 */
const taggingStatus = computed<'untagged' | 'in_progress' | 'tagged'>(() => {
  if (session.derived.value.complete) return 'tagged'
  if (session.rallies.value.length) return 'in_progress'
  return match.value?.tagging_status === 'untagged' ? 'untagged' : 'in_progress'
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
  pause: () => void
  changeVolume: (delta: number) => number
  stepRate: (direction: 1 | -1) => number
  setRate: (rate: number) => number
  toggleFullscreen: () => void
  wake: () => void
  enterNativeMode: () => void
  currentTime: number
  duration: number
  isPlaying: boolean
  rate: number
  rates: number[]
  quality: string | null
} | null>(null)

/** Timeline clicks resume playback: you clicked because you want to watch it. */
function seekAndPlay(seconds: number) {
  stage.value?.seekTo(seconds)
  stage.value?.play()
}

const currentTime = computed(() => stage.value?.currentTime ?? 0)
const duration = computed(() => stage.value?.duration ?? 0)
const playback = useMatchPlayback(session.derived, currentTime)

/**
 * The point being watched — the one the list highlights and the one every
 * editing key acts on. Past the last point recorded, which is where tagging
 * live always sits, that is the last point recorded.
 */
const currentRallyIdx = computed(() => playback.value.rally?.idx ?? null)

const { actionFor } = useKeybinds()

const scoreboard = useScoreboardMode()
const timeline = usePlayerTimeline()
const nav = useMatchNavigation(
  computed(() => session.derived.value),
  computed(() => session.breaks.value),
  currentTime,
)
const playerKeys = usePlayerKeys({
  toggle: () => stage.value?.toggle(),
  pause: () => stage.value?.pause(),
  seekBy: delta => stage.value?.seekBy(delta),
  seekTo: seconds => seekAndPlay(seconds),
  changeVolume: delta => stage.value?.changeVolume(delta) ?? 0,
  stepRate: direction => stage.value?.stepRate(direction) ?? 1,
  toggleFullscreen: () => stage.value?.toggleFullscreen(),
  jump: {
    prevPoint: nav.prevPoint,
    nextPoint: nav.nextPoint,
    prevSet: nav.prevSet,
    nextSet: nav.nextSet,
    prevHighlight: nav.prevHighlight,
    nextHighlight: nav.nextHighlight,
  },
  wake: () => stage.value?.wake(),
})

/**
 * Throw away the recording and tag the match again from the first point.
 *
 * Only what was captured while watching goes: the rally log and the breaks.
 * The match itself is untouched — roster, venue, type, scoring rules, who
 * served first and which half of the court is ours were all decided before a
 * single point was tagged, and having to enter them again to fix a mistagged
 * first set was the reason this button was frightening to press.
 *
 * `tagging_status` is left alone too: a match being re-tagged is being edited,
 * and the reload below settles it to `in_progress`.
 */
const resetting = ref(false)

async function resetMatch() {
  const confirmed = confirm(
    'Clear every point and break tagged on this match and start the recording '
    + 'over? The roster, scoring rules, type and video all stay. This cannot '
    + 'be undone.',
  )
  if (!confirmed) return

  resetting.value = true
  await Promise.all([
    client.from('rallies').delete().eq('match_id', matchId),
    client.from('match_breaks').delete().eq('match_id', matchId),
  ])

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
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return

  // Playback, volume, fullscreen and the overlays are the same everywhere, so
  // they are handled once, in one place, and this page only keeps what is
  // genuinely about tagging.
  if (playerKeys.handle(event)) return

  const action = actionFor(event)
  if (!action) return

  event.preventDefault()
  const time = stage.value?.getTime() ?? 0
  // Resolved from the player's own clock rather than from `currentRallyIdx`,
  // which trails it by up to a frame: the same rally in all but the instant a
  // point turns over, and that instant is exactly when a key gets pressed.
  const watched = currentRallyAt(session.derived.value, time)?.idx ?? null

  /** Editing keys act on the point on screen; with none, they do nothing. */
  function onWatched(fn: (idx: number) => void) {
    if (watched !== null) fn(watched)
  }

  switch (action) {
    case 'pointUs': session.addRally(1, time); break
    case 'pointThem': session.addRally(2, time); break
    case 'let': session.addLet(time); break
    case 'highlight': onWatched(idx => session.toggleHighlight(idx)); break
    case 'break': session.endBreak(time); break
    case 'scorer1': onWatched(idx => session.setScorer(idx, slotToPlayerId.value[1] ?? null)); break
    case 'scorer2': onWatched(idx => session.setScorer(idx, slotToPlayerId.value[2] ?? null)); break
    case 'scorer3': onWatched(idx => session.setScorer(idx, slotToPlayerId.value[3] ?? null)); break
    case 'scorer4': onWatched(idx => session.setScorer(idx, slotToPlayerId.value[4] ?? null)); break
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
    <!-- The exception to the rule that the stored title is never shown: this
         is the screen where it gets decided, so it leads. -->
    <TaggingTitleBar
      class="mb-5"
      :title="uploadTitle.text"
      :generated="uploadTitle.generated"
      :type-label="match.match_types?.label ?? null"
      :info-fields="match.player_info_fields ?? []"
    />

    <div class="flex items-center justify-between">
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
          title="Clear every point and break tagged, and record this match again"
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
          @nudge="playerKeys.nudge"
          :video-id="match.youtube_video_id"
          restore-focus
        >
          <template #overlay="{ chromeVisible, isFullscreen }">
            <PlayerScoreBoard
              v-if="scoreboard.visible.value"
              :playback="playback"
              :derived="session.derived.value"
              :names="names"
              :side-labels="sideLabels"
              :clubs="clubs"
              :format="(match.format as MatchFormat)"
            />

            <PlayerStageChrome
              keybind-scope="all"
              :chrome-visible="chromeVisible"
              :is-fullscreen="isFullscreen"
              :is-playing="stage?.isPlaying ?? false"
              :current-time="currentTime"
              :duration="duration"
              :rate="stage?.rate ?? 1"
              :rates="stage?.rates ?? [1]"
              :quality="stage?.quality ?? null"
              :timeline-visible="timeline.visible.value"
              :volume-flash="playerKeys.volumeFlash.value"
              :rate-flash="playerKeys.rateFlash.value"
              :seek-flash="playerKeys.seekFlash.value"
              :jump-flash="playerKeys.jumpFlash.value"
              @toggle="stage?.toggle()"
              @toggle-fullscreen="stage?.toggleFullscreen()"
              @set-rate="value => stage?.setRate(value)"
              @native-controls="stage?.enterNativeMode()"
            >
              <template #timeline>
                <PlayerMatchTimeline
                  overlay
                  :derived="session.derived.value"
                  :duration="duration"
                  :current-time="currentTime"
                  :breaks="session.breaks.value"
                  :video-id="match.youtube_video_id"
                  @seek="seekAndPlay"
                />
              </template>
            </PlayerStageChrome>
          </template>
        </PlayerYouTubeStage>
        <PlayerMatchTimeline
          class="mt-3"
          :derived="session.derived.value"
          :duration="duration"
          :current-time="currentTime"
          :breaks="session.breaks.value"
          :video-id="match.youtube_video_id"
          @seek="seekAndPlay"
        />
        <p
          v-if="session.openBreak.value"
          data-testid="break-open"
          class="mt-2 rounded-lg border border-accent/35 bg-accent-soft px-3 py-1.5 text-xs text-accent"
        >
          Break left open since {{ Math.floor(session.openBreak.value.startsAtSeconds / 60) }}m —
          press the break key where play resumes to close it.
        </p>
        <PlayerMarkerNavigator
          class="mt-4"
          :derived="session.derived.value"
          :current-time="currentTime"
          :breaks="session.breaks.value"
          @seek="(s: number) => stage?.seekTo(s)"
        />
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
        :breaks="session.breaks.value"
        :derived="session.derived.value"
        :names="names"
        :slot-to-player-id="slotToPlayerId"
        :current-idx="currentRallyIdx"
        :last-inserted="session.lastInserted.value"
        @seek="(s: number) => stage?.seekTo(s)"
        @flip="session.flipWinner"
        @toggle-let="session.toggleLet"
        @toggle-highlight="session.toggleHighlight"
        @set-scorer="session.setScorer"
        @set-timestamp="session.setTimestamp"
        @delete="session.deleteRally"
        @set-break-time="session.setBreakTime"
        @delete-break="session.deleteBreak"
      />
    </div>
  </div>
  <p v-else class="text-slate-400">
    Match not found.
  </p>
</template>
