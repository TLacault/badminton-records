<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import type { BoardState } from '~~/shared/publish'
import type { ReelBrand, ReelJob, ReelMusic, ReelProject } from '~~/shared/reel'
import { Copy, Image as ImageIcon, Music, Redo2, RotateCcw, Scissors, Sliders, Smartphone, Sparkles, Undo2 } from '@lucide/vue'
import { deriveMatch } from '~~/shared/badminton'
import { boardAt, boardChanges, boardKey, cardText, clipDescription, clipEditMap, clipTitle, defaultThumbnailLines, defaultTitle, familyOf, matchResult, sideName, SITE_URL } from '~~/shared/publish'
import {
  clipFromRally,
  clipsFromHighlights,
  bookendSeconds,
  DEFAULT_LEAD_SECONDS,
  DEFAULT_TAIL_SECONDS,
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

/**
 * The cutting room for one of the two films made from a match's rallies:
 * Highlights (landscape: every starred point in a row) or Shorts (portrait: a
 * few shots under music). Two projects, saved apart, never sharing clips.
 */
const props = defineProps<{ orientation: 'portrait' | 'landscape' }>()
/** The film's name, in titles, descriptions and the render map. */
const format = computed(() => (props.orientation === 'landscape' ? 'Highlights' : 'Shorts') as 'Highlights' | 'Shorts')

const { t } = useI18n()
const client = useSupabaseClient<Database>()
const route = useRoute()
const matchId = route.params.id as string

const { project, patch, addClips, updateClip, removeClip, moveClip, sortClips, undo, canUndo, redo, canRedo, reset, download: saveProject, openFile } = useReelProject(matchId, props.orientation)
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
  const name = clipTitle(info.value, family.value.id, format.value)
  // The name follows the generated one until someone renames it (an older draft
  // was named after the YouTube title).
  const generated = [title, project.value.matchTitle, ...(['Highlights', 'Shorts', 'Edit'] as const).map(f => clipTitle(info.value!, family.value!.id, f))]
  const untouched = !project.value.clips.length || generated.includes(project.value.name)
  if (project.value.orientation !== props.orientation || project.value.videoId !== m.youtube_video_id || project.value.matchTitle !== title || (untouched && project.value.name !== name)) {
    project.value = {
      ...project.value,
      videoId: m.youtube_video_id,
      matchTitle: title,
      orientation: props.orientation,
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
const orientation = computed(() => props.orientation)
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

// Highlights start as every starred point in a row; Shorts start empty (a few shots, picked by hand).
/** Starts the film over; Highlights refill with every starred point. */
function resetFilm() {
  reset()
  selectedId.value = null
  if (props.orientation === 'landscape') rebuild({ lead: DEFAULT_LEAD_SECONDS, tail: DEFAULT_TAIL_SECONDS })
}

// After mount: the saved project is restored then, and must not be overwritten first.
onMounted(() => watch(() => derived.value?.rallyStates.length, () => {
  if (props.orientation === 'landscape' && !project.value.clips.length && derived.value?.rallyStates.some(s => s.isHighlight)) rebuild({ lead: DEFAULT_LEAD_SECONDS, tail: DEFAULT_TAIL_SECONDS })
}, { immediate: true }))

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

/** The YouTube editor's thumbnail: HIGHLIGHTS for Highlights, no word on a Short's cover; the template follows the match type. */
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

// ── Upload text ─────────────────────────────────────────────────────────────

/** Like the YouTube editor: generated from the match, overridable; the title is the project name. */
const generatedName = computed(() => (info.value && family.value ? clipTitle(info.value, family.value.id, format.value) : ''))
const generatedDescription = computed(() => {
  if (!info.value || !family.value || !derived.value) return ''
  const result = matchResult(derived.value)
  return clipDescription(info.value, family.value.id, format.value, {
    setScores: result.sets,
    winner: result.winner === null ? null : (result.winner - 1) as 0 | 1,
    matchUrl: `${SITE_URL}/matches/${matchId}`,
    videoId: project.value.videoId,
  })
})
const description = computed(() => project.value.description ?? generatedDescription.value)
const copied = ref<string | null>(null)
async function copy(what: 'title' | 'description') {
  await navigator.clipboard.writeText(what === 'title' ? project.value.name : description.value)
  copied.value = what
  setTimeout(() => (copied.value = null), 1500)
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

const kind = computed(() => (orientation.value === 'landscape' ? 'highlights' : 'shorts') as 'highlights' | 'shorts')
const outUrl = (name: string) => `/api/reel/media/out/${name}?download=1&name=${encodeURIComponent(projectFileName(project.value, 'mp4'))}`

// Back on the editor while a render started earlier is still running: follow it.
onMounted(() => {
  const pending = pendingRender(matchId, kind.value)
  if (!pending?.jobId) return
  renderJob.watch({ id: pending.jobId, kind: 'render', state: 'running', progress: null, message: '', error: null, result: null })
    .then(() => (renderUrl.value = pending.kit.out ? outUrl(pending.kit.out) : null))
    .catch(() => {})
})

async function render(height?: ReelProject['output']['height']) {
  renderError.value = null
  try {
    await source.upload()
    const body = withBoards()
    if (height) body.project = { ...body.project, output: { ...body.project.output, height } }
    const started = await $fetch<{ ready: boolean, name: string, job: ReelJob | null }>(
      '/api/reel/render',
      { method: 'POST', body: { ...body, brand: brand.value } },
    )
    // What follows the render (where the raw footage lands, read by the linked
    // video; the upload folder) is finished by the render ledger, even if this
    // page is left before the render ends.
    trackRender({
      matchId,
      kind: kind.value,
      jobId: started.ready ? null : started.job?.id ?? null,
      pieces: clipEditMap(pieces.value),
      kit: {
        title: project.value.name,
        description: description.value,
        out: started.name,
        thumb: {
          template: thumbTemplate.value,
          lines: thumbLines.value,
          colour: family.value?.colour ?? '#cb2543',
          highlights: orientation.value === 'landscape' ? 'HIGHLIGHTS' : '',
          vertical: orientation.value === 'portrait',
          tag: family.value?.label.toUpperCase() ?? '',
        },
      },
    })
    if (!started.ready && started.job) await renderJob.watch(started.job)
    renderUrl.value = outUrl(started.name)
  }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    renderError.value = (cause as { statusMessage?: string })?.statusMessage ?? message
  }
}

// The pipeline mounts the editor out of sight and renders through it.
defineExpose({
  ready: computed(() => !!brand.value && !drawing.value && project.value.clips.length > 0 && source.precise.value),
  progress: renderJob.progress,
  message: computed(() => renderJob.job.value?.message ?? ''),
  async run(height: ReelProject['output']['height']) {
    await render(height)
    if (renderError.value) throw new Error(renderError.value)
  },
})

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
  title: () => format.value,
  description: () => t('reel.lede'),
})
</script>

<template>
  <div>
    <template v-if="bundle?.match">
      <AdminToolHeader :icon="orientation === 'landscape' ? Sparkles : Smartphone">
        <template #title>
          <input
            :value="project.name"
            type="text"
            class="w-full truncate border-none bg-transparent p-0 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink outline-none focus-visible:text-accent sm:text-3xl"
            :aria-label="$t('reel.projectName')"
            maxlength="120"
            @input="patch({ name: ($event.target as HTMLInputElement).value })"
          >
        </template>
        <template #actions>
          <p class="flex items-center gap-2 font-mono text-xs tabular-nums text-ink-muted">
            <span>{{ $t('reel.clipCount', { n: clipPieces.length }) }}</span>
            <span aria-hidden="true">·</span>
            <span data-testid="reel-duration">{{ clock(filmSeconds) }}</span>
          </p>
          <button type="button" class="btn btn-sm btn-ghost" :disabled="!canUndo" @click="undo()">
            <Undo2 :size="14" aria-hidden="true" /> Undo
          </button>
          <button type="button" class="btn btn-sm btn-ghost" :disabled="!canRedo" @click="redo()">
            <Redo2 :size="14" aria-hidden="true" /> Redo
          </button>
          <button type="button" class="btn btn-sm btn-ghost" title="Start this film over (undoable)" @click="resetFilm">
            <RotateCcw :size="14" aria-hidden="true" /> Reset
          </button>
        </template>
      </AdminToolHeader>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42rem)]">
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
          <AdminToolTabs v-model="tab" :tabs="TABS.map(e => ({ ...e, label: $t(`reel.tabs.${e.id}`) }))" />

          <div class="mt-4">
            <!-- The bookends open the Shots tab: they are the first and last shot. -->
            <div v-if="tab === 'clips'">
            <div class="mb-4 grid grid-cols-4 gap-1 rounded-xl border border-line bg-bg-deep p-1" role="group" :aria-label="$t('reel.bookends')">
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
              <ReelClipsPanel
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
            </div>

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
                :highlights="orientation === 'landscape' ? 'HIGHLIGHTS' : ''"
                :saveable="false"
                :vertical="orientation === 'portrait'"
                :tag="family?.label.toUpperCase() ?? ''"
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

              <label class="mt-2 block">
                <span class="label flex items-center justify-between">Title <span class="font-mono">{{ project.name.length }}/100</span></span>
                <input :value="project.name" maxlength="100" class="field mt-2" @input="patch({ name: ($event.target as HTMLInputElement).value })">
              </label>
              <div class="flex gap-2">
                <button type="button" class="btn btn-sm btn-ghost" @click="copy('title')"><Copy :size="14" aria-hidden="true" /> {{ copied === 'title' ? 'Copied' : 'Copy title' }}</button>
                <button v-if="project.name !== generatedName" type="button" class="btn btn-sm btn-ghost" @click="patch({ name: generatedName })"><RotateCcw :size="14" aria-hidden="true" /> Generated</button>
              </div>
              <label class="block">
                <span class="label">Description</span>
                <textarea :value="description" rows="14" class="field mt-2 font-mono text-xs" @input="patch({ description: ($event.target as HTMLTextAreaElement).value })" />
              </label>
              <div class="flex gap-2">
                <button type="button" class="btn btn-sm btn-ghost" @click="copy('description')"><Copy :size="14" aria-hidden="true" /> {{ copied === 'description' ? 'Copied' : 'Copy description' }}</button>
                <button v-if="project.description !== null" type="button" class="btn btn-sm btn-ghost" @click="patch({ description: null })"><RotateCcw :size="14" aria-hidden="true" /> Generated</button>
              </div>
            </div>

            <ReelExportPanel
              v-else
              :source="source"
              :output="project.output"
              @output="change => patch({ output: { ...project.output, ...change } })"
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
              @render="render()"
              @save="saveProject"
              @open="onOpenProject"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
