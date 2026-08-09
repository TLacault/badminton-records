<script setup lang="ts">
import type { BreakInput, DerivedMatch } from '~~/shared/badminton'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Star } from '@lucide/vue'
import { resumeTimeAt } from '~~/shared/badminton'

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null
    currentTime: number
    breaks?: BreakInput[]
  }>(),
  { breaks: () => [] },
)

const emit = defineEmits<{ seek: [seconds: number] }>()

type Mode = 'points' | 'sets' | 'highlights'
const mode = ref<Mode>('points')

const modes: Array<{ id: Mode, label: string }> = [
  { id: 'points', label: 'Points' },
  { id: 'sets', label: 'Sets' },
  { id: 'highlights', label: 'Highlights' },
]

type Tone = 'win' | 'loss' | 'let' | 'neutral'
interface Marker { key: string, label: string, sub: string, time: number, tone: Tone }

/** Same colour language as the timeline: green we won it, red they did. */
const TONE_CLASS: Record<Tone, string> = {
  win: 'border-emerald-800 bg-emerald-950/60 text-emerald-200 hover:border-emerald-600',
  loss: 'border-rose-900 bg-rose-950/50 text-rose-200 hover:border-rose-700',
  let: 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600',
  neutral: 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-100',
}

const open = ref(true)

function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** What the prev/next buttons and the list step through, per mode. */
const markers = computed<Marker[]>(() => {
  const states = props.derived?.rallyStates ?? []
  if (mode.value === 'sets') {
    return (props.derived?.games ?? [])
      .filter(g => g.firstRallyIdx !== null)
      .map((g) => {
        const first = states.find(s => s.idx === g.firstRallyIdx)
        return {
          key: `g${g.number}`,
          label: `Game ${g.number}`,
          sub: `${g.score[0]}–${g.score[1]}`,
          time: first?.startsAtSeconds ?? 0,
          tone: (g.winnerSide === 1 ? 'win' : g.winnerSide === 2 ? 'loss' : 'neutral') as Tone,
        }
      })
  }
  const source = mode.value === 'highlights' ? states.filter(s => s.isHighlight) : states
  return source.map(s => ({
    key: `r${s.idx}`,
    label: `${s.scoreAfter[0]}–${s.scoreAfter[1]}`,
    sub: formatClock(s.startsAtSeconds),
    time: s.startsAtSeconds,
    tone: (s.isLet
      ? 'let'
      : s.scoreAfter[0] > s.scoreBefore[0] ? 'win' : 'loss') as Tone,
  }))
})

/** Index of the marker currently playing — the last one already started. */
const activeMarker = computed(() => {
  let found = -1
  markers.value.forEach((m, i) => {
    if (m.time <= props.currentTime + 0.25) found = i
  })
  return found
})

function jumpTo(index: number) {
  const marker = markers.value[index]
  // Past any break covering the target: a game's first rally "starts" the
  // instant the previous game ended, which is the start of the interval.
  if (marker) emit('seek', resumeTimeAt(props.breaks, marker.time))
}
function previous() {
  jumpTo(Math.max(0, activeMarker.value - 1))
}
function next() {
  jumpTo(Math.min(markers.value.length - 1, activeMarker.value + 1))
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-3">
      <div data-testid="mode-switch" class="inline-flex rounded border border-slate-800 p-0.5">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="rounded px-3 py-1 text-sm"
          :class="mode === m.id ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button
          data-testid="marker-prev"
          type="button"
          class="rounded bg-slate-800 p-1.5 hover:bg-slate-700 disabled:opacity-40"
          :disabled="activeMarker <= 0"
          title="Previous"
          @click="previous"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          data-testid="marker-next"
          type="button"
          class="rounded bg-slate-800 p-1.5 hover:bg-slate-700 disabled:opacity-40"
          :disabled="activeMarker >= markers.length - 1"
          title="Next"
          @click="next"
        >
          <ChevronRight :size="16" />
        </button>
      </div>

      <span class="text-sm text-slate-500">{{ markers.length }} {{ mode }}</span>

      <button
        data-testid="marker-collapse"
        type="button"
        class="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
        :aria-expanded="open"
        @click="open = !open"
      >
        <component :is="open ? ChevronUp : ChevronDown" :size="14" />
        {{ open ? 'Hide' : 'Show' }}
      </button>
    </div>

    <template v-if="open">
      <ul
        v-if="markers.length"
        data-testid="marker-list"
        class="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto"
      >
        <li v-for="(m, i) in markers" :key="m.key">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs tabular-nums"
            :class="i === activeMarker
              ? 'border-emerald-400 bg-emerald-900 font-semibold text-emerald-100'
              : TONE_CLASS[m.tone]"
            @click="jumpTo(i)"
          >
            <Star v-if="mode === 'highlights'" :size="11" class="fill-amber-400 text-amber-400" />
            <span class="font-medium">{{ m.label }}</span>
            <span class="opacity-70">{{ m.sub }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-slate-500">
        No {{ mode }} tagged for this match yet.
      </p>
    </template>
  </div>
</template>
