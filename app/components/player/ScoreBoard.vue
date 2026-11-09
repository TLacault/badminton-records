<script setup lang="ts">
import type { DerivedMatch, MatchFormat, PlaybackState } from '~~/shared/badminton'
import { Circle } from '@lucide/vue'

const props = defineProps<{
  playback: PlaybackState
  derived: DerivedMatch | null
  names: Record<number, string>
  /** Side labels for compact mode — "Tim & Adrien", not "Us". */
  sideLabels: Record<number, string>
  /** Club per slot, printed as an acronym tag before the name. */
  clubs?: Record<number, string | null>
  format: MatchFormat
}>()

const { mode, toggle } = useScoreboardMode()

/**
 * One column per set reached, never per set *played*: the board follows
 * playback, so a set that has not started yet must not appear — its final
 * score is a spoiler for the rally on screen.
 */
const columns = computed(() => {
  const current = props.playback.setNumber
  const out: { number: number, score: [number, number], live: boolean }[] = []

  for (const set of props.derived?.sets ?? []) {
    if (set.number > current) continue
    out.push({
      number: set.number,
      // The current set's score comes from playback, not from the log: the
      // log already knows how the set ends.
      score: set.number === current ? props.playback.score : set.score,
      live: set.number === current,
    })
  }

  // Before the first point is logged there is no set row at all.
  if (!out.some(c => c.number === current)) {
    out.push({ number: current, score: props.playback.score, live: true })
  }
  return out
})

/**
 * The moments the board marks: a set just closed, and the match just won.
 *
 * Both read off the rally on screen having *ended* — the board shows its
 * `scoreAfter` only once play has passed it — so seeking backwards un-marks
 * them, and nothing is announced before the video gets there.
 */
const rallyEnded = computed(() => {
  const r = props.playback.rally
  return !!r && props.playback.score[0] === r.scoreAfter[0] && props.playback.score[1] === r.scoreAfter[1]
})
const setJustEnded = computed(() => rallyEnded.value && !!props.playback.rally?.endedSet)
const winnerSide = computed(() =>
  rallyEnded.value && props.playback.rally?.endedMatch ? props.derived?.matchWinnerSide ?? null : null,
)

/** Doubles fields 1+2 against 3+4; singles just 1 against 3. */
const sides = computed(() => {
  const slots = props.format === 'doubles' ? [[1, 2], [3, 4]] : [[1], [3]]
  return slots.map((group, i) => ({
    side: (i + 1) as 1 | 2,
    label: props.sideLabels[i + 1] ?? (i === 0 ? 'Us' : 'Opponents'),
    serving: props.playback.servingSide === i + 1,
    won: winnerSide.value === i + 1,
    players: group.map(slot => ({
      slot,
      name: props.names[slot] ?? `Slot ${slot}`,
      club: clubTag(props.clubs?.[slot]),
      serving: props.playback.servingSlot === slot,
    })),
  }))
})

/**
 * Label column, then one cell per set so the columns stay aligned.
 *
 * The cell width is a clamp rather than a constant: at 2.5rem apiece a
 * three-set board took a third of a phone's width before a single name was
 * printed, and the names are what the board is for. It gives ground down to
 * 1.5rem — still two digits at the size they are drawn — and never grows past
 * the width the desktop board always had.
 */
const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(0,1fr) repeat(${columns.value.length}, clamp(1rem, 4vw, 2.5rem))`,
}))
</script>

<template>
  <!--
    Always on the video, never a panel of its own: a scoreboard beside the
    rally it describes is a second thing to look at, and the point of the
    overlay is that you never look away from the court.
  -->
  <!--
    The whole board is the control, not just the chevron: it is a big target
    over a small icon, and the icon was easy to miss and land on the video
    behind instead. `pointer-events-auto` is also what keeps a click here from
    reaching the embed underneath.
  -->
  <div
    data-testid="scoreboard"
    role="button"
    tabindex="0"
    :aria-label="mode === 'compact' ? $t('player.showNames') : $t('player.showSides')"
    class="pointer-events-auto absolute left-1.5 top-1.5 max-w-[58%] cursor-pointer sm:left-3 sm:top-3 sm:max-w-none overflow-hidden rounded-lg sm:rounded-xl border bg-black/28 text-white backdrop-blur-md backdrop-saturate-150 transition-[border-color,box-shadow] duration-500 legible"
    :class="winnerSide ? 'border-[var(--ui-accent)]/55 shadow-[0_0_28px_-8px_var(--ui-accent)]' : 'border-white/12 hover:border-white/30'"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <!-- A light sweep across the glass: once when a set closes, once more
         when the match does. Mounted for the moment, so it plays on arrival. -->
    <span v-if="setJustEnded" :key="winnerSide ? 'match' : 'set'" class="board-sweep" aria-hidden="true" />

    <div class="relative px-1 py-0.5 sm:px-3 sm:py-2">
      <!-- Set numbers. Only earns its line once a second set exists. -->
      <div
        v-if="columns.length > 1"
        class="grid items-center gap-x-1"
        :style="gridStyle"
      >
        <span />
        <span
          v-for="column in columns"
          :key="column.number"
          class="set-in text-center font-display text-[0.4375rem] font-semibold uppercase tracking-[0.12em] sm:text-[0.625rem]"
          :class="column.live ? 'text-[var(--ui-accent)]' : 'text-white/45'"
        >S{{ column.number }}</span>
      </div>

      <div
        v-for="s in sides"
        :key="s.side"
        class="grid items-center gap-x-0.5 border-b border-white/10 py-px last:border-b-0 sm:gap-x-1 sm:py-1"
        :style="gridStyle"
      >
        <!-- Compact: one line per side. Expanded: the names that make it up. -->
        <div class="min-w-0 pr-0.5 sm:pr-2">
          <template v-if="mode === 'compact'">
            <p
              class="flex items-center gap-1 truncate font-display text-[0.625rem] font-semibold uppercase tracking-[0.04em] transition-colors duration-500 sm:gap-1.5 sm:text-sm sm:tracking-[0.06em]"
              :class="s.won ? 'text-[var(--ui-accent)]' : ''"
            >
              <Circle
                :size="6"
                class="shrink-0 transition-[color,filter] duration-200"
                :class="s.serving
                  ? 'fill-[var(--ui-accent)] text-[var(--ui-accent)] drop-shadow-[0_0_6px_var(--ui-accent)]'
                  : 'text-transparent'"
                aria-hidden="true"
              />
              {{ s.label }}
            </p>
          </template>
          <template v-else>
            <p
              v-for="p in s.players"
              :key="p.slot"
              class="flex items-center gap-1 text-[0.5625rem] leading-tight sm:gap-1.5 sm:text-[0.8125rem]"
            >
              <!-- Shuttle marks the server; the space is reserved either way so
                   the rows never shift as service changes. -->
              <Circle
                :size="6"
                class="shrink-0 transition-[color,filter] duration-200"
                :class="p.serving
                  ? 'fill-[var(--ui-accent)] text-[var(--ui-accent)] drop-shadow-[0_0_6px_var(--ui-accent)]'
                  : 'text-transparent'"
                aria-hidden="true"
              />
              <span
                v-if="p.club"
                class="hidden shrink-0 rounded border border-white/25 px-1 font-mono text-[0.5625rem] font-semibold tracking-wide text-white/70 sm:inline"
              >{{ p.club }}</span>
              <span class="truncate transition-colors duration-500" :class="s.won ? 'font-semibold text-[var(--ui-accent)]' : p.serving ? 'font-semibold' : 'text-white/80'">
                {{ p.name }}
              </span>
            </p>
          </template>
        </div>

        <!-- Keyed by value, so a point remounts the digit and it ticks up into
             place; only the side that scored moves. -->
        <span
          v-for="column in columns"
          :key="column.number"
          :data-testid="column.live ? 'scoreboard-live' : undefined"
          class="set-in overflow-hidden text-center font-display text-xs font-bold tabular-nums leading-none transition-colors duration-500 sm:text-xl"
          :class="column.live ? 'text-accent' : 'text-white/60'"
        ><span :key="column.score[s.side - 1]" class="score-tick inline-block">{{ column.score[s.side - 1] }}</span></span>
      </div>
    </div>

  </div>
</template>

<style scoped>
/*
 * Three moments, each small: a point ticks the digit up, a new set's column
 * fades in, and a set or match closing sends one sweep of light over the
 * glass. Nothing loops; a board that moves on its own pulls the eye off the
 * court. Off entirely for reduced motion, where the colour changes still say it.
 */
.board-sweep {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 30%, rgb(255 255 255 / 0.14) 50%, transparent 70%);
  transform: translateX(-100%);
  opacity: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .score-tick {
    animation: score-tick 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .set-in {
    animation: set-in 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .board-sweep {
    animation: board-sweep 1100ms cubic-bezier(0.4, 0, 0.2, 1) 120ms;
  }
}

@keyframes score-tick {
  from {
    transform: translateY(55%);
    opacity: 0;
    filter: blur(2px);
  }
}

@keyframes set-in {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
}

@keyframes board-sweep {
  0% {
    transform: translateX(-100%);
    opacity: 1;
  }
  100% {
    transform: translateX(100%);
    opacity: 1;
  }
}
</style>
