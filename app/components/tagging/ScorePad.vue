<script setup lang="ts">
import type { KeybindActionId } from '~/composables/useKeybinds'
import type { DerivedMatch, MatchFormat, Side } from '~~/shared/badminton'
import { Coffee, Redo2, Repeat, Star, Undo2 } from '@lucide/vue'
import { shortName } from '~/utils/players'

/**
 * Tagging with a thumb.
 *
 * The keyboard is the fast way to tag and it is not going anywhere — but it
 * needs a keyboard, and half the matches get watched back on a phone on the
 * way home. Every key the tagger answers to has a button here, driving the
 * same actions through the same page: nothing in this component knows what a
 * rally is, it only says which instruction was given.
 *
 * Sized for the hand rather than the eye: the two point buttons are the whole
 * width of the screen between them, because they are pressed once per rally
 * for two hours and everything else is pressed occasionally.
 */
const props = defineProps<{
  derived: DerivedMatch
  /** Full names by slot, shortened here — the button has no room for a surname. */
  names: Record<number, string>
  sideLabels: Record<number, string>
  slotToPlayerId: Record<number, string>
  format: MatchFormat
  /** The point being watched: what a scorer or a highlight lands on. */
  currentIdx: number | null
  canUndo: boolean
  canRedo: boolean
  /** A break tagged with no end yet, waiting for the press that closes it. */
  openBreak: boolean
}>()

const emit = defineEmits<{
  action: [action: KeybindActionId]
  seek: [seconds: number]
}>()

/** How many points back the pad shows. Two is the ask; three costs one row. */
const HISTORY = 3

const watched = computed(() =>
  props.currentIdx === null
    ? null
    : props.derived.rallyStates.find(r => r.idx === props.currentIdx) ?? null,
)

/** Doubles fields 1+2 against 3+4; singles just 1 against 3. */
const sides = computed(() => {
  const groups: Record<Side, number[]> = props.format === 'doubles'
    ? { 1: [1, 2], 2: [3, 4] }
    : { 1: [1], 2: [3] }
  return ([1, 2] as Side[]).map(side => ({
    side,
    label: props.sideLabels[side] ?? (side === 1 ? 'Us' : 'Opponents'),
    action: (side === 1 ? 'pointUs' : 'pointThem') as KeybindActionId,
    slots: groups[side].map(slot => ({
      slot,
      label: shortName(props.names[slot] ?? `Slot ${slot}`),
      action: `scorer${slot}` as KeybindActionId,
      /** Lit when this player is already down as the scorer of the point watched. */
      active: !!watched.value
        && watched.value.scoredByPlayerId !== null
        && watched.value.scoredByPlayerId === props.slotToPlayerId[slot],
    })),
  }))
})

/**
 * The last few points, newest first.
 *
 * Tagging blind is what makes a phone session go wrong: a mistimed press is
 * invisible until the score is three points out. These rows are the answer to
 * "what did I just record", and each one seeks back to the point it names.
 */
const scorerNames = computed(() => {
  const out: Record<string, string> = {}
  for (const [slot, id] of Object.entries(props.slotToPlayerId)) {
    out[id] = shortName(props.names[Number(slot)] ?? `Slot ${slot}`)
  }
  return out
})

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const history = computed(() =>
  [...props.derived.rallyStates].slice(-HISTORY).reverse().map(r => ({
    idx: r.idx,
    // Always side 1 then side 2, the way the scoreboard on the video reads it.
    score: `${r.scoreAfter[0]}–${r.scoreAfter[1]}`,
    // A rally state carries the score, not the winner: the side that took the
    // point is the side whose number went up.
    winner: r.isLet ? null : r.scoreAfter[0] > r.scoreBefore[0] ? (1 as Side) : (2 as Side),
    isLet: r.isLet,
    isHighlight: r.isHighlight,
    scorer: r.scoredByPlayerId ? scorerNames.value[r.scoredByPlayerId] ?? null : null,
    time: clock(r.endsAtSeconds),
    seconds: r.endsAtSeconds,
  })),
)

const utilities = computed(() => [
  { action: 'let' as const, label: 'Let', icon: Repeat, on: false, disabled: false },
  {
    action: 'break' as const,
    label: props.openBreak ? 'Close' : 'Break',
    icon: Coffee,
    on: props.openBreak,
    disabled: false,
  },
  {
    action: 'highlight' as const,
    label: 'Star',
    icon: Star,
    on: !!watched.value?.isHighlight,
    disabled: !watched.value,
  },
  { action: 'undo' as const, label: 'Undo', icon: Undo2, on: false, disabled: !props.canUndo },
  { action: 'redo' as const, label: 'Redo', icon: Redo2, on: false, disabled: !props.canRedo },
])
</script>

<template>
  <section
    data-testid="score-pad"
    class="rounded-2xl p-2.5 glass"
    aria-label="Tagging pad"
  >
    <!--
      The two presses the whole session is made of. Nothing else on the pad is
      allowed to be as large, and they never move: a button that shifts under
      the thumb between rallies is a button that gets pressed wrong.
    -->
    <div class="grid grid-cols-2 gap-2">
      <div v-for="s in sides" :key="s.side">
        <button
          type="button"
          :data-testid="`pad-${s.action}`"
          class="flex min-h-20 w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-2 font-display uppercase transition-[transform,background-color,border-color] duration-150 active:scale-[0.98]"
          :class="s.side === 1
            ? 'border-accent/50 bg-accent-soft text-accent'
            : 'border-line-strong bg-panel-strong text-ink'"
          @click="emit('action', s.action)"
        >
          <span class="text-[0.625rem] font-semibold tracking-[0.18em] opacity-70">Point</span>
          <span class="line-clamp-2 text-center text-sm font-bold leading-tight tracking-[0.04em]">
            {{ s.label }}
          </span>
        </button>

        <!--
          Who scored it, under the side that scored. Applied to the point being
          watched — the same rule the number keys follow — so pressing a name
          straight after a point is what it looks like: attributing that point.
        -->
        <div class="mt-1.5 grid gap-1.5" :class="s.slots.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
          <button
            v-for="p in s.slots"
            :key="p.slot"
            type="button"
            :data-testid="`pad-${p.action}`"
            class="min-h-11 truncate rounded-lg border px-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-40"
            :class="p.active
              ? 'border-accent/60 bg-accent-soft text-accent'
              : 'border-line text-ink-muted'"
            :disabled="!watched"
            @click="emit('action', p.action)"
          >
            {{ p.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-2 grid grid-cols-5 gap-1.5">
      <button
        v-for="u in utilities"
        :key="u.action"
        type="button"
        :data-testid="`pad-${u.action}`"
        class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border transition-colors duration-150 disabled:opacity-35"
        :class="u.on ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line text-ink-muted'"
        :disabled="u.disabled"
        @click="emit('action', u.action)"
      >
        <component :is="u.icon" :size="16" :fill="u.on && u.action === 'highlight' ? 'currentColor' : 'none'" aria-hidden="true" />
        <span class="font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em]">{{ u.label }}</span>
      </button>
    </div>

    <!--
      What was just recorded, newest at the top. Tapping a row goes back to the
      point it names, which is the whole repair loop on a phone: see it, jump
      to it, fix it with the same buttons.
    -->
    <ol v-if="history.length" data-testid="pad-history" class="mt-2.5 flex flex-col gap-1">
      <li v-for="r in history" :key="r.idx">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-150"
          :class="r.idx === currentIdx ? 'border-accent/45 bg-accent-soft' : 'border-line'"
          @click="emit('seek', r.seconds)"
        >
          <!-- Whose point it was, in one glyph: ours is crimson, theirs is a
               plain outline, a let is neither. -->
          <span
            class="grid size-4 shrink-0 place-items-center rounded-full border font-display text-[0.5rem] font-bold"
            :class="r.winner === null
              ? 'border-line text-ink-subtle'
              : r.winner === 1
                ? 'border-accent/60 bg-accent-soft text-accent'
                : 'border-line-strong text-ink-muted'"
          >{{ r.winner === null ? '=' : r.winner === 1 ? 'U' : 'T' }}</span>
          <span class="font-mono text-sm font-semibold tabular-nums text-ink">{{ r.score }}</span>
          <span v-if="r.scorer" class="truncate text-xs text-ink-muted">{{ r.scorer }}</span>
          <Star
            v-if="r.isHighlight"
            :size="12"
            class="shrink-0 text-accent"
            fill="currentColor"
            aria-hidden="true"
          />
          <span class="ml-auto shrink-0 font-mono text-[0.6875rem] tabular-nums text-ink-subtle">
            {{ r.time }}
          </span>
        </button>
      </li>
    </ol>

    <p v-else class="mt-2.5 px-1 text-xs text-ink-subtle">
      Nothing tagged yet — the first point starts the log.
    </p>
  </section>
</template>
