<script setup lang="ts">
import type { DerivedMatch, MatchFormat, PlaybackState } from '~~/shared/badminton'
import { ChevronsDownUp, ChevronsUpDown, Circle } from '@lucide/vue'

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

/** Doubles fields 1+2 against 3+4; singles just 1 against 3. */
const sides = computed(() => {
  const slots = props.format === 'doubles' ? [[1, 2], [3, 4]] : [[1], [3]]
  return slots.map((group, i) => ({
    side: (i + 1) as 1 | 2,
    label: props.sideLabels[i + 1] ?? (i === 0 ? 'Us' : 'Opponents'),
    serving: props.playback.servingSide === i + 1,
    players: group.map(slot => ({
      slot,
      name: props.names[slot] ?? `Slot ${slot}`,
      club: clubTag(props.clubs?.[slot]),
      serving: props.playback.servingSlot === slot,
    })),
  }))
})

/** Label column, then one fixed cell per set so the columns stay aligned. */
const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(0,1fr) repeat(${columns.value.length}, 2.5rem)`,
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
    class="pointer-events-auto absolute left-3 top-3 cursor-pointer overflow-hidden rounded-xl border border-white/12 bg-black/28 text-white backdrop-blur-md backdrop-saturate-150 transition-[border-color] duration-200 hover:border-white/30 legible"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <div class="relative px-3 py-2">
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
          class="text-center font-display text-[0.625rem] font-semibold uppercase tracking-[0.12em]"
          :class="column.live ? 'text-[var(--ui-accent)]' : 'text-white/45'"
        >S{{ column.number }}</span>
      </div>

      <div
        v-for="s in sides"
        :key="s.side"
        class="grid items-center gap-x-1 border-b border-white/10 py-1 last:border-b-0"
        :style="gridStyle"
      >
        <!-- Compact: one line per side. Expanded: the names that make it up. -->
        <div class="min-w-0 pr-2">
          <template v-if="mode === 'compact'">
            <p class="flex items-center gap-1.5 truncate font-display text-sm font-semibold uppercase tracking-[0.06em]">
              <Circle
                :size="7"
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
              class="flex items-center gap-1.5 text-[0.8125rem] leading-tight"
            >
              <!-- Shuttle marks the server; the space is reserved either way so
                   the rows never shift as service changes. -->
              <Circle
                :size="7"
                class="shrink-0 transition-[color,filter] duration-200"
                :class="p.serving
                  ? 'fill-[var(--ui-accent)] text-[var(--ui-accent)] drop-shadow-[0_0_6px_var(--ui-accent)]'
                  : 'text-transparent'"
                aria-hidden="true"
              />
              <span
                v-if="p.club"
                class="shrink-0 rounded border border-white/25 px-1 font-mono text-[0.5625rem] font-semibold tracking-wide text-white/70"
              >{{ p.club }}</span>
              <span class="truncate" :class="p.serving ? 'font-semibold' : 'text-white/80'">
                {{ p.name }}
              </span>
            </p>
          </template>
        </div>

        <span
          v-for="column in columns"
          :key="column.number"
          :data-testid="column.live ? 'scoreboard-live' : undefined"
          class="text-center font-display text-xl font-bold tabular-nums leading-none"
          :class="column.live ? 'text-accent' : 'text-white/60'"
        >{{ column.score[s.side - 1] }}</span>
      </div>
    </div>

    <!-- Kept as the affordance — it is what tells you the board can change
         size — but the click is handled by the board itself, so this is
         decoration and must not swallow the event or double-toggle it. -->
    <span
      data-testid="scoreboard-mode"
      class="pointer-events-none absolute right-1 top-1 grid size-6 place-items-center rounded-md text-white/40"
      aria-hidden="true"
    >
      <component :is="mode === 'compact' ? ChevronsUpDown : ChevronsDownUp" :size="13" />
    </span>
  </div>
</template>
