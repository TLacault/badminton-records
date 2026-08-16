<script setup lang="ts">
import type { BreakInput } from '~~/shared/badminton'
import { CornerDownRight, Pause, Trash2 } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    brk: BreakInput
    /** Briefly highlights a break that was just tagged. */
    flash?: boolean
  }>(),
  { flash: false },
)

const emit = defineEmits<{
  seek: [seconds: number]
  'set-time': [idx: number, edge: 'start' | 'end', seconds: number]
  delete: [idx: number]
}>()

/** Dead time, in whole seconds. An open break has no length to show yet. */
const length = computed(() => {
  const end = props.brk.endsAtSeconds
  if (end === null) return null
  return Math.round(end - props.brk.startsAtSeconds)
})

function edgeSeconds(b: BreakInput, edge: 'start' | 'end') {
  return edge === 'start' ? b.startsAtSeconds : b.endsAtSeconds ?? 0
}

/**
 * Commit a hand-typed edge. Unreadable input is reverted rather than written,
 * as in `PointRow`. The session decides what the value becomes — it clamps the
 * OTHER edge back if this one now crosses a point — so the field is re-read
 * from the prop on the next render rather than trusted here.
 */
function commitTime(event: Event, edge: 'start' | 'end') {
  const input = event.target as HTMLInputElement
  const seconds = parseClock(input.value)
  const current = edgeSeconds(props.brk, edge)
  if (seconds === null) {
    input.value = formatClock(current)
    return
  }
  if (seconds !== current) emit('set-time', props.brk.idx, edge, seconds)
  input.value = formatClock(seconds)
}
</script>

<template>
  <!--
    Deliberately quieter than a point row: dashed and washed out, the same
    language the timeline uses for dead time, so a scan down the list reads the
    breaks as the gaps between the play rather than as more of it.
  -->
  <li
    data-testid="break-row"
    class="my-1 flex items-center gap-2 rounded-lg border border-dashed border-line bg-bg-deep/40 px-1 py-1.5 text-xs text-ink-subtle transition-colors duration-150 hover:border-line-strong"
    :class="flash ? 'point-flash' : ''"
    :data-break-idx="brk.idx"
  >
    <button
      class="shrink-0 transition-colors duration-150 hover:text-accent"
      :title="`Jump to ${formatClock(brk.startsAtSeconds)}`"
      @click="emit('seek', brk.startsAtSeconds)"
    >
      <CornerDownRight :size="12" />
    </button>

    <Pause :size="12" class="shrink-0 opacity-70" aria-hidden="true" />

    <input
      data-testid="break-start"
      :value="formatClock(brk.startsAtSeconds)"
      class="w-12 shrink-0 rounded bg-transparent px-1 text-left font-mono hover:bg-panel-strong focus:bg-panel-strong focus:text-ink focus:outline-none"
      title="Break starts at — edit to retime (mm:ss)"
      @focus="($event.target as HTMLInputElement).select()"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
      @blur="commitTime($event, 'start')"
    >

    <span class="shrink-0 opacity-60">→</span>

    <input
      v-if="brk.endsAtSeconds !== null"
      data-testid="break-end"
      :value="formatClock(brk.endsAtSeconds)"
      class="w-12 shrink-0 rounded bg-transparent px-1 text-left font-mono hover:bg-panel-strong focus:bg-panel-strong focus:text-ink focus:outline-none"
      title="Break ends at — edit to retime (mm:ss)"
      @focus="($event.target as HTMLInputElement).select()"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
      @blur="commitTime($event, 'end')"
    >
    <span v-else data-testid="break-end" class="w-12 shrink-0 font-mono text-accent">open</span>

    <span class="min-w-0 flex-1 truncate uppercase tracking-[0.12em] opacity-70">
      Break
    </span>

    <span v-if="length !== null" class="shrink-0 tabular-nums opacity-70">{{ length }}s</span>

    <button
      data-testid="break-delete"
      class="shrink-0 transition-colors duration-150 hover:text-accent"
      title="Delete break"
      @click="emit('delete', brk.idx)"
    >
      <Trash2 :size="14" />
    </button>
  </li>
</template>
