<script setup lang="ts">
import type { DerivedMatch } from '~~/shared/badminton'

const props = defineProps<{
  derived: DerivedMatch
  names: Record<number, string>
}>()

const last = computed(() => props.derived.rallyStates.at(-1) ?? null)
const currentGame = computed(() => props.derived.games.at(-1) ?? null)

/** State after the last rally, or 0-0 before any. */
const score = computed<[number, number]>(() => last.value?.scoreAfter ?? [0, 0])

/** Who serves the NEXT rally: the winner of the last one. */
const nextServer = computed(() => {
  if (!last.value) return null
  return { side: last.value.servingSide, slot: last.value.servingSlot }
})
</script>

<template>
  <div class="rounded border border-slate-800 bg-slate-900 p-4">
    <div class="flex items-baseline justify-between">
      <span class="text-sm text-slate-400">
        Game {{ currentGame?.number ?? 1 }}
        · {{ derived.gamesWon[0] }}–{{ derived.gamesWon[1] }} games
      </span>
      <span v-if="last?.isMatchPoint" data-testid="sb-flag" class="text-sm font-semibold text-amber-400">
        MATCH POINT
      </span>
      <span v-else-if="last?.isGamePoint" data-testid="sb-flag" class="text-sm font-semibold text-emerald-400">
        GAME POINT
      </span>
    </div>

    <div data-testid="sb-score" class="mt-2 flex items-center gap-4 text-4xl font-bold tabular-nums">
      <span :class="nextServer?.side === 1 ? 'text-emerald-400' : ''">{{ score[0] }}</span>
      <span class="text-slate-600">–</span>
      <span :class="nextServer?.side === 2 ? 'text-emerald-400' : ''">{{ score[1] }}</span>
    </div>

    <p v-if="nextServer" data-testid="sb-server" class="mt-2 text-sm text-slate-400">
      Serving next: <span class="text-slate-100">{{ names[nextServer.slot] ?? `Slot ${nextServer.slot}` }}</span>
    </p>
    <p v-else class="mt-2 text-sm text-slate-500">
      No rallies logged yet.
    </p>

    <p v-if="derived.complete" data-testid="sb-complete" class="mt-2 text-sm font-semibold text-emerald-400">
      Match complete — side {{ derived.matchWinnerSide }} wins.
    </p>

    <ul v-if="derived.warnings.length" data-testid="sb-warnings" class="mt-3 space-y-1">
      <li v-for="(w, i) in derived.warnings" :key="i" class="rounded bg-amber-950 px-2 py-1 text-xs text-amber-300">
        {{ w.message }}
      </li>
    </ul>
  </div>
</template>
