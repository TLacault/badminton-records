<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import type { PlayerInfoSource } from '~/utils/players'
import type { ListRow } from '~/utils/videoFilters'
import { ArrowLeft } from '@lucide/vue'
import { deriveMatch } from '~~/shared/badminton'
import { LIST_SELECT } from '~/utils/matchSummary'
import { decorate } from '~/utils/videoFilters'

const { t, bcp47 } = useI18n()

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`match-${matchId}`, async () => {
  const [match, participants, rallies, setStarts, breaks] = await Promise.all([
    client.from('matches').select('*, match_types(label)').eq('id', matchId).maybeSingle(),
    client.from('match_players')
      .select('slot, player_id, players(*)').eq('match_id', matchId),
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

const slotToPlayerId = computed<Record<number, string | null>>(() => {
  const out: Record<number, string | null> = {}
  for (const p of bundle.value?.participants ?? []) out[p.slot] = p.player_id
  return out
})

/** Roster rows by id, so the details table can print club, rank and the rest. */
const playerRows = computed<Record<string, PlayerInfoSource>>(() => {
  const out: Record<string, PlayerInfoSource> = {}
  for (const p of bundle.value?.participants ?? []) {
    const player = p.players as RosterRow | null
    if (player) out[p.player_id] = player
  }
  return out
})

/** Club per slot, for the acronym tags on the scoreboard. */
const clubs = computed<Record<number, string | null>>(() => {
  const out: Record<number, string | null> = {}
  for (const p of bundle.value?.participants ?? []) {
    out[p.slot] = (p.players as RosterRow | null)?.club ?? null
  }
  return out
})

const sideNames = computed<Record<number, string>>(() => ({
  1: [names.value[1], names.value[2]].filter(Boolean).join(' & ') || 'Us',
  2: [names.value[3], names.value[4]].filter(Boolean).join(' & ') || 'Opponents',
}))

/** First names only, for the scoreboard and the side columns. */
const sideLabels = computed<Record<number, string>>(() => {
  const first = (slot: number) => names.value[slot]?.split(' ')[0]
  const side = (a: number, b: number, fallback: string) => {
    const both = [first(a), first(b)].filter(Boolean)
    return both.length ? both.join(' & ') : fallback
  }
  return { 1: side(1, 2, 'Us'), 2: side(3, 4, 'Opponents') }
})

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
    setStarts: (bundle.value?.setStarts ?? []).map(g => ({
      setNumber: g.set_number,
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

const breaks = computed<BreakInput[]>(() =>
  (bundle.value?.breaks ?? []).map(b => ({
    idx: b.idx,
    startsAtSeconds: Number(b.starts_at_seconds),
    endsAtSeconds: b.ends_at_seconds === null ? null : Number(b.ends_at_seconds),
  })),
)

// defineExpose wraps its object in proxyRefs, so these read as plain values
// here while staying reactive.
const stage = ref<{
  currentTime: number
  duration: number
  isFullscreen: boolean
  seekTo: (s: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  seekBy: (delta: number) => void
  changeVolume: (delta: number) => number
  stepRate: (direction: 1 | -1) => number
  setRate: (rate: number) => number
  toggleFullscreen: () => void
  wake: () => void
  enterNativeMode: () => void
  isPlaying: boolean
  rate: number
  rates: number[]
  quality: string | null
} | null>(null)

/**
 * Timeline clicks resume playback. Jumping to a point and then having to press
 * play is a wasted step — you clicked because you want to watch it.
 */
function seekAndPlay(seconds: number) {
  stage.value?.seekTo(seconds)
  stage.value?.play()
}

const currentTime = computed(() => stage.value?.currentTime ?? 0)
const playbackDuration = computed(() => stage.value?.duration ?? 0)
const playback = useMatchPlayback(derived, currentTime)

const { revealed, reveal } = useResultReveal(matchId)

const scoreboard = useScoreboardMode()
const timeline = usePlayerTimeline()
const nav = useMatchNavigation(derived, computed(() => breaks.value ?? []), currentTime)
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
 * Shortcuts are only shortcuts when nothing is being typed into — Space in a
 * search box must stay a space. `isContentEditable` covers the rest.
 */
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
  playerKeys.handle(event)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/**
 * Only a finished match has something to give away. A half-tagged one shows
 * its panel plainly — hiding a result that does not exist yet is theatre.
 */
const spoilable = computed(() => Boolean(derived.value?.complete && derived.value.matchWinnerSide))
const detailsVisible = computed(() => revealed.value || !spoilable.value)

/**
 * The timeline speaks in two colours. Colour alone is never allowed to carry
 * the meaning, so the same information is written out underneath it.
 */
const legend = computed(() => [
  { key: 'us', swatch: 'bg-us', label: `Point for ${sideLabels.value[1]}` },
  { key: 'them', swatch: 'bg-them', label: `Point for ${sideLabels.value[2]}` },
  { key: 'highlight', swatch: 'bg-accent shadow-[0_0_8px_var(--ui-accent)]', label: t('player.highlight') },
  { key: 'break', swatch: 'bg-bg-deep border border-line-strong', label: t('player.break') },
])

/**
 * Three more to watch. Same day first — a session is watched as a session —
 * then the newest of everything else, so the feed is never empty on a match
 * that was filmed alone.
 */
const { data: feed } = await useAsyncData(`feed-${matchId}`, async () => {
  const { data } = await client
    .from('matches')
    .select(LIST_SELECT)
    .eq('visibility', 'public')
    .neq('id', matchId)
    .order('played_on', { ascending: false, nullsFirst: false })
    .limit(24)
  return (data ?? []) as unknown as ListRow[]
})

const upNext = computed(() => {
  const entries = decorate(feed.value ?? [])
  const sameDay = entries.filter(e => e.row.played_on && e.row.played_on === match.value?.played_on)
  const rest = entries.filter(e => !sameDay.includes(e))
  return [...sameDay, ...rest].slice(0, 3)
})

const typeLabel = computed(() =>
  (match.value?.match_types as { label: string } | null)?.label ?? null,
)

useSeoMeta({
  // The fixture, like every other place the match is named — the browser tab
  // was the last hiding place of the YouTube upload title. The brand half is
  // added by the titleTemplate in app.vue.
  title: () => (match.value
    ? `${sideNames.value[1]} vs ${sideNames.value[2]}`
    : 'Match'),
  description: () =>
    match.value
      ? `${formatDateShort(match.value.played_on, bcp47.value, t('common.undated'))} · ${match.value.format}${match.value.venue ? ` · ${match.value.venue}` : ''}`
      : '',
})
</script>

<template>
  <div v-if="match" data-testid="public-match">
    <NuxtLink
      to="/videos"
      class="flex w-fit min-h-9 items-center gap-2 rounded-lg font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-200 hover:text-accent"
    >
      <ArrowLeft :size="14" aria-hidden="true" />
      {{ $t('match.allVideos') }}
    </NuxtLink>

    <MatchHeader
      class="mt-4"
      :match-id="match.id"
      :side-names="sideNames"
      :derived="derived"
      :type-label="typeLabel"
      :format="match.format"
      :played-on="match.played_on"
      :venue="match.venue"
      :duration-seconds="match.youtube_duration_seconds"
      :revealed="revealed"
      @reveal="reveal"
    />

    <div class="mt-6">
      <PlayerYouTubeStage
        ref="stage"
        :video-id="match.youtube_video_id"
      >
        <template #overlay="{ chromeVisible, isFullscreen }">
          <PlayerScoreBoard
            v-if="scoreboard.visible.value"
            :playback="playback"
            :derived="derived"
            :names="names"
            :side-labels="sideLabels"
            :clubs="clubs"
            :format="(match.format as MatchFormat)"
          />

          <PlayerStageChrome
            :chrome-visible="chromeVisible"
            :is-fullscreen="isFullscreen"
            :is-playing="stage?.isPlaying ?? false"
            :current-time="currentTime"
            :duration="playbackDuration"
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
                :derived="derived"
                :duration="playbackDuration"
                :current-time="currentTime"
                :breaks="breaks"
                @seek="seekAndPlay"
              />
            </template>
          </PlayerStageChrome>
        </template>
      </PlayerYouTubeStage>

      <!-- The same timeline again, under the video, for reading rather than
           reaching: in a window there is room for it, and it stays put while
           the overlay comes and goes with the cursor. -->
      <PlayerMatchTimeline
        class="mt-4"
        :derived="derived"
        :duration="playbackDuration"
        :current-time="currentTime"
        :breaks="breaks"
        @seek="seekAndPlay"
      />

      <ul class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-subtle">
        <li v-for="item in legend" :key="item.key" class="inline-flex items-center gap-1.5">
          <span class="size-2.5 rounded-sm" :class="item.swatch" aria-hidden="true" />
          {{ item.label }}
        </li>
      </ul>

      <!--
        The same panel the tagger gets, scoped to what a viewer can act on:
        the shortcuts here are theirs to change too, and this is the only place
        that says what they are now that the in-player sheet is gone.
      -->
      <PlayerKeyHelp scope="player" class="mt-4" />
    </div>

    <div class="mt-8 rounded-2xl p-5 glass sm:p-6">
      <h2 class="label">
        {{ $t('match.jumpTo') }}
      </h2>
      <PlayerMarkerNavigator
        class="mt-4"
        :derived="derived"
        :current-time="currentTime"
        :breaks="breaks"
        @seek="(s) => stage?.seekTo(s)"
      />
    </div>

    <MatchDetails
      class="mt-6"
      :derived="derived"
      :breaks="breaks"
      :format="(match.format as MatchFormat)"
      :names="names"
      :side-labels="sideLabels"
      :slot-to-player-id="slotToPlayerId"
      :player-rows="playerRows"
      :player-info-fields="match.player_info_fields ?? []"
      :revealed="detailsVisible"
      @reveal="reveal"
    />

    <section v-if="upNext.length" class="mt-8">
      <h2 class="label">
        {{ $t('match.upNext') }}
      </h2>
      <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="other in upNext" :key="other.row.id">
          <VideoMatchCard :entry="other" />
        </li>
      </ul>
    </section>
  </div>

  <div v-else class="py-20 text-center">
    <p data-testid="public-notfound" class="font-display text-3xl font-bold uppercase tracking-wide text-ink">
      {{ $t('match.notFound') }}
    </p>
    <p class="mt-3 text-ink-muted">
      {{ $t('match.notFoundHint') }}
    </p>
    <NuxtLink to="/videos" class="btn btn-primary mt-7">
      <ArrowLeft :size="16" aria-hidden="true" />
      {{ $t('match.backToVideos') }}
    </NuxtLink>
  </div>
</template>
