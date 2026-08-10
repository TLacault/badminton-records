<script setup lang="ts">
import type { BreakInput, DerivedMatch, MatchFormat } from '~~/shared/badminton'
import type { PlayerInfoSource } from '~/utils/players'
import {
  ChevronDown,
  Clock,
  Eye,
  Flame,
  Hourglass,
  Percent,
  Repeat,
  Star,
  Target,
  Timer,
  TriangleAlert,
  Trophy,
  Zap,
} from '@lucide/vue'
import { matchStats, playerScoring } from '~~/shared/badminton'

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null
    breaks: readonly BreakInput[]
    format: MatchFormat
    names: Record<number, string>
    /** Side labels — "Tim & Adrien", not "Us". */
    sideLabels: Record<number, string>
    slotToPlayerId: Record<number, string | null>
    /** Full roster rows, keyed by player id, for the personal-detail chips. */
    playerRows: Record<string, PlayerInfoSource>
    playerInfoFields: readonly string[]
    /** False blurs the panel: it prints the final score. */
    revealed?: boolean
  }>(),
  { revealed: true },
)

const emit = defineEmits<{ reveal: [] }>()

const open = ref(true)

const stats = computed(() =>
  props.derived ? matchStats(props.derived, props.breaks) : null,
)

const scoring = computed(() =>
  props.derived ? playerScoring(props.derived, props.slotToPlayerId) : [],
)

/** Doubles fields 1+2 against 3+4; singles just 1 against 3. */
const sides = computed(() => {
  const slots = props.format === 'doubles' ? [[1, 2], [3, 4]] : [[1], [3]]
  return slots.map((group, i) => {
    const side = (i + 1) as 1 | 2
    return {
      side,
      label: props.sideLabels[side] ?? (i === 0 ? 'Us' : 'Opponents'),
      totals: stats.value?.sides[i] ?? null,
      won: props.derived?.matchWinnerSide === side,
      players: group
        .map((slot) => {
          const playerId = props.slotToPlayerId[slot] ?? null
          const row = scoring.value.find(r => r.slot === slot)
          return {
            slot,
            name: props.names[slot] ?? `Slot ${slot}`,
            chips: playerInfoChips(playerId ? props.playerRows[playerId] : null, props.playerInfoFields),
            points: row?.pointsScored ?? 0,
            share: row?.shareOfSide ?? 0,
            highlights: row?.highlights ?? 0,
            bestRun: row?.bestRun ?? 0,
            tagged: Boolean(row),
          }
        })
        .filter(p => props.names[p.slot]),
    }
  })
})

/** `95` → `1m 35s`. Rally lengths, where a bare count of seconds reads poorly. */
function clock(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  return `${m}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`
}

const tiles = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { key: 'rallies', icon: Target, label: 'Rallies', value: String(s.rallies) },
    { key: 'played', icon: Timer, label: 'Rally time', value: clock(s.playedSeconds) },
    { key: 'mean', icon: Clock, label: 'Average rally', value: clock(s.meanRallySeconds) },
    {
      key: 'longest',
      icon: Zap,
      label: 'Longest rally',
      value: s.longestRally ? clock(s.longestRally.seconds) : '—',
    },
    { key: 'breaks', icon: Hourglass, label: 'Break time', value: clock(s.breakSeconds) },
    { key: 'lets', icon: Repeat, label: 'Lets', value: String(s.lets) },
  ]
})

const STAT_HEAD = 'pb-1.5 text-right font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle'
const STAT_CELL = 'py-1.5 text-right tabular-nums'
</script>

<template>
  <section data-testid="match-details" class="relative overflow-hidden rounded-2xl p-5 glass sm:p-6">
    <h2>
      <button
        type="button"
        data-testid="details-toggle"
        class="-m-1 flex w-full items-center gap-2 p-1 text-left"
        :aria-expanded="open"
        aria-controls="match-details-body"
        @click="open = !open"
      >
        <span class="label !text-ink">Match details</span>
        <ChevronDown
          :size="15"
          class="ml-auto shrink-0 text-ink-subtle transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </h2>

    <div v-show="open" id="match-details-body" class="relative mt-4">
      <div :class="revealed ? '' : 'pointer-events-none select-none blur-md'">
        <div v-if="stats?.sets.length" class="border-t border-line pt-4">
          <p class="label text-[0.6875rem]">
            {{ $t('match.sets') }}
          </p>
          <ul data-testid="set-scores" class="mt-2 flex flex-wrap gap-2">
            <li
              v-for="set in stats.sets"
              :key="set.number"
              class="rounded-lg border px-2.5 py-1 font-display text-sm font-bold tabular-nums"
              :class="set.winnerSide === 1
                ? 'border-accent/35 bg-accent-soft text-accent'
                : 'border-line text-ink-muted'"
            >
              <span class="mr-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                S{{ set.number }}
              </span>
              {{ set.score[0] }}–{{ set.score[1] }}
            </li>
          </ul>
        </div>

        <dl v-if="tiles.length" class="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <div v-for="tile in tiles" :key="tile.key" class="rounded-xl border border-line px-3 py-2.5">
            <dt class="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.08em] text-ink-subtle">
              <component :is="tile.icon" :size="12" class="text-accent" aria-hidden="true" />
              {{ tile.label }}
            </dt>
            <dd class="mt-1 font-display text-lg font-bold tabular-nums text-ink">
              {{ tile.value }}
            </dd>
          </div>
        </dl>

        <div class="mt-6 border-t border-line pt-4">
          <p class="label mb-3 text-[0.6875rem]">
            {{ $t('match.players') }}
          </p>
        <div class="grid gap-5 sm:grid-cols-2 sm:gap-6">
          <div v-for="s in sides" :key="s.side" :data-testid="`side-${s.side}`">
            <div class="flex items-baseline justify-between gap-3 border-b border-line pb-2">
              <p class="flex items-center gap-1.5 font-display text-base font-bold uppercase tracking-wide">
                <Trophy v-if="s.won" :size="14" class="text-accent" aria-hidden="true" />
                {{ s.label }}
              </p>
              <p class="font-display text-2xl font-bold tabular-nums leading-none" :class="s.won ? 'text-accent' : 'text-ink-muted'">
                {{ s.totals?.points ?? 0 }}
              </p>
            </div>

            <table class="mt-1 w-full text-sm">
              <thead>
                <tr>
                  <th class="pb-1.5 text-left font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                    {{ $t('match.player') }}
                  </th>
                  <th :class="STAT_HEAD" :title="$t('match.pointsScored')">
                    <Target :size="12" class="ml-auto" aria-hidden="true" />
                    <span class="sr-only">Points scored</span>
                  </th>
                  <th :class="STAT_HEAD" :title="$t('match.pointsShare')">
                    <Percent :size="12" class="ml-auto" aria-hidden="true" />
                    <span class="sr-only">Share of the side's points</span>
                  </th>
                  <th :class="STAT_HEAD" :title="$t('match.highlights')">
                    <Star :size="12" class="ml-auto" aria-hidden="true" />
                    <span class="sr-only">Highlights</span>
                  </th>
                  <th :class="STAT_HEAD" :title="$t('match.bestRun')">
                    <Flame :size="12" class="ml-auto" aria-hidden="true" />
                    <span class="sr-only">Best run of points</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in s.players" :key="p.slot" class="border-t border-line/70">
                  <td class="py-1.5 pr-2">
                    <span class="block truncate font-medium text-ink">{{ p.name }}</span>
                    <span v-if="p.chips.length" class="mt-0.5 flex flex-wrap gap-1">
                      <span
                        v-for="chip in p.chips"
                        :key="chip.id"
                        :title="chip.label"
                        class="rounded border border-line px-1 py-px text-[0.625rem] text-ink-subtle"
                      >{{ chip.value }}</span>
                    </span>
                  </td>
                  <td :class="STAT_CELL" class="font-semibold text-ink">
                    {{ p.points }}
                  </td>
                  <td :class="STAT_CELL" class="text-ink-muted">
                    {{ Math.round(p.share * 100) }}%
                  </td>
                  <td :class="STAT_CELL" class="text-ink-muted">
                    {{ p.highlights }}
                  </td>
                  <td :class="STAT_CELL" class="text-ink-muted">
                    {{ p.bestRun }}
                  </td>
                </tr>
              </tbody>
            </table>

            <p v-if="s.totals && s.totals.attributed < s.totals.points" class="mt-2 text-xs text-ink-subtle">
              {{ s.totals.points - s.totals.attributed }} point{{ s.totals.points - s.totals.attributed === 1 ? '' : 's' }}
              {{ $t('match.noScorer') }}
            </p>
            <p v-if="s.totals" class="mt-1 text-xs text-ink-subtle tabular-nums">
              {{ s.totals.wonOnServe }} won on serve · best run {{ s.totals.bestRun }}
            </p>
          </div>
        </div>
        </div>

        <ul v-if="derived?.warnings.length" data-testid="details-warnings" class="mt-5 space-y-1.5">
          <li
            v-for="(warning, i) in derived.warnings"
            :key="i"
            class="flex items-start gap-2 rounded-lg border border-accent/35 bg-accent-soft px-3 py-2 text-xs text-accent"
          >
            <TriangleAlert :size="13" class="mt-px shrink-0" aria-hidden="true" />
            {{ warning.message }}
          </li>
        </ul>
      </div>

      <!-- The panel prints the final score, so it stays behind the same click
           as the result tag above the video. -->
      <div v-if="!revealed" class="absolute inset-0 grid place-items-center">
        <button
          type="button"
          data-testid="details-reveal"
          class="btn btn-ghost btn-sm"
          @click="emit('reveal')"
        >
          <Eye :size="14" aria-hidden="true" />
          {{ $t('match.reveal') }}
        </button>
      </div>
    </div>
  </section>
</template>
