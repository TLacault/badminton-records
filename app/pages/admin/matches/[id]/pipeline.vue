<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { KitKind, RenderNote } from '~/utils/pipelineKit'
import { BellRing, Check, CircleAlert, Clapperboard, Copy, Download, ExternalLink, Film, FolderOpen, LoaderCircle, Pause, Play, RefreshCw, RotateCcw, Smartphone, Trash2, Sparkles, Tag, Upload, Workflow } from '@lucide/vue'
import PublishTool from './publish.vue'

/**
 * The whole chain for one raw match, run from this tab, as four docks: the raw
 * (download, tagging), then YouTube, Highlights and Shorts (make, upload).
 * The three videos only wait for the raw; renders run one at a time, the
 * waits for Tim run side by side. At a step that needs Tim it notifies and
 * polls until the work shows up (tagged in the DB, a Shorts render, the video
 * on the channel, which it then links to the raw).
 *
 * Renders go through the real tools, mounted out of sight, so a pipeline
 * render is the file the tool's Render button makes. Each render fills an
 * upload folder (video, thumbnail, title, description) the dock opens in the
 * file manager. Progress is kept per match in localStorage.
 */
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true, matchTool: 'pipeline', pageTransition: false })

const route = useRoute()
const NuxtLink = resolveComponent('NuxtLink')
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: match, refresh: refreshMatch } = await useAsyncData(`pipeline-${matchId}`, async () => {
  const { data } = await client.from('matches').select('id, title, youtube_title, youtube_video_id, youtube_thumbnail_url, tagging_status, video_kind').eq('id', matchId).maybeSingle()
  return data
})

/** The videos already linked to this raw, for the docks' pictures and links. */
const { data: linkedVideos, refresh: refreshLinked } = await useAsyncData(`pipeline-linked-${matchId}`, async () => {
  const { data } = await client.from('matches').select('id, video_kind, youtube_title, youtube_thumbnail_url').eq('source_match_id', matchId)
  return data ?? []
})
const linkedOf = (kind: KitKind) => linkedVideos.value?.find(v => v.video_kind === kind) ?? null

// ── Steps ───────────────────────────────────────────────────────────────────

type StepId = 'download' | 'tag' | 'yt-render' | 'yt-upload' | 'hl-render' | 'hl-upload' | 'sh-make' | 'sh-upload'
type Status = 'todo' | 'running' | 'waiting' | 'done' | 'error'
interface StepState { status: Status, message?: string, since?: number }

interface Step {
  id: StepId
  label: string
  /** Needs Tim: notifies and waits for the work to show up. */
  human?: boolean
  /** Renders: one at a time. */
  exclusive?: boolean
  after: StepId[]
  /** Upload steps: the video they wait for. */
  upload?: KitKind
  run: () => Promise<boolean | void>
}

const HEIGHTS = [2160, 1440, 1080, 720] as const
type Height = typeof HEIGHTS[number]

const STORAGE_KEY = `ust-pipeline-v2:${matchId}`
const state = ref<{ height: Height, steps: Partial<Record<StepId, StepState>> }>({ height: 2160, steps: {} })
const step = (id: StepId): StepState => state.value.steps[id] ?? { status: 'todo' }
function set(id: StepId, next: StepState) {
  state.value.steps = { ...state.value.steps, [id]: next }
}

// ── Runner ──────────────────────────────────────────────────────────────────

const active = ref(false)
const pauseAsked = ref(false)
const wakers = new Set<() => void>()
const wakeAll = () => [...wakers].forEach(w => w())

/** Sleep that Pause and "Check now" cut short. */
const nap = (ms: number) => new Promise<void>((resolve) => {
  const done = () => {
    clearTimeout(t)
    wakers.delete(done)
    resolve()
  }
  const t = setTimeout(done, ms)
  wakers.add(done)
})

/** Polls until `check` holds; false when paused (past the deadline, it throws). */
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
const { refresh: refreshCaps } = useReelCapabilities()

// The tool a render runs through, mounted hidden at the bottom of the page.
const tool = ref<{ ready: boolean, progress: number | null, message: string, run: (h: Height) => Promise<void> } | null>(null)
const mounted = ref<'youtube' | 'highlights' | null>(null)
// Renders in flight anywhere in this browser (the render ledger), by video.
const live = { match: useLiveRender(matchId, 'match'), highlights: useLiveRender(matchId, 'highlights'), shorts: useLiveRender(matchId, 'shorts') }
const RENDER_KIND: Partial<Record<StepId, KitKind>> = { 'yt-render': 'match', 'hl-render': 'highlights', 'sh-make': 'shorts' }
const liveFor = (id: StepId) => (RENDER_KIND[id] ? live[RENDER_KIND[id]!].value : null)

async function renderWith(which: 'youtube' | 'highlights') {
  const kind = which === 'youtube' ? 'match' : 'highlights'
  // Already rendering (started in its tool, or before a reload): follow that one.
  if (!pendingRender(matchId, kind)) {
    mounted.value = which
    try {
      const ready = await waitFor(() => !!tool.value?.ready, 500, {
        ms: 120_000,
        message: which === 'highlights' ? 'Nothing to render: no starred rally?' : 'The YouTube edit could not be built',
      })
      if (!ready) return false
      await tool.value!.run(state.value.height)
    }
    finally {
      mounted.value = null
    }
  }
  // Done once the ledger has saved the edit map and filled the upload folder.
  const settled = await waitFor(() => !pendingRender(matchId, kind) && live[kind].value?.state !== 'finishing', 1000)
  if (!settled) return false
  if (live[kind].value?.state === 'error') throw new Error(live[kind].value!.message)
  loadKits()
}

const kits = ref<Record<KitKind, RenderNote | null>>({ match: null, highlights: null, shorts: null })
function loadKits() {
  kits.value = { match: readKit(matchId, 'match'), highlights: readKit(matchId, 'highlights'), shorts: readKit(matchId, 'shorts') }
}

/** One channel import serves every upload step polling at the same time. */
let importing: Promise<unknown> | null = null
let importedAt = 0
function importChannel() {
  if (!importing || Date.now() - importedAt > 20_000) {
    importedAt = Date.now()
    importing = $fetch<unknown>('/api/youtube/import' as string, { method: 'POST' })
  }
  return importing
}

/** Done once the video is on the channel (found by its title) and linked to this raw. */
async function uploaded(kind: KitKind) {
  await importChannel()
  const kit = kits.value[kind]
  if (kit) {
    // This render's video, by its title: another video of the same kind linked earlier does not count.
    const { data } = await client.from('matches').select('id, source_match_id').eq('youtube_title', kit.title.trim()).neq('id', matchId).limit(1)
    const row = data?.[0]
    if (!row) return false
    if (row.source_match_id !== matchId) await client.from('matches').update({ source_match_id: matchId }).eq('id', row.id)
  }
  await refreshLinked()
  if (!linkedOf(kind)) return false
  await cleanUp(kind)
  refreshNuxtData('admin-match-nav')
  return true
}

/**
 * On YouTube: the upload folder and the render behind it go (gigabytes), and
 * once all three videos are up, the downloaded raw source too. The raw stays
 * on YouTube; download it again to re-render.
 */
async function cleanUp(kind: KitKind) {
  await $fetch(`/api/pipeline/${matchId}/${kind}`, { method: 'DELETE' }).catch(() => {})
  if ((['match', 'highlights', 'shorts'] as const).every(k => linkedOf(k)) && source.cached.value) await source.forget().catch(() => {})
}

// ── What is already true ────────────────────────────────────────────────────

/**
 * A step is done when its result exists, whether or not the chain ran it: the
 * source on disk, the match tagged, a render newer than the step's last redo,
 * the video on the channel under the render's title. Read all the time, so a
 * render made in a tool while the chain is paused moves the dock on.
 */
const renderedSince = (kind: KitKind, id: StepId) => !pendingRender(matchId, kind) && !!kits.value[kind] && kits.value[kind]!.at > (step(id).since ?? 0)
const onChannel = (kind: KitKind) => !!kits.value[kind] && linkedOf(kind)?.youtube_title?.trim() === kits.value[kind]!.title.trim()
const FACT: Record<StepId, () => boolean> = {
  'download': () => source.cached.value,
  'tag': () => match.value?.tagging_status === 'tagged',
  'yt-render': () => renderedSince('match', 'yt-render'),
  'hl-render': () => renderedSince('highlights', 'hl-render'),
  'sh-make': () => renderedSince('shorts', 'sh-make'),
  'yt-upload': () => onChannel('match'),
  'hl-upload': () => onChannel('highlights'),
  'sh-upload': () => onChannel('shorts'),
}

function syncFacts() {
  for (const s of STEPS) {
    const st = step(s.id)
    if (st.status !== 'todo' && st.status !== 'error') continue
    if (!FACT[s.id]()) continue
    set(s.id, { status: 'done', since: st.since })
    if (s.upload) cleanUp(s.upload)
  }
}

const STEPS: Step[] = [
  {
    id: 'download',
    label: 'Download',
    after: [],
    async run() {
      await source.fetchSource(state.value.height)
      if (source.error.value) throw new Error(source.error.value)
    },
  },
  {
    id: 'tag',
    label: 'Tag',
    human: true,
    after: [],
    run: () => waitFor(async () => {
      await refreshMatch()
      return match.value?.tagging_status === 'tagged'
    }, 5000),
  },
  { id: 'yt-render', label: 'Render', exclusive: true, after: ['download', 'tag'], run: () => renderWith('youtube') },
  { id: 'yt-upload', label: 'Upload', human: true, upload: 'match', after: ['yt-render'], run: () => waitFor(() => uploaded('match'), 60_000) },
  { id: 'hl-render', label: 'Render', exclusive: true, after: ['download', 'tag'], run: () => renderWith('highlights') },
  { id: 'hl-upload', label: 'Upload', human: true, upload: 'highlights', after: ['hl-render'], run: () => waitFor(() => uploaded('highlights'), 60_000) },
  {
    id: 'sh-make',
    label: 'Pick & render',
    human: true,
    after: ['download', 'tag'],
    run: () => waitFor(() => {
      loadKits()
      return (kits.value.shorts?.at ?? 0) > (step('sh-make').since ?? 0)
    }, 3000),
  },
  { id: 'sh-upload', label: 'Upload', human: true, upload: 'shorts', after: ['sh-make'], run: () => waitFor(() => uploaded('shorts'), 60_000) },
]
const byId = Object.fromEntries(STEPS.map(s => [s.id, s])) as Record<StepId, Step>
const ready = (s: Step) => s.after.every(d => step(d).status === 'done')

const errorText = (cause: unknown) => (cause as { data?: { statusMessage?: string } })?.data?.statusMessage ?? (cause instanceof Error ? cause.message : String(cause))

async function launch(s: Step) {
  set(s.id, { status: s.human ? 'waiting' : 'running', since: step(s.id).since ?? Date.now() })
  if (s.human) notify(`Your turn: ${DOCK_OF[s.id].label} · ${s.label}`)
  try {
    const result = await s.run()
    set(s.id, result === false ? { ...step(s.id), status: 'todo' } : { status: 'done', since: step(s.id).since })
  }
  catch (cause) {
    set(s.id, { status: 'error', message: errorText(cause) })
    notify(`${DOCK_OF[s.id].label} · ${s.label} failed: ${errorText(cause)}`)
  }
}

/** Starts every step whose inputs are done (one render at a time), until nothing is left to start. */
async function start() {
  if (active.value) return
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
  active.value = true
  pauseAsked.value = false
  const running = new Map<StepId, Promise<void>>()
  try {
    while (true) {
      if (!pauseAsked.value) {
        for (const s of STEPS) {
          if (running.has(s.id) || step(s.id).status !== 'todo' || !ready(s)) continue
          if (s.exclusive && [...running.keys()].some(id => byId[id].exclusive)) continue
          running.set(s.id, launch(s).finally(() => running.delete(s.id)))
        }
      }
      if (!running.size) break
      await Promise.race(running.values())
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
  wakeAll()
}

/** Back to to-do; the next Start runs it again. */
function redo(id: StepId) {
  // Stamped: a render older than the redo no longer counts as this step done.
  set(id, { status: 'todo', since: Date.now() })
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
  syncFacts()
  // Renders land in localStorage from any page or tab; the DB moves when Tim tags or links.
  let ticks = 0
  const timer = setInterval(async () => {
    loadKits()
    syncFacts()
    // Uploads are looked for every minute even while the chain is paused: they are Tim's to do whenever.
    if (++ticks % 20 || active.value) return
    for (const s of STEPS) {
      if (!s.upload || step(s.id).status !== 'todo' || !ready(s) || !kits.value[s.upload]) continue
      if (await uploaded(s.upload).catch(() => false)) set(s.id, { status: 'done', since: step(s.id).since })
    }
  }, 3000)
  const onFocus = () => Promise.all([refreshMatch(), refreshLinked(), refreshCaps()]).then(syncFacts)
  window.addEventListener('focus', onFocus)
  onBeforeUnmount(() => {
    clearInterval(timer)
    window.removeEventListener('focus', onFocus)
  })
})
watch(state, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value)), { deep: true })

// ── Telling Tim ─────────────────────────────────────────────────────────────

function notify(body: string) {
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

const allDone = computed(() => STEPS.every(s => step(s.id).status === 'done'))
const started = computed(() => STEPS.some(s => step(s.id).status !== 'todo'))
const doneCount = computed(() => STEPS.filter(s => step(s.id).status === 'done').length)
const turns = computed(() => STEPS.filter(s => step(s.id).status === 'waiting').length)

// Critical: the hidden tool sets its own title while it renders.
useHead({ title: computed(() => `${turns.value ? '● ' : active.value ? '▶ ' : ''}Pipeline`) }, { tagPriority: 'critical' })

// ── Docks ───────────────────────────────────────────────────────────────────

const DOCKS = [
  { id: 'raw', label: 'Raw', icon: Film, steps: ['download', 'tag'] as StepId[], kind: null },
  { id: 'match', label: 'YouTube', icon: Clapperboard, steps: ['yt-render', 'yt-upload'] as StepId[], kind: 'match' as const },
  { id: 'highlights', label: 'Highlights', icon: Sparkles, steps: ['hl-render', 'hl-upload'] as StepId[], kind: 'highlights' as const },
  { id: 'shorts', label: 'Shorts', icon: Smartphone, steps: ['sh-make', 'sh-upload'] as StepId[], kind: 'shorts' as const },
]
type Dock = typeof DOCKS[number]
const DOCK_OF = Object.fromEntries(DOCKS.flatMap(d => d.steps.map(id => [id, d]))) as Record<StepId, Dock>

const STEP_ICON: Record<StepId, typeof Tag> = {
  'download': Download,
  'tag': Tag,
  'yt-render': Clapperboard,
  'hl-render': Sparkles,
  'sh-make': Smartphone,
  'yt-upload': Upload,
  'hl-upload': Upload,
  'sh-upload': Upload,
}

/** Where a waiting step sends Tim. */
const OPEN: Partial<Record<StepId, { to: string, label: string }>> = {
  'tag': { to: `/admin/matches/${matchId}/tag`, label: 'Tagger' },
  'sh-make': { to: `/admin/matches/${matchId}/shorts`, label: 'Shorts tool' },
}

function picture(d: Dock) {
  if (!d.kind) return { src: match.value?.youtube_thumbnail_url ?? null, to: `/admin/matches/${matchId}` }
  const v = linkedOf(d.kind)
  return { src: v?.youtube_thumbnail_url ?? kits.value[d.kind]?.preview ?? null, to: v ? `/admin/matches/${v.id}` : null }
}

/** One word for the dock's corner. */
function dockState(d: Dock): { text: string, tone: 'turn' | 'live' | 'done' | 'error' | 'idle' } {
  const states = d.steps.map(step)
  if (states.some(s => s.status === 'error')) return { text: 'Failed', tone: 'error' }
  const rendering = d.steps.find(id => liveFor(id) && liveFor(id)!.state !== 'error')
  if (rendering) return { text: `${Math.round(progressOf(rendering) * 100)}%`, tone: 'live' }
  if (states.some(s => s.status === 'waiting')) return { text: 'Your turn', tone: 'turn' }
  const run = d.steps.find(id => step(id).status === 'running')
  if (run) return { text: `${Math.round(progressOf(run) * 100)}%`, tone: 'live' }
  if (states.every(s => s.status === 'done')) return { text: d.kind ? 'On YouTube' : 'Ready', tone: 'done' }
  if (d.kind && linkedOf(d.kind)) return { text: 'On YouTube', tone: 'done' }
  return { text: d.steps.some(id => ready(byId[id])) ? 'Next' : 'Waits for raw', tone: 'idle' }
}

function progressOf(id: StepId) {
  const st = step(id).status
  // A render running now (even of a step done before) shows its own bar.
  const l = liveFor(id)
  if (l && l.state !== 'error') return l.progress ?? 0
  if (st === 'done') return 1
  if (st !== 'running') return 0
  if (id === 'download') return source.progress.value ?? 0
  return tool.value?.progress ?? 0
}

function detailOf(id: StepId) {
  const st = step(id)
  const s = byId[id]
  switch (st.status) {
    case 'error': return st.message ?? 'Failed'
    case 'done': return liveFor(id) && liveFor(id)!.state !== 'error' ? (liveFor(id)!.message || 'Rendering') : s.upload ? 'Linked' : id === 'download' ? 'On disk' : 'Done'
    case 'running': return id === 'download' ? (source.message.value || 'Downloading') : liveFor(id)?.message || (tool.value?.ready ? 'Rendering' : 'Preparing')
    case 'waiting': return s.upload ? 'Checked every minute' : id === 'tag' ? 'Mark it tagged when done' : liveFor(id)?.state === 'error' ? liveFor(id)!.message : liveFor(id) ? (liveFor(id)!.message || 'Rendering') : 'Render it in the tool'
    default: return ready(s) ? (s.upload ? 'Upload it; checked every minute' : s.human ? 'Needs you' : 'Queued') : ''
  }
}

const copied = ref<string | null>(null)
async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  copied.value = what
  setTimeout(() => (copied.value = null), 1500)
}

// Delete the downloaded source: two clicks, the second within 4 s.
const confirmDelete = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null
async function deleteSource() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    confirmTimer = setTimeout(() => (confirmDelete.value = false), 4000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmDelete.value = false
  await source.forget()
  // Renders need it again: the next Start downloads it.
  set('download', { status: 'todo', since: Date.now() })
}

const folderError = ref<Partial<Record<KitKind, string>>>({})
async function openFolder(kind: KitKind) {
  folderError.value = { ...folderError.value, [kind]: undefined }
  try {
    await $fetch(`/api/pipeline/${matchId}/${kind}/open`, { method: 'POST' })
  }
  catch (cause) {
    folderError.value = { ...folderError.value, [kind]: errorText(cause) }
  }
}

const TONE = {
  turn: 'bg-accent text-white',
  live: 'bg-bg/85 text-ink',
  done: 'bg-brand text-on-brand',
  error: 'bg-accent text-white',
  idle: 'bg-bg/85 text-ink-subtle',
} as const
</script>

<template>
  <div v-if="match">
    <AdminToolHeader :icon="Workflow" :title="match.youtube_title || match.title" :subtitle="`Pipeline · ${doneCount} of ${STEPS.length} steps done${turns ? ` · ${turns} need${turns > 1 ? '' : 's'} you` : ''}`">
      <template #actions>
        <label class="flex items-center gap-2">
          <span class="text-[0.6875rem] text-ink-subtle">Quality</span>
          <select v-model.number="state.height" class="field !min-h-8 !py-1 text-sm" :disabled="active">
            <option v-for="h in HEIGHTS" :key="h" :value="h">{{ h === 2160 ? '4K' : `${h}p` }}</option>
          </select>
        </label>
        <button v-if="!active" type="button" class="btn btn-sm btn-primary" :disabled="allDone || !match.youtube_video_id" @click="start">
          <Play :size="14" aria-hidden="true" /> {{ allDone ? 'All done' : started ? 'Resume' : 'Start' }}
        </button>
        <button v-else type="button" class="btn btn-sm btn-ghost" :disabled="pauseAsked" @click="pause">
          <Pause :size="14" aria-hidden="true" /> {{ pauseAsked ? 'Pausing after the render…' : 'Pause' }}
        </button>
      </template>
    </AdminToolHeader>

    <p v-if="match.video_kind !== 'raw'" class="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
      This is not the raw recording. The pipeline runs on the raw video of the match.
    </p>

    <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <section
        v-for="d in DOCKS"
        :key="d.id"
        class="flex flex-col overflow-hidden rounded-2xl border bg-bg-deep/40 transition-[border-color,box-shadow] duration-300"
        :class="dockState(d).tone === 'turn' || dockState(d).tone === 'error' ? 'border-accent/70' : dockState(d).tone === 'live' ? 'border-line-strong' : 'border-line'"
        :style="dockState(d).tone === 'turn' ? 'box-shadow: var(--ui-glow-soft)' : undefined"
        :aria-label="d.label"
      >
        <!-- Miniature: the video once it is on YouTube, else the thumbnail it will go up with. -->
        <component
          :is="picture(d).to ? NuxtLink : 'div'"
          :to="picture(d).to ?? undefined"
          class="relative block aspect-video overflow-hidden bg-bg-deep"
          :class="dockState(d).tone === 'idle' && !picture(d).src ? 'opacity-50' : ''"
        >
          <img v-if="picture(d).src" :src="picture(d).src!" alt="" class="absolute inset-0 h-full w-full" :class="d.kind === 'shorts' && !linkedOf('shorts') ? 'object-contain' : 'object-cover'" loading="lazy">
          <div v-else class="absolute inset-0 grid place-items-center text-ink-subtle/50">
            <component :is="d.icon" :size="28" aria-hidden="true" />
          </div>
          <span class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-widest backdrop-blur" :class="TONE[dockState(d).tone]">
            <BellRing v-if="dockState(d).tone === 'turn'" :size="11" aria-hidden="true" />
            <LoaderCircle v-else-if="dockState(d).tone === 'live'" :size="11" class="animate-spin" aria-hidden="true" />
            <Check v-else-if="dockState(d).tone === 'done'" :size="11" aria-hidden="true" />
            {{ dockState(d).text }}
          </span>
        </component>

        <div class="flex items-center gap-2 px-3.5 pt-3">
          <component :is="d.icon" :size="15" class="text-accent" aria-hidden="true" />
          <h2 class="font-display text-sm font-bold uppercase tracking-[0.1em]">{{ d.label }}</h2>
        </div>

        <ol class="flex flex-1 flex-col gap-1 p-2">
          <li
            v-for="id in d.steps"
            :key="id"
            class="rounded-xl px-2.5 py-2 transition-[background-color,opacity] duration-200"
            :class="[
              step(id).status === 'waiting' ? 'bg-accent/12' : step(id).status === 'running' ? 'bg-bg-deep' : '',
              step(id).status === 'todo' && !ready(byId[id]) ? 'opacity-40' : '',
            ]"
          >
            <div class="flex items-center gap-2.5">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-lg"
                :class="{
                  'bg-brand text-on-brand': step(id).status === 'done',
                  'bg-accent text-white': step(id).status === 'waiting' || step(id).status === 'error',
                  'bg-accent/20 text-accent': step(id).status === 'running',
                  'bg-bg-deep text-ink-subtle': step(id).status === 'todo',
                }"
              >
                <Check v-if="step(id).status === 'done'" :size="13" aria-hidden="true" />
                <CircleAlert v-else-if="step(id).status === 'error'" :size="13" aria-hidden="true" />
                <component :is="STEP_ICON[id]" v-else :size="13" aria-hidden="true" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium leading-tight">{{ byId[id].label }}</p>
                <p class="truncate text-[0.6875rem] leading-tight" :class="step(id).status === 'error' ? 'text-accent' : 'text-ink-subtle'" :title="detailOf(id)">{{ detailOf(id) }}</p>
              </div>
              <span v-if="step(id).status === 'running' || (liveFor(id) && liveFor(id)!.state !== 'error')" class="font-mono text-xs tabular-nums">{{ Math.round(progressOf(id) * 100) }}%</span>
              <button
                v-else-if="!active && (step(id).status === 'done' || step(id).status === 'error')"
                type="button"
                class="grid size-7 place-items-center rounded-lg text-ink-subtle transition-colors duration-150 hover:bg-bg-deep hover:text-ink"
                :title="`Run ${d.label} · ${byId[id].label} again on the next Start`"
                :aria-label="`Redo ${d.label} ${byId[id].label}`"
                @click="redo(id)"
              >
                <RotateCcw :size="13" aria-hidden="true" />
              </button>
            </div>

            <!-- Machine step: a thin bar. -->
            <div v-if="(!byId[id].human && (step(id).status === 'running' || step(id).status === 'done')) || (liveFor(id) && liveFor(id)!.state !== 'error')" class="mt-2 h-1 overflow-hidden rounded-full bg-bg-deep">
              <div class="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width] duration-500 ease-brand" :style="{ width: `${Math.max(2, progressOf(id) * 100)}%` }" />
            </div>

            <!-- Your turn: where to go. -->
            <a v-if="step(id).status === 'waiting' && OPEN[id] && !liveFor(id)" :href="OPEN[id]!.to" target="_blank" rel="noopener" class="btn btn-sm btn-primary mt-2 w-full">
              Open the {{ OPEN[id]!.label }} <ExternalLink :size="13" aria-hidden="true" />
            </a>

            <!-- Upload: the folder with everything, the text to paste, Studio. -->
            <div v-if="byId[id].upload && kits[byId[id].upload!] && step(id).status !== 'done' && ready(byId[id])" class="mt-2 flex flex-wrap gap-1.5">
              <button type="button" class="btn btn-sm btn-ghost" title="Video, thumbnail, title and description, ready to drop into YouTube" @click="openFolder(byId[id].upload!)">
                <FolderOpen :size="13" aria-hidden="true" /> Folder
              </button>
              <button type="button" class="btn btn-sm btn-ghost" :aria-label="`Copy the ${d.label} title`" title="Copy the title" @click="copy(kits[byId[id].upload!]!.title, `${id}-t`)">
                <Check v-if="copied === `${id}-t`" :size="13" aria-hidden="true" /><Copy v-else :size="13" aria-hidden="true" /> Title
              </button>
              <button type="button" class="btn btn-sm btn-ghost" :aria-label="`Copy the ${d.label} description`" title="Copy the description" @click="copy(kits[byId[id].upload!]!.description, `${id}-d`)">
                <Check v-if="copied === `${id}-d`" :size="13" aria-hidden="true" /><Copy v-else :size="13" aria-hidden="true" /> Text
              </button>
              <a href="https://studio.youtube.com" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" title="YouTube Studio">
                Studio <ExternalLink :size="12" aria-hidden="true" />
              </a>
              <button v-if="step(id).status === 'waiting'" type="button" class="btn btn-sm btn-ghost" title="Look for it on the channel now" aria-label="Check the channel now" @click="wakeAll">
                <RefreshCw :size="13" aria-hidden="true" />
              </button>
              <p v-if="folderError[byId[id].upload!] || kits[byId[id].upload!]!.folderError" class="w-full text-[0.6875rem] text-accent">
                {{ folderError[byId[id].upload!] || kits[byId[id].upload!]!.folderError }}
              </p>
            </div>
          </li>
        </ol>

        <!-- The raw's source on disk: gigabytes, deleted by hand or once all three videos are up. -->
        <div v-if="!d.kind && source.cached.value" class="px-2 pb-2">
          <button
            type="button"
            class="btn btn-sm w-full"
            :class="confirmDelete ? 'btn-primary' : 'btn-ghost'"
            :disabled="active"
            title="Delete the downloaded video from this machine (it stays on YouTube)"
            @click="deleteSource"
          >
            <Trash2 :size="13" aria-hidden="true" /> {{ confirmDelete ? 'Click again to delete' : 'Delete source' }}
          </button>
        </div>
      </section>
    </div>

    <!-- The tool a render runs through, out of sight. -->
    <div v-if="mounted" class="hidden" aria-hidden="true">
      <Suspense>
        <PublishTool v-if="mounted === 'youtube'" ref="tool" />
        <ReelEditor v-else ref="tool" orientation="landscape" />
      </Suspense>
    </div>
  </div>
</template>
