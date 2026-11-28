<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { KitKind, UploadKit } from '~/utils/pipelineKit'
import { BellRing, Check, CircleAlert, Clapperboard, Copy, Download, ExternalLink, Hourglass, Pause, Play, RefreshCw, RotateCcw, Smartphone, Sparkles, Tag, Upload, Workflow } from '@lucide/vue'
import PublishTool from './publish.vue'

/**
 * The whole chain for one raw match, run from this tab: download the source,
 * wait for the tagging, render the YouTube edit and the Highlights, wait for
 * their upload, wait for the Shorts, wait for its upload. Machine steps run on
 * their own; at a step that needs Tim it stops, notifies and polls until the
 * work shows up (tagged in the DB, a render kit, the video on the channel).
 *
 * Renders go through the real tools, mounted out of sight, so a pipeline
 * render is the same file the tool's Render button makes. Progress is kept per
 * match in localStorage: a reload resumes at the first unfinished step.
 */
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true, matchTool: 'pipeline', pageTransition: false })

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: match, refresh: refreshMatch } = await useAsyncData(`pipeline-${matchId}`, async () => {
  const { data } = await client.from('matches').select('id, title, youtube_title, youtube_video_id, tagging_status, video_kind').eq('id', matchId).maybeSingle()
  return data
})

// ── State ───────────────────────────────────────────────────────────────────

type StepId = 'download' | 'tag' | 'youtube' | 'highlights' | 'upload' | 'shorts' | 'upload-shorts'
type Status = 'todo' | 'running' | 'waiting' | 'done' | 'error'
interface StepState { status: Status, message?: string, since?: number }
const HEIGHTS = [2160, 1440, 1080, 720] as const
type Height = typeof HEIGHTS[number]

const STORAGE_KEY = `ust-pipeline-v1:${matchId}`
const state = ref<{ height: Height, steps: Partial<Record<StepId, StepState>> }>({ height: 2160, steps: {} })
const step = (id: StepId): StepState => state.value.steps[id] ?? { status: 'todo' }
function set(id: StepId, next: StepState) {
  state.value.steps = { ...state.value.steps, [id]: next }
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved) {
      // Nothing runs after a reload: a step caught mid-way starts over.
      for (const s of Object.values(saved.steps ?? {}) as StepState[]) {
        if (s.status === 'running' || s.status === 'waiting') s.status = 'todo'
      }
      state.value = saved
    }
  }
  catch {}
  loadKits()
})
watch(state, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value)), { deep: true })

// ── Runner ──────────────────────────────────────────────────────────────────

const active = ref(false)
const pauseAsked = ref(false)
let wake: (() => void) | null = null

/** Sleep that Pause and "Check now" cut short. */
const nap = (ms: number) => new Promise<void>((resolve) => {
  const t = setTimeout(done, ms)
  function done() {
    clearTimeout(t)
    wake = null
    resolve()
  }
  wake = done
})

/** Polls until `check` holds; false when paused (or past the deadline, which throws). */
async function waitFor(check: () => boolean | Promise<boolean>, every: number, timeout?: { ms: number, message: string }) {
  const end = timeout ? Date.now() + timeout.ms : Infinity
  while (!pauseAsked.value) {
    if (await check()) return true
    if (Date.now() > end) throw new Error(timeout!.message)
    await nap(every)
  }
  return false
}

const source = useReelSource(computed(() => match.value?.youtube_video_id ?? null))

// The tool a render step is running through, mounted hidden below.
const tool = ref<{ ready: boolean, progress: number | null, message: string, run: (h: Height) => Promise<void> } | null>(null)
const mounted = ref<'youtube' | 'highlights' | null>(null)
async function renderWith(which: 'youtube' | 'highlights') {
  mounted.value = which
  try {
    const ready = await waitFor(() => !!tool.value?.ready, 500, {
      ms: 120_000,
      message: which === 'highlights' ? 'The Highlights editor has nothing to render (no starred rally?)' : 'The YouTube editor could not build the edit',
    })
    if (!ready) return false
    await tool.value!.run(state.value.height)
    loadKits()
  }
  finally {
    mounted.value = null
  }
}

const kits = ref<Record<KitKind, UploadKit | null>>({ match: null, highlights: null, shorts: null })
const found = ref<Partial<Record<KitKind, boolean>>>({})
function loadKits() {
  kits.value = { match: readKit(matchId, 'match'), highlights: readKit(matchId, 'highlights'), shorts: readKit(matchId, 'shorts') }
}

/** Imports the channel, then links each kit's video to this raw once it shows up (matched by title). */
async function linked(kinds: KitKind[]) {
  await $fetch('/api/youtube/import', { method: 'POST' })
  for (const kind of kinds) {
    const kit = kits.value[kind]
    if (!kit || found.value[kind]) continue
    const { data } = await client.from('matches').select('id, source_match_id').eq('youtube_title', kit.title.trim()).neq('id', matchId).limit(1)
    const row = data?.[0]
    if (!row) continue
    if (row.source_match_id !== matchId) await client.from('matches').update({ source_match_id: matchId }).eq('id', row.id)
    found.value = { ...found.value, [kind]: true }
  }
  if (kinds.every(k => found.value[k])) refreshNuxtData('admin-match-nav')
  return kinds.every(k => found.value[k])
}

interface Step {
  id: StepId
  label: string
  icon: typeof Tag
  /** Needs Tim: stops, notifies and waits. */
  human?: boolean
  /** Upload steps: the kits shown to upload. */
  kits?: KitKind[]
  run: () => Promise<boolean | void>
}

const STEPS: Step[] = [
  {
    id: 'download',
    label: 'Download source',
    icon: Download,
    async run() {
      await source.fetchSource(state.value.height)
      if (source.error.value) throw new Error(source.error.value)
    },
  },
  {
    id: 'tag',
    label: 'Tag the match',
    icon: Tag,
    human: true,
    run: () => waitFor(async () => {
      await refreshMatch()
      return match.value?.tagging_status === 'tagged'
    }, 5000),
  },
  { id: 'youtube', label: 'Render YouTube', icon: Clapperboard, run: () => renderWith('youtube') },
  { id: 'highlights', label: 'Render Highlights', icon: Sparkles, run: () => renderWith('highlights') },
  {
    id: 'upload',
    label: 'Upload YouTube + Highlights',
    icon: Upload,
    human: true,
    kits: ['match', 'highlights'],
    run: () => waitFor(() => linked(['match', 'highlights']), 60_000),
  },
  {
    id: 'shorts',
    label: 'Make the Shorts',
    icon: Smartphone,
    human: true,
    run: () => waitFor(() => {
      loadKits()
      return (kits.value.shorts?.at ?? 0) > (step('shorts').since ?? 0)
    }, 3000),
  },
  {
    id: 'upload-shorts',
    label: 'Upload Shorts',
    icon: Upload,
    human: true,
    kits: ['shorts'],
    run: () => waitFor(() => linked(['shorts']), 60_000),
  },
]

const TURN: Partial<Record<StepId, { text: string, to: string, label: string }>> = {
  tag: { text: 'Tag every rally, then mark the match tagged. The chain carries on by itself.', to: `/admin/matches/${matchId}/tag`, label: 'Open the tagger' },
  shorts: { text: 'Pick the shots and render in the Shorts tool. The chain picks the render up.', to: `/admin/matches/${matchId}/shorts`, label: 'Open Shorts' },
  upload: { text: 'Upload both with the title, description and thumbnail below (public). Checked every minute; linked when found.', to: 'https://studio.youtube.com', label: 'YouTube Studio' },
  'upload-shorts': { text: 'Upload the Short with the text and cover below. Checked every minute; linked when found.', to: 'https://studio.youtube.com', label: 'YouTube Studio' },
}

async function start() {
  if (active.value) return
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
  active.value = true
  pauseAsked.value = false
  try {
    for (const s of STEPS) {
      if (step(s.id).status === 'done') continue
      if (pauseAsked.value) break
      set(s.id, { status: s.human ? 'waiting' : 'running', since: step(s.id).since ?? Date.now() })
      if (s.human) notify(`Your turn: ${s.label}`)
      try {
        const result = await s.run()
        if (result === false) {
          set(s.id, { ...step(s.id), status: 'todo' })
          break
        }
        set(s.id, { status: 'done', since: step(s.id).since })
      }
      catch (cause) {
        const message = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage ?? (cause instanceof Error ? cause.message : String(cause))
        set(s.id, { status: 'error', message })
        notify(`${s.label} failed: ${message}`)
        break
      }
    }
    if (allDone.value) notify('Pipeline done: every video is up and linked.')
  }
  finally {
    active.value = false
    pauseAsked.value = false
  }
}

function pause() {
  pauseAsked.value = true
  wake?.()
}

function checkNow() {
  wake?.()
}

/** Back to to-do; the next Start runs it again. */
function redo(id: StepId) {
  set(id, { status: 'todo' })
  if (id === 'upload') found.value = { ...found.value, match: false, highlights: false }
  if (id === 'upload-shorts') found.value = { ...found.value, shorts: false }
}

const allDone = computed(() => STEPS.every(s => step(s.id).status === 'done'))
const started = computed(() => STEPS.some(s => step(s.id).status !== 'todo'))
const doneCount = computed(() => STEPS.filter(s => step(s.id).status === 'done').length)
const yourTurn = computed(() => STEPS.find(s => step(s.id).status === 'waiting'))

// ── Telling Tim ─────────────────────────────────────────────────────────────

function notify(body: string) {
  if (!import.meta.client) return
  if ('Notification' in window && Notification.permission === 'granted') new Notification('Badminton Records', { body })
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  }
  catch {}
}

// Critical: the hidden tool sets its own title while it renders.
useHead({ title: computed(() => `${yourTurn.value ? '● ' : active.value ? '▶ ' : ''}Pipeline`) }, { tagPriority: 'critical' })

// ── Display ─────────────────────────────────────────────────────────────────

function progressOf(s: Step) {
  const st = step(s.id).status
  if (st === 'done') return 1
  if (st !== 'running') return 0
  if (s.id === 'download') return source.progress.value ?? 0
  return tool.value?.progress ?? 0
}
function labelOf(s: Step) {
  const st = step(s.id)
  if (st.status === 'error') return st.message ?? 'Failed'
  if (st.status === 'done') return 'Done'
  if (st.status === 'running') return s.id === 'download' ? (source.message.value || 'Downloading') : tool.value?.ready ? (tool.value.message || 'Rendering') : 'Preparing the edit'
  return 'Waiting'
}

const copied = ref<string | null>(null)
async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  copied.value = what
  setTimeout(() => (copied.value = null), 1500)
}
const KIT_LABEL: Record<KitKind, string> = { match: 'YouTube', highlights: 'Highlights', shorts: 'Shorts' }
</script>

<template>
  <div v-if="match">
    <AdminToolHeader :icon="Workflow" :title="match.youtube_title || match.title" :subtitle="`Pipeline · ${doneCount}/${STEPS.length} steps done`">
      <template #actions>
        <label class="flex items-center gap-2">
          <span class="text-[0.6875rem] text-ink-subtle">Quality</span>
          <select v-model.number="state.height" class="field !min-h-8 !py-1 text-sm" :disabled="active">
            <option v-for="h in HEIGHTS" :key="h" :value="h">{{ h === 2160 ? '4K (2160p)' : `${h}p` }}</option>
          </select>
        </label>
        <button v-if="!active" type="button" class="btn btn-sm btn-primary" :disabled="allDone || !match.youtube_video_id" @click="start">
          <Play :size="14" aria-hidden="true" /> {{ allDone ? 'All done' : started ? 'Resume' : 'Start' }}
        </button>
        <button v-else type="button" class="btn btn-sm btn-ghost" :disabled="pauseAsked" @click="pause">
          <Pause :size="14" aria-hidden="true" /> {{ pauseAsked ? 'Pausing after this step…' : 'Pause' }}
        </button>
      </template>
    </AdminToolHeader>

    <p v-if="match.video_kind !== 'raw'" class="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
      This is not the raw recording. The pipeline runs on the raw video of the match.
    </p>

    <ol class="mt-6 flex flex-col gap-3">
      <li
        v-for="(s, i) in STEPS"
        :key="s.id"
        class="rounded-2xl border p-4 transition-[border-color,background-color] duration-300 sm:p-5"
        :class="step(s.id).status === 'waiting' ? 'border-accent/60 bg-accent/10' : step(s.id).status === 'error' ? 'border-accent/60' : 'border-line'"
        :style="step(s.id).status === 'waiting' ? 'box-shadow: var(--ui-glow-soft)' : undefined"
      >
        <div class="flex items-center gap-3">
          <span
            class="grid size-9 shrink-0 place-items-center rounded-xl"
            :class="step(s.id).status === 'done' ? 'bg-brand text-on-brand' : step(s.id).status === 'todo' ? 'bg-bg-deep text-ink-subtle' : 'bg-accent/20 text-accent'"
          >
            <Check v-if="step(s.id).status === 'done'" :size="16" aria-hidden="true" />
            <CircleAlert v-else-if="step(s.id).status === 'error'" :size="16" aria-hidden="true" />
            <component :is="s.icon" v-else :size="16" aria-hidden="true" />
          </span>
          <p class="font-display text-sm font-semibold uppercase tracking-[0.08em]">
            <span class="mr-1.5 font-mono text-ink-subtle">{{ i + 1 }}</span>{{ s.label }}
          </p>
          <span v-if="step(s.id).status === 'waiting'" class="ml-1 inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-widest text-white">
            <BellRing :size="11" aria-hidden="true" /> Your turn
          </span>
          <div class="ml-auto flex items-center gap-2">
            <button v-if="step(s.id).status === 'waiting' && s.kits" type="button" class="btn btn-sm btn-ghost" @click="checkNow">
              <RefreshCw :size="13" aria-hidden="true" /> Check now
            </button>
            <button v-if="!active && (step(s.id).status === 'done' || step(s.id).status === 'error')" type="button" class="btn btn-sm btn-ghost" title="Run this step again on the next Start" @click="redo(s.id)">
              <RotateCcw :size="13" aria-hidden="true" /> Redo
            </button>
          </div>
        </div>

        <!-- Machine step: its bar. -->
        <UiProgress v-if="!s.human" class="mt-3" :class="step(s.id).status === 'todo' ? 'opacity-40' : ''" :value="progressOf(s)" :label="labelOf(s)" />

        <!-- Human step: what to do, and where. -->
        <template v-else>
          <p v-if="step(s.id).status === 'error'" class="mt-2 text-xs text-accent">{{ step(s.id).message }}</p>
          <div v-else-if="step(s.id).status === 'waiting' && TURN[s.id]" class="mt-3 flex flex-wrap items-center gap-3">
            <p class="text-sm text-ink-muted">{{ TURN[s.id]!.text }}</p>
            <a :href="TURN[s.id]!.to" target="_blank" rel="noopener" class="btn btn-sm btn-primary ml-auto">
              {{ TURN[s.id]!.label }} <ExternalLink :size="13" aria-hidden="true" />
            </a>
          </div>
          <p v-else-if="step(s.id).status === 'done'" class="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
            <Check :size="12" aria-hidden="true" /> Done
          </p>
          <p v-else-if="step(s.id).status === 'todo'" class="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
            <Hourglass :size="12" aria-hidden="true" /> Needs you when the chain gets here
          </p>

          <!-- Upload kits: everything the upload needs. -->
          <div v-if="s.kits && (step(s.id).status !== 'todo' || s.kits.some(k => kits[k]))" class="mt-4 grid gap-4 lg:grid-cols-2">
            <div v-for="kind in s.kits" :key="kind" class="rounded-xl border border-line p-4">
              <p class="label flex items-center gap-2">
                {{ KIT_LABEL[kind] }}
                <span v-if="found[kind] || step(s.id).status === 'done'" class="inline-flex items-center gap-1 text-accent"><Check :size="12" aria-hidden="true" /> On YouTube, linked</span>
              </p>
              <template v-if="kits[kind]">
                <p class="mt-2 text-sm font-medium">{{ kits[kind]!.title }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button type="button" class="btn btn-sm btn-ghost" @click="copy(kits[kind]!.title, `${kind}-title`)">
                    <Copy :size="13" aria-hidden="true" /> {{ copied === `${kind}-title` ? 'Copied' : 'Title' }}
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" @click="copy(kits[kind]!.description, `${kind}-desc`)">
                    <Copy :size="13" aria-hidden="true" /> {{ copied === `${kind}-desc` ? 'Copied' : 'Description' }}
                  </button>
                  <button v-if="kits[kind]!.path" type="button" class="btn btn-sm btn-ghost" @click="copy(kits[kind]!.path!, `${kind}-path`)">
                    <Copy :size="13" aria-hidden="true" /> {{ copied === `${kind}-path` ? 'Copied' : 'File path' }}
                  </button>
                  <a v-if="kits[kind]!.url" :href="kits[kind]!.url" class="btn btn-sm btn-ghost">
                    <Download :size="13" aria-hidden="true" /> Video
                  </a>
                </div>
                <p v-if="kits[kind]!.path" class="mt-2 break-all font-mono text-[0.6875rem] text-ink-subtle">{{ kits[kind]!.path }}</p>
                <PublishThumbnailCanvas class="mt-3" v-bind="kits[kind]!.thumb as any" />
              </template>
              <p v-else class="mt-2 text-xs text-ink-subtle">No render yet.</p>
            </div>
          </div>
        </template>
      </li>
    </ol>

    <!-- The tool a render step runs through, out of sight. -->
    <div v-if="mounted" class="hidden" aria-hidden="true">
      <Suspense>
        <PublishTool v-if="mounted === 'youtube'" ref="tool" />
        <ReelEditor v-else ref="tool" orientation="landscape" />
      </Suspense>
    </div>
  </div>
</template>
