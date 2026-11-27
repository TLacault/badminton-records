<script setup lang="ts">
import type { Database, Json } from '~/types/database.types'
import type { BreakInput, MatchConfig, MatchFormat, Side, Slot } from '~~/shared/badminton'
import type { Corner, MatchInfo, RenderRequest } from '~~/shared/publish'
import type { ReelJob } from '~~/shared/reel'
import { Clapperboard, Copy, FileUp, Film, Image as ImageIcon, RotateCcw, Scissors, Type } from '@lucide/vue'
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
const site = useRequestURL()

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

function onAttach(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) source.attach(file)
}
function onMeta() {
  sourceDuration.value = player.value?.duration ?? 0
}
function seek(t: number) {
  if (player.value) player.value.currentTime = t
}

// --- the edit
const plan = computed(() => derived.value && sourceDuration.value
  ? buildEdit({ derived: derived.value, breaks: breaks.value, sourceDuration: sourceDuration.value, settings: settings.value })
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
      matchUrl: `${site.origin}/matches/${matchId}`,
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

function request(draft: boolean): RenderRequest | null {
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
    outputHeight: settings.value.outputHeight,
    draft,
    title: title.value,
    description: description.value,
  }
}

const renderError = ref<string | null>(null)
async function render(draft: boolean) {
  const body = request(draft)
  if (!body) return
  renderError.value = null
  renderResult.value = null
  try {
    await source.upload()
    const { job: started } = await $fetch<{ job: ReelJob }>('/api/publish/render', { method: 'POST', body })
    const out = await job.watch(started)
    renderResult.value = out as { dir: string, video: string }
    // Where the raw footage lands in this render, for the linked YouTube video.
    if (plan.value) await saveEditMap(client as never, matchId, 'match', youtubeEditMap(plan.value.segments, settings.value.intro ? INTRO_SECONDS : 0))
  }
  catch (cause) {
    renderError.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
      ?? (cause instanceof Error ? cause.message : String(cause))
  }
}

const tab = ref<'edit' | 'thumbnail' | 'text'>('edit')
const corners: { value: Corner, label: string }[] = [
  { value: 'tl', label: 'Top left' },
  { value: 'tr', label: 'Top right' },
  { value: 'bl', label: 'Bottom left' },
  { value: 'br', label: 'Bottom right' },
]
const heights = [null, 2160, 1440, 1080, 720] as const
</script>

<template>
  <div v-if="match && info">

    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">
          <Clapperboard :size="15" aria-hidden="true" />
          YouTube
        </p>
        <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
          {{ sideName(info, 0) }} vs {{ sideName(info, 1) }}
        </h1>
      </div>
      <p class="text-xs text-ink-subtle" aria-live="polite">
        {{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : '' }}
      </p>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
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
          <label class="btn btn-sm btn-ghost cursor-pointer">
            <FileUp :size="15" aria-hidden="true" />
            {{ source.mode.value === 'local' ? 'Change file' : 'Attach original' }}
            <input type="file" accept="video/*" class="sr-only" @change="onAttach">
          </label>
          <span class="text-xs text-ink-subtle">
            {{ source.mode.value === 'local' ? 'Local file (copied to the renderer on first render)' : source.mode.value === 'cached' ? 'Original on the renderer' : 'No original attached' }}
          </span>
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
        <div class="flex gap-1 rounded-lg bg-bg-deep p-1" role="tablist">
          <button v-for="t in [{ id: 'edit', label: 'Montage', icon: Scissors }, { id: 'thumbnail', label: 'Miniature', icon: ImageIcon }, { id: 'text', label: 'Texte', icon: Type }] as const" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" class="btn btn-sm flex-1" :class="tab === t.id ? 'btn-primary' : 'btn-ghost'" @click="tab = t.id">
            <component :is="t.icon" :size="14" aria-hidden="true" />
            {{ t.label }}
          </button>
        </div>

        <!-- Montage -->
        <div v-if="tab === 'edit'" class="mt-5 flex flex-col gap-5">
          <p class="flex items-center gap-2 text-sm text-ink-muted">
            <span class="size-2.5 rounded-full" :style="{ background: family.colour }" />
            {{ family.label }}
            <span class="text-ink-subtle">· from the match type (Edit match)</span>
          </p>

          <fieldset class="grid grid-cols-2 gap-2">
            <legend class="label mb-2">Pieces</legend>
            <label v-for="k in (['intro', 'outro', 'transitions', 'scoreboard'] as const)" :key="k" class="flex items-center gap-2 text-sm">
              <input v-model="settings[k]" type="checkbox" class="accent-[var(--ui-accent)]">
              {{ { intro: 'Intro + match card', outro: 'Outro + end screen', transitions: 'Stings (sets, breaks)', scoreboard: 'Scoreboard' }[k] }}
            </label>
          </fieldset>

          <label v-if="settings.scoreboard" class="block">
            <span class="label">Scoreboard corner</span>
            <select v-model="settings.scoreboardCorner" class="field mt-2">
              <option v-for="c in corners" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </label>

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

          <div v-if="breaks.length">
            <span class="label">Breaks ({{ breaks.length }})</span>
            <ul class="mt-2 flex flex-col gap-1 text-sm">
              <li v-for="b in breaks" :key="b.idx" class="flex items-center gap-2">
                <button type="button" class="font-mono text-xs text-ink-muted hover:text-accent" @click="seek(b.startsAtSeconds + settings.sourceOffsetSeconds)">
                  {{ fmt(b.startsAtSeconds) }}–{{ b.endsAtSeconds === null ? 'end' : fmt(b.endsAtSeconds) }}
                </button>
                <label class="ml-auto flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    :checked="settings.keepBreaks.includes(b.idx)"
                    class="accent-[var(--ui-accent)]"
                    @change="settings.keepBreaks = ($event.target as HTMLInputElement).checked ? [...settings.keepBreaks, b.idx] : settings.keepBreaks.filter(i => i !== b.idx)"
                  >
                  Keep
                </label>
              </li>
            </ul>
          </div>

          <label class="block">
            <span class="label">Output</span>
            <select v-model="settings.outputHeight" class="field mt-2">
              <option v-for="h in heights" :key="String(h)" :value="h">{{ h ? `${h}p` : 'Source resolution' }}</option>
            </select>
          </label>

          <div class="border-t border-line pt-4">
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-ghost" :disabled="!plan || job.running.value" @click="render(true)">
                <Film :size="15" aria-hidden="true" /> Draft 720p
              </button>
              <button type="button" class="btn btn-sm btn-primary" :disabled="!plan || job.running.value" @click="render(false)">
                <Clapperboard :size="15" aria-hidden="true" /> Render
              </button>
            </div>
            <div v-if="job.running.value" class="mt-3">
              <div class="h-1 overflow-hidden rounded-full bg-bg-deep">
                <div class="h-full rounded-full bg-accent transition-[width] duration-300" :style="{ width: `${Math.round((job.progress.value ?? 0) * 100)}%` }" />
              </div>
              <p class="mt-1 text-xs text-ink-subtle">{{ job.job.value?.message || 'Working…' }}</p>
            </div>
            <p v-if="renderError" class="mt-2 text-xs text-accent">{{ renderError }}</p>
            <p v-if="renderResult" class="mt-2 break-all font-mono text-[0.6875rem] text-ink-subtle">
              Done: {{ renderResult.video }}<br>Upload kit: {{ renderResult.dir }}
            </p>
            <p v-if="plan" class="mt-2 text-xs text-ink-subtle">
              {{ plan.transitions.length }} stings · {{ plan.scores.length }} score changes · {{ plan.chapters.length }} chapters
            </p>
          </div>
        </div>

        <!-- Miniature -->
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

        <!-- Texte -->
        <div v-else class="mt-5 flex flex-col gap-4">
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
      </aside>
    </div>
  </div>
</template>
