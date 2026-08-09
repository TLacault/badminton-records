<script setup lang="ts">
import type { BreakInput, DerivedMatch } from '~~/shared/badminton'
import { rallyAtTime } from '~~/shared/badminton'

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null
    /** Video length. Falls back to the last rally end before the player reports. */
    duration: number
    currentTime: number
    breaks?: BreakInput[]
  }>(),
  { breaks: () => [] },
)

const emit = defineEmits<{ seek: [seconds: number] }>()

const states = computed(() => props.derived?.rallyStates ?? [])

const total = computed(() => {
  if (props.duration > 0) return props.duration
  return states.value.at(-1)?.endsAtSeconds || 1
})

function pct(seconds: number) {
  return `${Math.min(100, Math.max(0, (seconds / total.value) * 100))}%`
}

const segments = computed(() =>
  states.value.map(s => ({
    idx: s.idx,
    left: pct(s.startsAtSeconds),
    width: pct(s.endsAtSeconds - s.startsAtSeconds),
    start: s.startsAtSeconds,
    // Lets are colourless: no point was scored, so neither side "owns" them.
    class: s.isLet
      ? 'bg-slate-600'
      : s.scoreAfter[0] > s.scoreBefore[0]
        ? 'bg-emerald-500'
        : 'bg-rose-500',
    title: `Point ${s.idx + 1} · ${s.scoreAfter[0]}–${s.scoreAfter[1]}`,
  })),
)

/** Adjacent highlighted rallies merge into one band, so a great exchange
 *  tagged across three points reads as a single passage rather than stripes. */
const highlightBands = computed(() => {
  const bands: Array<{ left: string, width: string, start: number }> = []
  let run: { from: number, to: number } | null = null
  for (const s of states.value) {
    if (s.isHighlight) {
      if (run && run.to === s.startsAtSeconds) run.to = s.endsAtSeconds
      else {
        if (run) bands.push({ left: pct(run.from), width: pct(run.to - run.from), start: run.from })
        run = { from: s.startsAtSeconds, to: s.endsAtSeconds }
      }
    }
  }
  if (run) bands.push({ left: pct(run.from), width: pct(run.to - run.from), start: run.from })
  return bands
})

/**
 * Dead time, drawn over the rally lane. Rallies are contiguous, so the rally
 * following a break still spans it; painting the break on top is what makes
 * the gap visible. An unclosed break runs to the end of the video.
 */
const breakBands = computed(() =>
  props.breaks.map(b => ({
    idx: b.idx,
    left: pct(b.startsAtSeconds),
    width: pct((b.endsAtSeconds ?? total.value) - b.startsAtSeconds),
    open: b.endsAtSeconds === null,
  })),
)

/** Start of every game after the first. */
const gameMarks = computed(() =>
  (props.derived?.games ?? [])
    .filter(g => g.number > 1 && g.firstRallyIdx !== null)
    .map((g) => {
      const first = states.value.find(s => s.idx === g.firstRallyIdx)
      return { number: g.number, left: pct(first?.startsAtSeconds ?? 0) }
    }),
)

const track = ref<HTMLElement | null>(null)

/**
 * Clicking inside a point jumps to where that point STARTS, not to the exact
 * spot clicked — landing mid-rally is never what you want. Clicks outside any
 * tagged rally fall back to the raw position.
 */
function seekFromPointer(event: MouseEvent) {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || !rect.width) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const time = ratio * total.value
  const hit = rallyAtTime(props.derived, time)
  emit('seek', hit ? hit.startsAtSeconds : time)
}
</script>

<template>
  <div
    ref="track"
    data-testid="match-timeline"
    class="relative h-9 w-full cursor-pointer overflow-hidden rounded bg-slate-900"
    @click="seekFromPointer"
  >
    <!--
      border-r in the track colour separates consecutive points: a run of five
      won in a row would otherwise read as one long block. box-sizing keeps the
      border inside the segment, so positions stay exact.
    -->
    <div
      v-for="s in segments"
      :key="s.idx"
      class="absolute bottom-0 top-2 border-r border-slate-900 opacity-80 hover:opacity-100"
      :class="s.class"
      :style="{ left: s.left, width: s.width }"
      :title="s.title"
    />

    <div
      v-for="b in breakBands"
      :key="`b${b.idx}`"
      data-testid="timeline-break"
      class="absolute bottom-0 top-2 border-x border-slate-500 bg-slate-800"
      :class="b.open ? 'opacity-60' : ''"
      :style="{ left: b.left, width: b.width }"
      :title="b.open ? 'Break (still open)' : 'Break'"
    />

    <!-- Highlights ride in their own lane above the points so they stay
         legible when a match is dense enough that segments are hairline. -->
    <div
      v-for="(b, i) in highlightBands"
      :key="`h${i}`"
      data-testid="timeline-highlight"
      class="absolute left-0 top-0 h-1.5 rounded-sm bg-amber-400"
      :style="{ left: b.left, width: b.width }"
      title="Highlight"
    />

    <div
      v-for="g in gameMarks"
      :key="`g${g.number}`"
      data-testid="timeline-game-mark"
      class="absolute inset-y-0 w-0.5 bg-slate-100"
      :style="{ left: g.left }"
      :title="`Game ${g.number}`"
    />

    <div
      data-testid="timeline-playhead"
      class="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
      :style="{ left: pct(currentTime) }"
    />
  </div>
</template>
