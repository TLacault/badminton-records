<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import type { ReelJob, ReelMusic, ReelProject } from '~~/shared/reel'
import { ArrowLeft, Film, Music, Scissors, Sparkles, Sliders, Undo2 } from '@lucide/vue'
import { deriveMatch } from '~~/shared/badminton'
import {
  clipFromRally,
  clipsFromHighlights,
  emptyProject,
  projectFileName,
  timeline,
  totalDuration,
} from '~~/shared/reel'

/**
 * The reel maker.
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

const { t } = useI18n()
const client = useSupabaseClient<Database>()

const INTRO_URL = '/brand/reel/intro.mp4'
const OUTRO_URL = '/brand/reel/outro.mp4'

const { project, patch, addClips, updateClip, removeClip, moveClip, sortClips, undo, canUndo, download: saveProject, openFile, reset } = useReelProject()
const { caps, canRender, refresh: refreshCapabilities } = useReelCapabilities()

const videoId = computed(() => project.value.videoId)
const source = useReelSource(videoId)
const music = useReelMusic(project, patch)
const renderJob = useReelJob()

const selectedId = ref<string | null>(null)
const tab = ref<'clips' | 'music' | 'look' | 'export'>('clips')
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

/**
 * The match behind the project, reloaded whenever the project points at
 * another one.
 *
 * A plain watcher rather than `useAsyncData`: which match this is comes out of
 * localStorage, which the server cannot read, so there is nothing to render on
 * the server and nothing to hydrate — and the restore lands *after* setup, so
 * the load has to be driven by the id changing rather than by the page
 * mounting.
 */
type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

const bundle = ref<{
  match: Row<'matches'> | null
  rallies: Row<'rallies'>[]
  setStarts: Row<'match_set_starts'>[]
  breaks: Row<'match_breaks'>[]
} | null>(null)

async function loadMatch(id: string | null) {
  if (!id) {
    bundle.value = null
    return
  }
  const [match, rallies, setStarts, breaks] = await Promise.all([
    client.from('matches').select('*').eq('id', id).maybeSingle(),
    client.from('rallies').select('*').eq('match_id', id).order('idx'),
    client.from('match_set_starts').select('*').eq('match_id', id),
    client.from('match_breaks').select('*').eq('match_id', id).order('idx'),
  ])
  bundle.value = {
    match: match.data,
    rallies: rallies.data ?? [],
    setStarts: setStarts.data ?? [],
    breaks: breaks.data ?? [],
  }
}

watch(() => project.value.matchId, id => loadMatch(id), { immediate: true })

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

// ── Bookends ────────────────────────────────────────────────────────────────

/**
 * Intro and outro are dropped into `public/brand/reel/` and picked up from
 * there — there is no upload, because there is only ever one of each and they
 * belong to the channel rather than to a reel.
 *
 * Their lengths come from the server, which measured them with the same
 * ffprobe the renderer uses: measuring them here instead would let the preview
 * and the export disagree about how long the film is. A host with no ffprobe
 * has nothing to tell us, so there the browser reads the file itself — with a
 * deadline, because a bookend that never loads must cost the reel a bookend
 * rather than the whole length calculation.
 */
const bookends = ref<{ intro?: number, outro?: number }>({})

function measure(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = document.createElement('video')
    const done = (seconds: number) => {
      clearTimeout(deadline)
      resolve(seconds)
    }
    const deadline = setTimeout(() => done(0), 8000)
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => done(probe.duration || 0)
    probe.onerror = () => done(0)
    probe.src = url
  })
}

watch(caps, async (value) => {
  if (!value) return
  const [intro, outro] = await Promise.all([
    value.intro ? value.introSeconds ?? measure(INTRO_URL) : Promise.resolve(0),
    value.outro ? value.outroSeconds ?? measure(OUTRO_URL) : Promise.resolve(0),
  ])
  bookends.value = { intro: intro || undefined, outro: outro || undefined }
}, { immediate: true })

// ── The edit ────────────────────────────────────────────────────────────────

const pieces = computed(() => timeline(project.value, bookends.value))
const filmSeconds = computed(() => totalDuration(project.value, bookends.value))

const clipPieces = computed(() => pieces.value.filter(p => p.kind === 'clip'))

function pickMatch(entry: { id: string, videoId: string, title: string }) {
  patch({
    ...emptyProject(),
    matchId: entry.id,
    videoId: entry.videoId,
    matchTitle: entry.title,
    name: entry.title,
    // A project carries its music across a match change: the song was chosen
    // for the reel, not for the fixture.
    music: project.value.music,
  })
  selectedId.value = null
}

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
    const started = await $fetch<{ ready: boolean, name: string, job: ReelJob | null }>(
      '/api/reel/render',
      { method: 'POST', body: { project: project.value } },
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

/**
 * Dropping an intro.mp4 into `public/brand/reel/` mid-session should not need
 * a reload to be noticed, and the two panels that care about it are the two
 * that are opened deliberately.
 */
watch(tab, (next) => {
  if (next === 'look' || next === 'export') refreshCapabilities()
})

const TABS = [
  { id: 'clips', icon: Scissors },
  { id: 'music', icon: Music },
  { id: 'look', icon: Sparkles },
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
    <UiSectionHeading
      v-if="!project.matchId"
      :eyebrow="$t('reel.eyebrow')"
      :icon="Film"
      level="h1"
      :title="$t('reel.title')"
      :lede="$t('reel.lede')"
    />

    <ReelMatchPicker v-if="!project.matchId" class="mt-8" @pick="pickMatch" />

    <template v-else>
      <!-- Header: what is being cut, and the two things that act on the whole
           project rather than on a clip. -->
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="flex min-h-9 items-center gap-2 rounded-lg font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-200 hover:text-accent"
          @click="reset()"
        >
          <ArrowLeft :size="14" aria-hidden="true" />
          {{ $t('reel.changeMatch') }}
        </button>

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
            :intro-url="caps?.intro ? INTRO_URL : null"
            :outro-url="caps?.outro ? OUTRO_URL : null"
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
          <div class="grid grid-cols-4 gap-1 rounded-xl border border-line bg-bg-deep p-1">
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
              :has-intro="Boolean(caps?.intro)"
              :has-outro="Boolean(caps?.outro)"
              @patch="(change: Partial<ReelProject>) => patch(change)"
            />

            <ReelExportPanel
              v-else
              :caps="caps"
              :mode="source.mode.value"
              :source-duration="sourceDuration"
              :downloading="source.downloading.value"
              :download-progress="source.progress.value"
              :source-error="source.error.value"
              :rendering="renderJob.running.value"
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
