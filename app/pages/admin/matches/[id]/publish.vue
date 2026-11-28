<script setup lang="ts">
import type { Database, Json } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import type { MatchInfo, RenderRequest } from '~~/shared/publish'
import type { ReelJob } from '~~/shared/reel'
import { ChevronDown, Clapperboard, Copy, Download, Eye, Film, Flag, Gauge, Image as ImageIcon, Redo2, RotateCcw, Scissors, Sliders, Type, Undo2, Zap } from '@lucide/vue'
import { deriveMatch } from '~~/shared/badminton'
import {
  buildEdit,
  cardText,
  defaultDescription,
  defaultThumbnailLines,
  defaultTitle,
  FAMILIES,
  familyOf,
  INTRO_SECONDS,
  matchResult,
  readSettings,
  sideName,
  SITE_URL,
  thumbnailLines,
  toOutput,
  youtubeEditMap,
} from '~~/shared/publish'

/**
 * The YouTube version of a match: intro card, cuts at the breaks, burned-in
 * scoreboard, stings between sets, outro around the end screen, and the
 * thumbnail, title and description to upload it with. The app keeps showing
 * the raw scored video; this only produces files.
 */
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true, matchTool: 'publish', pageTransition: false })

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`publish-${matchId}`, async () => {
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

const match = computed(() => bundle.value?.match ?? null)
const info = computed<MatchInfo | null>(() => (match.value ? matchInfoFrom(match.value, bundle.value?.participants ?? []) : null))

const derived = computed(() => {
  const m = match.value
  if (!m) return null
  const config: MatchConfig = {
    format: m.format as MatchFormat,
    rules: { bestOf: m.best_of, pointsToWin: m.points_to_win, winBy: m.win_by, pointsCap: m.points_cap },
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

const breaks = computed<BreakInput[]>(() => (bundle.value?.breaks ?? []).map(b => ({
  idx: b.idx,
  startsAtSeconds: Number(b.starts_at_seconds),
  endsAtSeconds: b.ends_at_seconds === null ? null : Number(b.ends_at_seconds),
})))

// --- settings, saved on the match as the editor changes them
const settings = ref(readSettings(match.value?.publish_settings))
/** Every change to the edit is a step: undo, redo, and reset to the defaults. */
const history = useSnapshotHistory(settings, () => readSettings({}))
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(settings, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveState.value = 'saving'
    const { error } = await client.from('matches')
      .update({ publish_settings: settings.value as unknown as Json })
      .eq('id', matchId)
    saveState.value = error ? 'error' : 'saved'
  }, 600)
}, { deep: true })

const family = computed(() => (info.value ? familyOf(info.value) : FAMILIES.jeux_libres))

// --- source: the local original, attached once and copied next to the renderer
const videoId = computed(() => match.value?.youtube_video_id ?? null)
const source = useReelSource(videoId)
const player = ref<HTMLVideoElement | null>(null)
const now = ref(0)
const sourceDuration = ref(0)

function onMeta() {
  sourceDuration.value = player.value?.duration ?? 0
}
function seek(t: number) {
  if (player.value) player.value.currentTime = t
}

// --- the edit
// The file's own length once the player has read it, else YouTube's (the pipeline renders with no player shown).
const duration = computed(() => sourceDuration.value || Number(match.value?.youtube_duration_seconds ?? 0))
const plan = computed(() => derived.value && duration.value
  ? buildEdit({ derived: derived.value, breaks: breaks.value, sourceDuration: duration.value, settings: settings.value })
  : null)

const inCut = computed(() => !!plan.value && !plan.value.segments.some(s => now.value >= s.from && now.value < s.to))
const liveBoard = computed(() => {
  if (!plan.value || inCut.value) return null
  const o = toOutput(plan.value.segments, now.value)
  return plan.value.scores.find(s => o >= s.from && o < s.to)?.board ?? null
})

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// Crop: a zoom and a centre, always 16:9 of the source.
const zoom = computed({
  get: () => (settings.value.crop ? 1 / settings.value.crop.w : 1),
  set: (z: number) => setCrop(z, centre.value.x, centre.value.y),
})
const centre = computed(() => {
  const c = settings.value.crop
  return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : { x: 0.5, y: 0.5 }
})
function setCrop(z: number, cx: number, cy: number) {
  if (z <= 1.001) {
    settings.value.crop = null
    return
  }
  const w = 1 / z
  const clamp = (v: number) => Math.min(1 - w, Math.max(0, v - w / 2))
  settings.value.crop = { x: clamp(cx), y: clamp(cy), w, h: w }
}

// --- texts
const result = computed(() => (derived.value ? matchResult(derived.value) : { sets: [], winner: null }))
const generatedTitle = computed(() => (info.value ? defaultTitle(info.value, family.value.id) : ''))
const generatedDescription = computed(() => (info.value && plan.value
  ? defaultDescription(info.value, family.value.id, {
      setScores: result.value.sets,
      winner: result.value.winner === null ? null : (result.value.winner - 1) as 0 | 1,
      chapters: plan.value.chapters,
      total: plan.value.totalDuration,
      matchUrl: `${SITE_URL}/matches/${matchId}`,
    })
  : ''))
const title = computed(() => settings.value.title ?? generatedTitle.value)
const description = computed(() => settings.value.description ?? generatedDescription.value)
const copied = ref<string | null>(null)
async function copy(what: 'title' | 'description') {
  await navigator.clipboard.writeText(what === 'title' ? title.value : description.value)
  copied.value = what
  setTimeout(() => (copied.value = null), 1500)
}

// --- thumbnail
const defaultsLines = computed(() => (info.value ? defaultThumbnailLines(info.value, family.value.id) : ['', '']))
const lines = computed(() => (info.value ? thumbnailLines(info.value, settings.value) : []))
const template = computed(() => family.value.template)

// --- render
const job = useReelJob()
const renderResult = ref<{ dir: string, video: string } | null>(null)
const upper = (s: string) => s.toUpperCase()
const card = computed(() => (info.value ? cardText(info.value, family.value.id) : { tag: '', event: '', detail: '', place: '' }))

function request(draft: boolean, height?: number): RenderRequest | null {
  const p = plan.value
  const i = info.value
  if (!p || !i || !videoId.value) return null
  const keys = [...new Set(p.scores.map(s => s.key))]
  const sides: [string, string] = [upper(sideName(i, 0)), upper(sideName(i, 1))]
  return {
    matchId,
    videoId: videoId.value,
    plan: {
      segments: p.segments,
      transitions: p.transitions.map(t => ({
        at: t.at,
        kind: t.kind,
        title: t.kind === 'set' ? `FIN DU SET ${t.setNumber}` : '',
        score: t.score ? `${t.score[0]} – ${t.score[1]}` : '',
      })),
      scores: p.scores.map(s => ({ from: s.from, to: s.to, board: keys.indexOf(s.key) })),
      boards: keys.map(k => p.scores.find(s => s.key === k)!.board),
      outroClips: p.outroClips,
      outroSpeed: p.outroSpeed,
      bodyDuration: p.bodyDuration,
    },
    intro: settings.value.intro
      ? {
          tag: card.value.tag,
          event: card.value.event,
          detail: card.value.detail,
          s1a: upper(i.sides[0].full[0] ?? ''),
          s1b: upper(i.sides[0].full[1] ?? ''),
          s2a: upper(i.sides[1].full[0] ?? ''),
          s2b: upper(i.sides[1].full[1] ?? ''),
          place: card.value.place,
        }
      : null,
    outro: settings.value.outro
      ? {
          s1: sides[0],
          s2: sides[1],
          sets: result.value.sets.map(s => s.join('-')).join(','),
          winner: result.value.winner ? String(result.value.winner) : '',
          detail: [card.value.event, card.value.detail].filter(Boolean).join(' · '),
        }
      : null,
    colour: family.value.colour,
    corner: settings.value.scoreboardCorner,
    sides,
    crop: settings.value.crop,
    outputHeight: (height ?? settings.value.outputHeight) as RenderRequest['outputHeight'],
    draft,
    title: title.value,
    description: description.value,
  }
}

const renderError = ref<string | null>(null)
async function render(draft: boolean, height?: number) {
  const body = request(draft, height)
  if (!body) return
  renderError.value = null
  renderResult.value = null
  try {
    await source.upload()
    const { job: started } = await $fetch<{ job: ReelJob }>('/api/publish/render', { method: 'POST', body })
    const out = await job.watch(started)
    renderResult.value = out as { dir: string, video: string }
    await saveKit(matchId, {
      kind: 'match',
      title: title.value,
      description: description.value,
      thumb: { template: template.value, lines: lines.value, colour: family.value.colour },
    })
    // Where the raw footage lands in this render, for the linked YouTube video.
    if (plan.value) await saveEditMap(client as never, matchId, 'match', youtubeEditMap(plan.value.segments, settings.value.intro ? INTRO_SECONDS : 0))
  }
  catch (cause) {
    renderError.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
      ?? (cause instanceof Error ? cause.message : String(cause))
  }
}

// The pipeline mounts this page out of sight and renders through it, so its
// output is exactly the one the Render button makes.
defineExpose({
  ready: computed(() => !!plan.value && source.precise.value),
  progress: job.progress,
  message: computed(() => job.job.value?.message ?? ''),
  async run(height: number) {
    await render(false, height)
    if (renderError.value) throw new Error(renderError.value)
  },
})

const tab = ref<'edit' | 'thumbnail' | 'text' | 'export'>('edit')
const TABS = [
  { id: 'edit', label: 'Edit', icon: Scissors },
  { id: 'thumbnail', label: 'Thumbnail', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'export', label: 'Export', icon: Sliders },
] as const
const PIECES = [
  { id: 'intro', label: 'Intro + match card', icon: Film },
  { id: 'outro', label: 'Outro + end screen', icon: Flag },
  { id: 'transitions', label: 'Stings (sets, breaks)', icon: Zap },
  { id: 'scoreboard', label: 'Scoreboard', icon: Gauge },
] as const
const breaksOpen = ref(false)
const heights = [null, 2160, 1440, 1080, 720] as const
</script>

<template>
  <div v-if="match && info">

    <!-- The title the video goes up under (the Text tab's, generated or edited). -->
    <AdminToolHeader :icon="Clapperboard" :title="title">
      <template #actions>
        <p v-if="saveState === 'error'" class="text-xs text-accent" role="alert">Save failed</p>
        <button type="button" class="btn btn-sm btn-ghost" :disabled="!history.canUndo.value" @click="history.undo()">
          <Undo2 :size="14" aria-hidden="true" /> Undo
        </button>
        <button type="button" class="btn btn-sm btn-ghost" :disabled="!history.canRedo.value" @click="history.redo()">
          <Redo2 :size="14" aria-hidden="true" /> Redo
        </button>
        <button type="button" class="btn btn-sm btn-ghost" title="Back to the default edit (undoable)" @click="history.reset()">
          <RotateCcw :size="14" aria-hidden="true" /> Reset
        </button>
      </template>
    </AdminToolHeader>

    <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42rem)]">
      <!-- Preview -->
      <section>
        <div class="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
          <video
            v-if="source.url.value"
            ref="player"
            :src="source.url.value"
            class="absolute inset-0 h-full w-full object-contain"
            controls
            playsinline
            @loadedmetadata="onMeta"
            @timeupdate="now = player?.currentTime ?? 0"
            @seeked="now = player?.currentTime ?? 0"
          />
          <div v-else class="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-subtle">
            Attach the original match file to edit and render.
          </div>
          <!-- Crop: everything outside the kept frame is shaded. -->
          <div
            v-if="settings.crop && source.url.value"
            class="pointer-events-none absolute border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            :style="{ left: `${settings.crop.x * 100}%`, top: `${settings.crop.y * 100}%`, width: `${settings.crop.w * 100}%`, height: `${settings.crop.h * 100}%` }"
          />
          <div v-if="inCut && source.url.value" class="pointer-events-none absolute left-3 top-3 rounded bg-accent px-2 py-1 font-display text-xs font-bold uppercase tracking-widest text-white">
            Cut
          </div>
          <div v-else-if="liveBoard && settings.scoreboard" class="pointer-events-none absolute left-3 top-3 rounded bg-black/80 px-3 py-1.5 font-mono text-xs text-white">
            <div v-for="side in [0, 1]" :key="side" class="flex gap-3">
              <span class="w-28 truncate">{{ sideName(info, side as 0 | 1) }}</span>
              <span v-for="(s, k) in liveBoard.sets" :key="k" class="w-5 text-right tabular-nums">{{ s[side] }}</span>
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span v-if="plan" class="ml-auto font-mono text-xs tabular-nums text-ink-subtle">
            {{ fmt(now) }} · output {{ fmt(plan.totalDuration) }}
          </span>
        </div>

        <!-- Timeline: kept segments, stings, set chapters -->
        <div v-if="plan && sourceDuration" class="relative mt-3 h-8 overflow-hidden rounded bg-bg-deep" aria-hidden="true">
          <div
            v-for="(s, i) in plan.segments"
            :key="i"
            class="absolute inset-y-0 bg-ink/25"
            :style="{ left: `${(s.from / sourceDuration) * 100}%`, width: `${((s.to - s.from) / sourceDuration) * 100}%` }"
          />
          <div class="absolute inset-y-0 w-0.5 bg-accent" :style="{ left: `${(now / sourceDuration) * 100}%` }" />
        </div>
      </section>

      <!-- Controls -->
      <aside>
        <AdminToolTabs v-model="tab" :tabs="TABS" />

        <!-- Montage -->
        <div v-if="tab === 'edit'" class="mt-5 flex flex-col gap-5">
          <p class="flex items-center gap-2 text-sm text-ink-muted">
            <span class="size-2.5 rounded-full" :style="{ background: family.colour }" />
            {{ family.label }}
            <span class="text-ink-subtle">· from the match type (Edit match)</span>
          </p>

          <div>
            <span class="label">Pieces</span>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <button
                v-for="p in PIECES"
                :key="p.id"
                type="button"
                :aria-pressed="settings[p.id]"
                class="flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-left text-sm transition-[background-color,border-color,color] duration-200"
                :class="settings[p.id] ? 'border-accent/60 bg-accent/15 text-ink' : 'border-line text-ink-subtle hover:border-line-strong hover:text-ink-muted'"
                @click="settings[p.id] = !settings[p.id]"
              >
                <span class="grid size-7 shrink-0 place-items-center rounded-lg" :class="settings[p.id] ? 'bg-brand text-on-brand' : 'bg-bg-deep'">
                  <component :is="p.icon" :size="14" aria-hidden="true" />
                </span>
                {{ p.label }}
              </button>
            </div>
          </div>

          <div v-if="settings.scoreboard">
            <span class="label">Scoreboard corner</span>
            <PublishCornerPicker v-model="settings.scoreboardCorner" class="mt-3" />
          </div>

          <div>
            <span class="label">Trim</span>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <button type="button" class="btn btn-sm btn-ghost" :disabled="!sourceDuration" @click="settings.trimIn = now">In at {{ fmt(now) }}</button>
              <button type="button" class="btn btn-sm btn-ghost" :disabled="!sourceDuration" @click="settings.trimOut = now">Out at {{ fmt(now) }}</button>
              <button v-if="settings.trimIn !== null || settings.trimOut !== null" type="button" class="btn btn-sm btn-ghost" @click="settings.trimIn = null; settings.trimOut = null">
                <RotateCcw :size="14" aria-hidden="true" /> Reset
              </button>
            </div>
            <p class="mt-1 font-mono text-xs text-ink-subtle">
              {{ fmt(settings.trimIn ?? 0) }} → {{ fmt(settings.trimOut ?? sourceDuration) }}
            </p>
          </div>

          <div>
            <span class="label">Crop (zoom {{ zoom.toFixed(2) }}×)</span>
            <input v-model.number="zoom" type="range" min="1" max="2" step="0.01" class="mt-2 w-full accent-[var(--ui-accent)]" aria-label="Zoom">
            <template v-if="settings.crop">
              <input :value="centre.x" type="range" min="0" max="1" step="0.005" class="mt-2 w-full accent-[var(--ui-accent)]" aria-label="Horizontal centre" @input="setCrop(zoom, Number(($event.target as HTMLInputElement).value), centre.y)">
              <input :value="centre.y" type="range" min="0" max="1" step="0.005" class="mt-2 w-full accent-[var(--ui-accent)]" aria-label="Vertical centre" @input="setCrop(zoom, centre.x, Number(($event.target as HTMLInputElement).value))">
            </template>
          </div>

          <div>
            <span class="label">Sync offset {{ settings.sourceOffsetSeconds.toFixed(1) }} s</span>
            <p class="mt-1 text-xs text-ink-subtle">Only if this file and the YouTube upload differ: tag times + offset = file time.</p>
            <div class="mt-2 flex gap-1">
              <button v-for="d in [-1, -0.1, 0.1, 1]" :key="d" type="button" class="btn btn-sm btn-ghost font-mono" @click="settings.sourceOffsetSeconds = Math.round((settings.sourceOffsetSeconds + d) * 10) / 10">
                {{ d > 0 ? '+' : '' }}{{ d }}
              </button>
              <button v-if="derived?.rallyStates[0]" type="button" class="btn btn-sm btn-ghost" @click="seek(derived.rallyStates[0].endsAtSeconds + settings.sourceOffsetSeconds)">
                Check point 1
              </button>
            </div>
          </div>

          <div v-if="breaks.length" class="rounded-xl border border-line">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              :aria-expanded="breaksOpen"
              @click="breaksOpen = !breaksOpen"
            >
              <span class="label">Breaks</span>
              <span class="text-xs text-ink-subtle">{{ breaks.length }} · {{ settings.keepBreaks.length }} kept, {{ breaks.length - settings.keepBreaks.length }} cut</span>
              <ChevronDown :size="15" class="ml-auto text-ink-subtle transition-transform duration-200" :class="breaksOpen ? 'rotate-180' : ''" aria-hidden="true" />
            </button>
            <div v-if="breaksOpen" class="border-t border-line p-3">
              <div class="flex gap-2">
                <button type="button" class="btn btn-sm btn-ghost flex-1" @click="settings.keepBreaks = breaks.map(b => b.idx)">Keep all</button>
                <button type="button" class="btn btn-sm btn-ghost flex-1" @click="settings.keepBreaks = []">Cut all</button>
              </div>
              <ul class="mt-2 flex flex-col gap-1">
                <li v-for="b in breaks" :key="b.idx" class="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-bg-deep">
                  <button type="button" class="font-mono text-xs text-ink-muted hover:text-accent" @click="seek(b.startsAtSeconds + settings.sourceOffsetSeconds)">
                    {{ fmt(b.startsAtSeconds) }}–{{ b.endsAtSeconds === null ? 'end' : fmt(b.endsAtSeconds) }}
                  </button>
                  <button
                    type="button"
                    :aria-pressed="settings.keepBreaks.includes(b.idx)"
                    class="ml-auto inline-flex min-h-7 items-center gap-1 rounded-md border px-2 font-display text-[0.625rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-150"
                    :class="settings.keepBreaks.includes(b.idx) ? 'border-accent/60 bg-accent/15 text-ink' : 'border-line text-ink-subtle hover:text-ink'"
                    @click="settings.keepBreaks = settings.keepBreaks.includes(b.idx) ? settings.keepBreaks.filter(i => i !== b.idx) : [...settings.keepBreaks, b.idx]"
                  >
                    <component :is="settings.keepBreaks.includes(b.idx) ? Eye : Scissors" :size="11" aria-hidden="true" />
                    {{ settings.keepBreaks.includes(b.idx) ? 'Kept' : 'Cut' }}
                  </button>
                </li>
              </ul>
            </div>
          </div>

        </div>

        <!-- Thumbnail -->
        <div v-else-if="tab === 'thumbnail'" class="mt-5 flex flex-col gap-4">
          <PublishThumbnailCanvas :template="template" :lines="lines" :colour="family.colour" :match-id="matchId" :file-stem="`thumbnail-${matchId.slice(0, 8)}`" />
          <div v-for="i in [0, 1] as const" :key="i">
            <label class="flex items-center gap-2">
              <input v-model="settings.thumbnail.show[i]" type="checkbox" class="accent-[var(--ui-accent)]">
              <span class="label">Band {{ i + 1 }}</span>
            </label>
            <input
              :value="settings.thumbnail.lines[i] ?? ''"
              :placeholder="defaultsLines[i]"
              class="field mt-2 uppercase"
              @input="settings.thumbnail.lines[i] = ($event.target as HTMLInputElement).value || null"
            >
          </div>
        </div>

        <!-- Text -->
        <div v-else-if="tab === 'text'" class="mt-5 flex flex-col gap-4">
          <label class="block">
            <span class="label flex items-center justify-between">Title <span class="font-mono">{{ title.length }}/100</span></span>
            <input :value="title" maxlength="100" class="field mt-2" @input="settings.title = ($event.target as HTMLInputElement).value">
          </label>
          <div class="flex gap-2">
            <button type="button" class="btn btn-sm btn-ghost" @click="copy('title')"><Copy :size="14" aria-hidden="true" /> {{ copied === 'title' ? 'Copied' : 'Copy title' }}</button>
            <button v-if="settings.title !== null" type="button" class="btn btn-sm btn-ghost" @click="settings.title = null"><RotateCcw :size="14" aria-hidden="true" /> Generated</button>
          </div>
          <label class="block">
            <span class="label">Description</span>
            <textarea :value="description" rows="16" class="field mt-2 font-mono text-xs" @input="settings.description = ($event.target as HTMLTextAreaElement).value" />
          </label>
          <div class="flex gap-2">
            <button type="button" class="btn btn-sm btn-ghost" @click="copy('description')"><Copy :size="14" aria-hidden="true" /> {{ copied === 'description' ? 'Copied' : 'Copy description' }}</button>
            <button v-if="settings.description !== null" type="button" class="btn btn-sm btn-ghost" @click="settings.description = null"><RotateCcw :size="14" aria-hidden="true" /> Generated</button>
          </div>
          <p class="text-xs text-ink-subtle">Chapters appear once the original is attached (they come from the cut). The render also writes title.txt and description.txt into the upload kit.</p>
        </div>
        <!-- Export: the source to render from, the quality, the render. -->
        <div v-else-if="tab === 'export'" class="mt-5 flex flex-col gap-5">
          <ReelSourcePanel :source="source" :duration="sourceDuration" />
          <!-- Same render section as Highlights and Shorts. -->
          <section class="border-t border-line pt-4">
            <p class="label">Export</p>
            <label class="mt-2.5 block">
              <span class="text-[0.6875rem] text-ink-subtle">Quality</span>
              <select v-model="settings.outputHeight" class="field mt-1">
                <option v-for="h in heights" :key="String(h)" :value="h">{{ h === 2160 ? '4K (2160p)' : h ? `${h}p` : 'Source resolution' }}</option>
              </select>
            </label>
            <!-- ponytail: "Draft 720p" hidden (render(true) still exists), bring the button back when wanted. -->
            <button type="button" class="btn btn-primary mt-3 w-full" :disabled="!plan || job.running.value || !source.precise.value" @click="render(false)">
              <Download :size="16" aria-hidden="true" />
              {{ job.running.value ? 'Rendering…' : 'Render MP4' }}
            </button>
            <p v-if="!source.precise.value" class="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
              Download or attach the source video above to render.
            </p>
            <p v-else-if="plan && !job.running.value && !renderResult" class="mt-2 text-[0.6875rem] text-ink-subtle">
              {{ fmt(plan.totalDuration) }} of film · {{ plan.transitions.length }} stings · {{ plan.scores.length }} score changes · {{ plan.chapters.length }} chapters
            </p>
            <UiProgress v-if="job.running.value" class="mt-3" :value="job.progress.value" :label="job.job.value?.message || 'Rendering'" />
            <p v-if="renderError" class="mt-2 text-xs text-accent">{{ renderError }}</p>
            <p v-if="renderResult" class="mt-3 break-all rounded-lg border border-line px-3 py-2 font-mono text-[0.6875rem] text-ink-subtle">
              Done: {{ renderResult.video }}<br>Upload kit: {{ renderResult.dir }}
            </p>
          </section>
        </div>

      </aside>
    </div>
  </div>
</template>
