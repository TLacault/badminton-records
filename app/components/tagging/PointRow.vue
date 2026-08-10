<script setup lang="ts">
import type { RallyInput, RallyState } from '~~/shared/badminton'
import { Check, CircleDashed, CornerDownRight, Minus, RotateCcw, Star, Trash2, User, X } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    rally: RallyInput
    state: RallyState | null
    names: Record<number, string>
    slotToPlayerId: Record<number, string>
    /** Briefly highlights a row that was just logged. */
    flash?: boolean
    /** The point on screen right now, and what the editing keys will change. */
    current?: boolean
  }>(),
  { flash: false, current: false },
)

const emit = defineEmits<{
  seek: [seconds: number]
  flip: [idx: number]
  'toggle-let': [idx: number]
  'toggle-highlight': [idx: number]
  'set-scorer': [idx: number, playerId: string | null]
  'set-timestamp': [idx: number, seconds: number]
  delete: [idx: number]
}>()

/** The four slots, plus an explicit way back to "nobody was credited". */
const scorerOptions = computed(() => [
  { value: null as string | null, label: 'No scorer', icon: CircleDashed },
  ...Object.entries(props.slotToPlayerId).map(([slot, playerId]) => ({
    value: playerId as string | null,
    label: props.names[Number(slot)] ?? `Slot ${slot}`,
    icon: User,
  })),
])

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Commit a hand-typed timecode. Unreadable input is reverted rather than
 * written: a NaN here would corrupt the ordering the score depends on.
 */
function commitTime(event: Event, rally: RallyInput) {
  const input = event.target as HTMLInputElement
  const seconds = parseClock(input.value)
  if (seconds === null) {
    input.value = formatTime(rally.endedAtSeconds)
    return
  }
  if (seconds !== rally.endedAtSeconds) emit('set-timestamp', rally.idx, seconds)
  input.value = formatTime(seconds)
}
</script>

<template>
  <!--
    The watched row is marked with a bar down its edge as well as a wash of
    colour: hover already tints a row, and the two had to stay tellable apart
    while the mouse is somewhere in the list.
  -->
  <li
    class="flex items-center gap-2 rounded-lg border-b border-line px-1 py-1.5 text-xs transition-colors duration-150 hover:bg-accent-soft"
    :class="[
      flash ? 'point-flash' : '',
      current ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--ui-accent)]' : '',
    ]"
    :data-rally-idx="rally.idx"
    :data-current="current ? 'true' : undefined"
  >
    <button
      class="shrink-0 text-ink-subtle transition-colors duration-150 hover:text-accent"
      :title="`Jump to ${formatTime(state?.startsAtSeconds ?? 0)}`"
      @click="emit('seek', state?.startsAtSeconds ?? 0)"
    >
      <CornerDownRight :size="12" />
    </button>

    <!--
      The END of the rally, which is what is stored and what the admin
      corrects. The seek button above jumps to where the point starts.
    -->
    <input
      data-testid="row-time"
      :value="formatTime(rally.endedAtSeconds)"
      class="w-12 shrink-0 rounded bg-transparent px-1 text-left font-mono text-ink-subtle hover:bg-panel-strong focus:bg-panel-strong focus:text-ink focus:outline-none"
      title="Point ends at — edit to retime (mm:ss)"
      @focus="($event.target as HTMLInputElement).select()"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
      @blur="commitTime($event, rally)"
    >

    <span class="w-5 shrink-0 text-ink-subtle">S{{ state?.setNumber ?? '?' }}</span>

    <button
      data-testid="row-score"
      class="w-12 shrink-0 rounded border border-line px-1 font-mono tabular-nums transition-colors duration-150 hover:border-accent/50"
      :class="rally.isLet ? 'bg-panel text-ink-subtle' : 'bg-panel-strong text-ink'"
      title="Click to flip the winner"
      @click="emit('flip', rally.idx)"
    >
      {{ rally.isLet ? 'let' : `${state?.scoreAfter[0]}-${state?.scoreAfter[1]}` }}
    </button>

    <!-- Framed as win/loss for us, not as a neutral side indicator. -->
    <span
      data-testid="row-winner"
      class="flex w-4 shrink-0 justify-center"
      :title="rally.isLet ? 'Let' : rally.winnerSide === 1 ? 'Point won' : 'Point lost'"
    >
      <Minus v-if="rally.isLet" :size="14" class="text-ink-subtle" />
      <Check v-else-if="rally.winnerSide === 1" :size="14" class="text-accent" />
      <X v-else :size="14" class="text-them" />
    </span>

    <span data-testid="row-server" class="min-w-0 flex-1 truncate text-ink-subtle">
      {{ state ? names[state.servingSlot] ?? `Slot ${state.servingSlot}` : '' }}
      <span class="opacity-60">{{ state?.serviceCourt === 'right' ? '▸R' : '▸L' }}</span>
    </span>

    <UiSelect
      class="w-44 shrink-0"
      size="sm"
      label="Who scored this point"
      placeholder="No scorer"
      :model-value="rally.scoredByPlayerId ?? null"
      :options="scorerOptions"
      @update:model-value="value => emit('set-scorer', rally.idx, value)"
    />

    <button
      data-testid="row-star"
      class="shrink-0"
      :class="rally.isHighlight ? 'text-accent drop-shadow-[0_0_6px_var(--ui-accent)]' : 'text-ink-subtle hover:text-ink'"
      title="Toggle highlight"
      @click="emit('toggle-highlight', rally.idx)"
    >
      <Star :size="14" :fill="rally.isHighlight ? 'currentColor' : 'none'" />
    </button>
    <button
      class="shrink-0 text-ink-subtle hover:text-ink"
      title="Toggle let"
      @click="emit('toggle-let', rally.idx)"
    >
      <RotateCcw :size="14" />
    </button>
    <button
      data-testid="row-delete"
      class="shrink-0 text-ink-subtle hover:text-accent"
      title="Delete rally"
      @click="emit('delete', rally.idx)"
    >
      <Trash2 :size="14" />
    </button>
  </li>
</template>
