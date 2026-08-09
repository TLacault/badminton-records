<script setup lang="ts">
import type { MatchFormat, PlaybackState } from '~~/shared/badminton'
import { Circle } from '@lucide/vue'

const props = defineProps<{
  playback: PlaybackState
  names: Record<number, string>
  format: MatchFormat
}>()

/** Slots per side: doubles fields 1+2 against 3+4, singles just 1 against 3. */
const sides = computed(() => {
  const slots = props.format === 'doubles' ? [[1, 2], [3, 4]] : [[1], [3]]
  return slots.map((group, i) => ({
    side: (i + 1) as 1 | 2,
    score: props.playback.score[i] ?? 0,
    games: props.playback.gamesWon[i] ?? 0,
    players: group.map(slot => ({
      slot,
      name: props.names[slot] ?? `Slot ${slot}`,
      serving: props.playback.servingSlot === slot,
    })),
  }))
})
</script>

<template>
  <div
    data-testid="score-overlay"
    class="absolute left-3 top-3 min-w-52 rounded-md bg-black/75 text-sm text-slate-100 backdrop-blur-sm"
  >
    <div
      v-for="s in sides"
      :key="s.side"
      class="flex items-center gap-2 border-b border-white/10 px-2.5 py-1.5 last:border-b-0"
    >
      <div class="min-w-0 flex-1">
        <p
          v-for="p in s.players"
          :key="p.slot"
          class="flex items-center gap-1.5 truncate leading-tight"
        >
          <!-- Shuttle marks the server; the space is reserved either way so
               the two rows never shift as service changes. -->
          <Circle
            :size="8"
            :class="p.serving ? 'shrink-0 fill-amber-400 text-amber-400' : 'shrink-0 text-transparent'"
          />
          <span :class="p.serving ? 'font-semibold' : ''">{{ p.name }}</span>
        </p>
      </div>
      <span class="shrink-0 text-xs tabular-nums text-slate-400">{{ s.games }}</span>
      <span
        data-testid="overlay-score"
        class="w-7 shrink-0 text-right text-xl font-bold tabular-nums"
      >{{ s.score }}</span>
    </div>
    <p class="px-2.5 py-1 text-[11px] uppercase tracking-wide text-slate-400">
      Game {{ playback.gameNumber }}
    </p>
  </div>
</template>
