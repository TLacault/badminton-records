<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import type { BoardState } from '~~/shared/publish'
import type { ReelBrand, ReelJob, ReelMusic, ReelProject } from '~~/shared/reel'
import { ArrowLeft, Clapperboard, Image as ImageIcon, Monitor, Music, Pencil, Scissors, Smartphone, Sparkles, Sliders, Undo2 } from '@lucide/vue'
import { deriveMatch } from '~~/shared/badminton'
import { boardAt, boardChanges, boardKey, cardText, clipTitle, defaultThumbnailLines, defaultTitle, familyOf, matchResult, sideName } from '~~/shared/publish'
import {
  clipFromRally,
  clipsFromHighlights,
  bookendSeconds,
  projectFileName,
  showsScoreboard,
  timeline,
  totalDuration,
} from '~~/shared/reel'

/**
 * The clip maker for one match: a vertical (Shorts / Reels / Stories) or a
 * landscape highlights cut.
 *
 * A match is already tagged rally by rally, and the good ones are already
 * starred — which means the compilation nobody wanted to sit down and edit is
 * mostly already described. This page turns that description into a film: the
 * highlights become clips, a song is fetched and trimmed to fit them, and
 * ffmpeg cuts the mp4.
 *
 * Everything on screen is one project object. Preview, ribbon, panels and
 * export all read it and nothing else, so what you are watching and what would
 * be rendered cannot come apart.
 */

definePageMeta({ middleware: 'admin', layout: 'admin', wide: true })

const { t } = useI18n()
const client = useSupabaseClient<Database>()
const route = useRoute()
const matchId = route.params.id as string

const { project, patch, addClips, updateClip, removeClip, moveClip, sortClips, undo, canUndo, download: saveProject, openFile } = useReelProject(matchId)
const { caps, canRender, refresh: refreshCapabilities } = useReelCapabilities()

const videoId = computed(() => project.value.videoId)
const source = useReelSource(videoId)
const music = useReelMusic(project, patch)
const renderJob = useReelJob()

const selectedId = ref<string | null>(null)
const tab = ref<'clips' | 'music' | 'look' | 'thumbnail' | 'export'>('clips')
const stage = ref<{
  position: number
  duration: number
  playing: boolean
  index: number
  seek: (seconds: number, options?: { keepPlaying?: boolean }) => void
  goToPiece: (index: number) => void
  toggle: () => void
  pause: () => void
} | null>(null)

// ── The match ───────────────────────────────────────────────────────────────

const { data: bundle } = await useAsyncData(`clip-${matchId}`, async () => {
  const [match, participants, rallies, setStarts, breaks] = await Promise.all([
    client.from('matches').select('*, match_types(slug, label)').eq('id', matchId).maybeSingle(),
    client.from('match_players').select('slot, player_id, players(*)').eq('match_id', matchId),
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

const info = computed(() => (bundle.value?.match ? matchInfoFrom(bundle.value.match, bundle.value.participants) : null))
const family = computed(() => (info.value ? familyOf(info.value) : null))

// The project follows its match: the video and the title come from the row,
// whatever a saved draft or an opened file said. Assigned, not patched, so it is not an undo step.
onMounted(() => {
  const m = bundle.value?.match
  if (!m || !info.value || !family.value) return
  const title = defaultTitle(info.value, family.value.id)
  const name = clipTitle(info.value, family.value.id)
  // The name follows the generated one until someone renames it (an older draft
  // was named after the YouTube title).
  const untouched = !project.value.clips.length || [project.value.matchTitle, title].includes(project.value.name)
  if (project.value.videoId !== m.youtube_video_id || project.value.matchTitle !== title || (untouched && project.value.name !== name)) {
    project.value = {
      ...project.value,
      videoId: m.youtube_video_id,
      matchTitle: title,
      name: untouched ? name : project.value.name,
    }
  }
})

const derived = computed(() => {
  const match = bundle.value?.match
  if (!match) return null
  const config: MatchConfig = {
    format: match.format as MatchFormat,
    rules: {
      bestOf: match.best_of,
      pointsToWin: match.points_to_win,
      winBy: match.win_by,
      pointsCap: match.points_cap,
    },
    initialServerSide: match.initial_server_side as Side | null,
    side1RightCourtSlot: match.side1_right_court_slot as Slot | null,
    side2RightCourtSlot: match.side2_right_court_slot as Slot | null,
    setStarts: (bundle.value?.setStarts ?? []).map(s => ({
      setNumber: s.set_number,
      serverSlot: s.server_slot as Slot | null,
      side1RightCourtSlot: s.side1_right_court_slot as Slot | null,
      side2RightCourtSlot: s.side2_right_court_slot as Slot | null,
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

/** The video's own length: from the file if we have one, else from YouTube. */
const sourceDuration = computed(() =>
  source.duration.value || Number(bundle.value?.match?.youtube_duration_seconds ?? 0),
)

// ── Branding ────────────────────────────────────────────────────────────────

/**
 * The intro / outro (and, portrait, the frame) are drawn per match and
 * orientation by HyperFrames (brand/video/), from the same card text as the
 * YouTube intro. Drawn once and cached on the server; until then (or on a host
 * without HyperFrames) the preview shows black bands and no bookends.
 */
const brand = computed<ReelBrand | null>(() => {
  const i = info.value
  const f = family.value
  if (!i || !f || !derived.value) return null
  const card = cardText(i, f.id)
  const result = matchResult(derived.value)
  const sides = [sideName(i, 0).toUpperCase(), sideName(i, 1).toUpperCase()]
  return {
    colour: f.colour,
    frame: { tag: card.tag, event: card.event, detail: card.detail, place: card.place, s1: sides[0]!, s2: sides[1]! },
    intro: {
      tag: card.tag,
      event: card.event,
      detail: card.detail,
      s1a: (i.sides[0].full[0] ?? '').toUpperCase(),
      s1b: (i.sides[0].full[1] ?? '').toUpperCase(),
      s2a: (i.sides[1].full[0] ?? '').toUpperCase(),
      s2b: (i.sides[1].full[1] ?? '').toUpperCase(),
      place: card.place,
    },
    outro: {
      s1: sides[0]!,
      s2: sides[1]!,
      sets: result.sets.map(s => s.join('-')).join(','),
      winner: result.winner ? String(result.winner) : '',
      detail: [card.event, card.detail].filter(Boolean).join(' · '),
    },
  }
})

type Drawn = { frame: string | null, intro: string, outro: string }
const drawn = ref<Drawn | null>(null)
const drawing = ref(false)
const orientation = computed(() => project.value.orientation)
const details = computed(() => project.value.details[orientation.value])

async function draw() {
  drawn.value = null
  if (!brand.value || !caps.value?.render) return
  drawing.value = true
  const wanted = JSON.stringify([orientation.value, details.value])
  try {
    const result = await $fetch<Drawn>('/api/reel/brand', { method: 'POST', body: { ...brand.value, orientation: orientation.value, details: details.value } })
    // A switch while drawing leaves this answer for the other choice.
    if (wanted === JSON.stringify([orientation.value, details.value])) drawn.value = result
  }
  catch {
    drawn.value = null
  }
  finally {
    drawing.value = false
  }
}
watch([() => JSON.stringify(brand.value), () => caps.value?.render, orientation, () => JSON.stringify(details.value)], draw, { immediate: true })

const media = (kind: string, id: string | null | undefined) => (id ? `/api/reel/media/${kind}/${id}` : null)
const bookends = computed(() => (drawn.value ? bookendSeconds(orientation.value, details.value) : {}))

function toggleDetails(part: 'intro' | 'outro') {
  patch({ details: { ...project.value.details, [orientation.value]: { ...details.value, [part]: !details.value[part] } } })
}

// ── The edit ────────────────────────────────────────────────────────────────

const pieces = computed(() => timeline(project.value, bookends.value))
const filmSeconds = computed(() => totalDuration(project.value, bookends.value))

const clipPieces = computed(() => pieces.value.filter(p => p.kind === 'clip'))

function rebuild({ lead, tail }: { lead: number, tail: number }) {
  const states = derived.value?.rallyStates ?? []
  addClips(
    clipsFromHighlights(states, breaks.value, { lead, tail, duration: sourceDuration.value }),
    { replace: true },
  )
  selectedId.value = null
}

function addRally(idx: number) {
  const rally = derived.value?.rallyStates.find(s => s.idx === idx)
  if (!rally) return
  const clip = clipFromRally(rally, { duration: sourceDuration.value })
  addClips([clip])
  selectedId.value = clip.id
}

/** Selecting a clip parks the playhead on it: selection is also navigation. */
function select(id: string) {
  selectedId.value = id
  const at = pieces.value.findIndex(p => p.clip?.id === id)
  if (at >= 0) stage.value?.goToPiece(at)
}

function playClip(id: string) {
  select(id)
  if (!stage.value?.playing) stage.value?.toggle()
}

// ── Thumbnail ───────────────────────────────────────────────────────────────

/** The YouTube editor's 16:9 thumbnail, with HIGHLIGHTS; the template follows the match type. */
const thumbDefaults = computed(() => (info.value && family.value ? defaultThumbnailLines(info.value, family.value.id) : ['', '']))
const thumbLines = computed(() => [0, 1]
  .filter(i => project.value.thumbnail.show[i])
  .map(i => (project.value.thumbnail.lines[i] ?? thumbDefaults.value[i]!).toUpperCase())
  .filter(Boolean))
const thumbTemplate = computed(() => family.value?.template ?? 'jeux_libres.png')

function patchThumbnail(change: Partial<ReelProject['thumbnail']>) {
  patch({ thumbnail: { ...project.value.thumbnail, ...change } })
}

function thumbLine(i: 0 | 1, value: string) {
  const lines = [...project.value.thumbnail.lines] as ReelProject['thumbnail']['lines']
  lines[i] = value || null
  patchThumbnail({ lines })
}

function thumbShow(i: 0 | 1, value: boolean) {
  const show = [...project.value.thumbnail.show] as ReelProject['thumbnail']['show']
  show[i] = value
  patchThumbnail({ show })
}

// ── Music ───────────────────────────────────────────────────────────────────

function patchMusic(change: Partial<ReelMusic>) {
  patch({ music: { ...project.value.music, ...change } })
}

/**
 * The window follows the reel. Adding a clip makes the film longer, and a song
 * that was trimmed to the old length would run out — so as long as auto-fit is
 * on, the slice is re-chosen whenever the length changes.
 */
watch(filmSeconds, (seconds) => {
  if (project.value.music.autoFit && project.value.music.kind !== 'none' && seconds > 0) {
    music.autoFit(seconds)
  }
})

onMounted(() => music.rehydrate())

// ── Scoreboard ──────────────────────────────────────────────────────────────

/** The full video's board, read off the tagged match at a source second. */
const boardAtSecond = computed(() => {
  const d = derived.value
  return d && d.rallyStates.length ? (seconds: number) => boardAt(d, seconds) : null
})

/**
 * Where the board changes inside each clip, for the render: the distinct
 * boards once, and per clip the seconds (after its `from`) each one starts.
 */
function withBoards(): { project: ReelProject, boards: BoardState[] } {
  const d = derived.value
  if (!d || !showsScoreboard(project.value)) return { project: project.value, boards: [] }
  const boards: BoardState[] = []
  const index = new Map<string, number>()
  const clips = project.value.clips.map(clip => ({
    ...clip,
    marks: boardChanges(d, clip.from, clip.to).map((m) => {
      const key = boardKey(m.board)
      if (!index.has(key)) {
        index.set(key, boards.length)
        boards.push(m.board)
      }
      return { at: m.at - clip.from, board: index.get(key)! }
    }),
  }))
  return { project: { ...project.value, clips }, boards }
}

// ── Render ──────────────────────────────────────────────────────────────────

const renderUrl = ref<string | null>(null)
const renderError = ref<string | null>(null)

/** A new edit invalidates the last export; nothing else should clear it. */
watch(() => JSON.stringify(project.value), () => {
  renderUrl.value = null
})

async function render() {
  renderError.value = null
  try {
    await source.upload()
    const started = await $fetch<{ ready: boolean, name: string, job: ReelJob | null }>(
      '/api/reel/render',
      { method: 'POST', body: { ...withBoards(), brand: brand.value } },
    )
    if (!started.ready && started.job) await renderJob.watch(started.job)
    const file = projectFileName(project.value, 'mp4')
    renderUrl.value = `/api/reel/media/out/${started.name}?download=1&name=${encodeURIComponent(file)}`
  }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    renderError.value = (cause as { statusMessage?: string })?.statusMessage ?? message
  }
}

async function onOpenProject(file: File) {
  await openFile(file)
  selectedId.value = null
  music.rehydrate()
}

// ── Keyboard ────────────────────────────────────────────────────────────────

function typing(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  return !!target
    && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
}

function onKeydown(event: KeyboardEvent) {
  if (typing(event)) return
  if (event.key === ' ') {
    event.preventDefault()
    stage.value?.toggle()
  }
  else if (event.key === 'ArrowLeft') {
    stage.value?.seek((stage.value?.position ?? 0) - (event.shiftKey ? 5 : 1))
  }
  else if (event.key === 'ArrowRight') {
    stage.value?.seek((stage.value?.position ?? 0) + (event.shiftKey ? 5 : 1))
  }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undo()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(tab, (next) => {
  if (next === 'export') refreshCapabilities()
})

const TABS = [
  { id: 'clips', icon: Scissors },
  { id: 'music', icon: Music },
  { id: 'look', icon: Sparkles },
  { id: 'thumbnail', icon: ImageIcon },
  { id: 'export', icon: Sliders },
] as const

function clock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

useSeoMeta({
  title: () => t('reel.seoTitle'),
  description: () => t('reel.lede'),
})
</script>

<template>
  <div>
    <template v-if="bundle?.match">
      <!-- Header: back to the match's other tools, and the two things that act
           on the whole project rather than on a clip. -->
      <div class="flex flex-wrap items-center gap-3">
        <NuxtLink
          :to="`/admin/matches/${matchId}/tag`"
          class="flex min-h-9 items-center gap-2 rounded-lg font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-200 hover:text-accent"
        >
          <ArrowLeft :size="14" aria-hidden="true" />
          Tagging
        </NuxtLink>
        <NuxtLink :to="`/admin/matches/${matchId}/publish`" class="btn btn-sm btn-ghost !min-h-9">
          <Clapperboard :size="14" aria-hidden="true" />
          YouTube version
        </NuxtLink>
        <NuxtLink :to="`/admin/matches/${matchId}`" class="btn btn-sm btn-ghost !min-h-9">
          <Pencil :size="14" aria-hidden="true" />
          Edit match
        </NuxtLink>

        <!-- The format and the bookends: the choices that change the whole film. -->
        <div class="flex gap-1 rounded-xl border border-line bg-bg-deep p-1" role="group" :aria-label="$t('reel.format')">
          <button
            v-for="o in [{ id: 'portrait', icon: Smartphone }, { id: 'landscape', icon: Monitor }] as const"
            :key="o.id"
            type="button"
            class="flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200"
            :class="project.orientation === o.id ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'"
            :aria-pressed="project.orientation === o.id"
            @click="patch({ orientation: o.id })"
          >
            <component :is="o.icon" :size="14" aria-hidden="true" />
            {{ $t(`reel.${o.id}`) }}
          </button>
        </div>
        <div class="flex gap-1 rounded-xl border border-line bg-bg-deep p-1" role="group" :aria-label="$t('reel.bookends')">
          <template v-for="b in ['intro', 'outro'] as const" :key="b">
            <button
              type="button"
              class="min-h-8 rounded-lg px-2.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200"
              :class="project[b] ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'"
              :aria-pressed="project[b]"
              :title="drawn ? undefined : (drawing ? $t('reel.bookendDrawing') : $t('reel.bookendHint'))"
              @click="patch({ [b]: !project[b] })"
            >
              {{ $t(`reel.${b}`) }}
            </button>
            <!-- The match card in the intro, the result in the outro. -->
            <button
              type="button"
              class="min-h-8 rounded-lg px-2 font-display text-[0.625rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 disabled:opacity-40"
              :class="details[b] ? 'bg-brand/25 text-ink' : 'text-ink-subtle hover:text-ink'"
              :aria-pressed="details[b]"
              :disabled="!project[b]"
              @click="toggleDetails(b)"
            >
              + {{ $t(`reel.${b}Details`) }}
            </button>
          </template>
        </div>

        <p class="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums text-ink-muted">
          <span>{{ $t('reel.clipCount', { n: clipPieces.length }) }}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="reel-duration">{{ clock(filmSeconds) }}</span>
        </p>

        <button
          type="button"
          class="btn btn-sm btn-ghost !min-h-9"
          :disabled="!canUndo"
          @click="undo()"
        >
          <Undo2 :size="14" aria-hidden="true" />
          {{ $t('reel.undo') }}
        </button>
      </div>

      <input
        :value="project.name"
        type="text"
        class="mt-3 w-full border-none bg-transparent p-0 font-display text-2xl font-bold uppercase tracking-tight text-ink outline-none focus-visible:text-accent sm:text-3xl"
        :aria-label="$t('reel.projectName')"
        maxlength="120"
        @input="patch({ name: ($event.target as HTMLInputElement).value })"
      >
      <p class="mt-0.5 truncate text-sm text-ink-subtle">
        {{ project.matchTitle }}
      </p>

      <div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div class="min-w-0">
          <ReelStage
            ref="stage"
            :pieces="pieces"
            :project="project"
            :source-url="source.url.value"
            :video-id="project.videoId"
            :music-url="music.audioUrl.value"
            :intro-url="media('brand', drawn?.intro)"
            :outro-url="media('brand', drawn?.outro)"
            :frame-url="orientation === 'portrait' ? media('brand', drawn?.frame) : null"
            :board-at="boardAtSecond"
            :sides="[brand?.outro.s1 ?? '', brand?.outro.s2 ?? '']"
            :colour="family?.colour"
          />

          <ReelRibbon
            class="mt-3"
            :pieces="pieces"
            :position="stage?.position ?? 0"
            :duration="stage?.duration ?? filmSeconds"
            :selected-id="selectedId"
            @seek="seconds => stage?.seek(seconds)"
            @select="select"
          />

          <p class="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
            {{ $t('reel.previewNote') }}
          </p>
        </div>

        <!-- The panels. One column on a desktop, a tab strip on a phone —
             the same four panels either way. -->
        <div class="min-w-0">
          <div class="grid grid-cols-5 gap-1 rounded-xl border border-line bg-bg-deep p-1">
            <button
              v-for="entry in TABS"
              :key="entry.id"
              type="button"
              class="flex min-h-10 items-center justify-center gap-1.5 rounded-lg font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200"
              :class="tab === entry.id ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'"
              :aria-pressed="tab === entry.id"
              @click="tab = entry.id"
            >
              <component :is="entry.icon" :size="14" aria-hidden="true" />
              <span class="hidden sm:inline lg:hidden xl:inline">{{ $t(`reel.tabs.${entry.id}`) }}</span>
            </button>
          </div>

          <div class="mt-4">
            <ReelClipsPanel
              v-if="tab === 'clips'"
              :clips="project.clips"
              :derived="derived"
              :breaks="breaks"
              :source-duration="sourceDuration"
              :selected-id="selectedId"
              @select="select"
              @patch="(id, change) => updateClip(id, change)"
              @remove="removeClip"
              @move="(id, delta) => moveClip(id, delta)"
              @play="playClip"
              @rebuild="rebuild"
              @add-rally="addRally"
              @sort="sortClips"
            />

            <ReelMusicPanel
              v-else-if="tab === 'music'"
              :music="project.music"
              :track="music.track.value"
              :need="filmSeconds"
              :can-download="caps?.download ?? false"
              :importing="music.importing.value"
              :progress="music.progress.value"
              :error="music.error.value"
              :match-audio="project.output.matchAudio"
              @import="url => music.importUrl(url, filmSeconds)"
              @attach="file => music.attachFile(file, filmSeconds)"
              @auto-fit="music.autoFit(filmSeconds)"
              @patch="patchMusic"
              @match-audio="value => patch({ output: { ...project.output, matchAudio: value } })"
              @clear="music.clear()"
            />

            <ReelLookPanel
              v-else-if="tab === 'look'"
              :project="project"
              :drawn="Boolean(drawn)"
              :drawing="drawing"
              @patch="(change: Partial<ReelProject>) => patch(change)"
            />

            <div v-else-if="tab === 'thumbnail'" class="flex flex-col gap-4">
              <PublishThumbnailCanvas
                :template="thumbTemplate"
                :lines="thumbLines"
                :colour="family?.colour ?? '#cb2543'"
                :match-id="matchId"
                :file-stem="`clip-thumbnail-${matchId.slice(0, 8)}`"
                highlights="HIGHLIGHTS"
                :saveable="false"
              />
              <div v-for="i in [0, 1] as const" :key="i">
                <label class="flex items-center gap-2">
                  <input :checked="project.thumbnail.show[i]" type="checkbox" class="accent-[var(--ui-accent)]" @change="thumbShow(i, ($event.target as HTMLInputElement).checked)">
                  <span class="label">Band {{ i + 1 }}</span>
                </label>
                <input
                  :value="project.thumbnail.lines[i] ?? ''"
                  :placeholder="thumbDefaults[i]"
                  class="field mt-2 uppercase"
                  @input="thumbLine(i, ($event.target as HTMLInputElement).value)"
                >
              </div>
            </div>

            <ReelExportPanel
              v-else
              :caps="caps"
              :mode="source.mode.value"
              :source-duration="sourceDuration"
              :downloading="source.downloading.value"
              :download-progress="source.progress.value"
              :source-error="source.error.value"
              :rendering="renderJob.running.value || source.uploading.value"
              :render-progress="renderJob.progress.value"
              :render-error="renderError"
              :render-url="renderUrl"
              :render-seconds="filmSeconds"
              :can-render="canRender"
              :clip-count="clipPieces.length"
              @attach="source.attach"
              @fetch-source="source.fetchSource()"
              @forget="source.forget()"
              @render="render"
              @save="saveProject"
              @open="onOpenProject"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
