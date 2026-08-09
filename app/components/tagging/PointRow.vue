<script setup lang="ts">
import type { RallyInput, RallyState } from '~~/shared/badminton'
import { Check, Minus, RotateCcw, Star, Trash2, X } from '@lucide/vue'

defineProps<{
  rally: RallyInput
  state: RallyState | null
  names: Record<number, string>
  slotToPlayerId: Record<number, string>
}>()

const emit = defineEmits<{
  seek: [seconds: number]
  flip: [idx: number]
  'toggle-let': [idx: number]
  'toggle-highlight': [idx: number]
  'set-scorer': [idx: number, playerId: string | null]
  delete: [idx: number]
}>()

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <li class="flex items-center gap-2 border-b border-slate-800 py-1.5 text-xs" :data-rally-idx="rally.idx">
    <button
      class="w-11 shrink-0 text-left font-mono text-slate-500 hover:text-slate-200"
      :title="`Seek to ${formatTime(state?.startsAtSeconds ?? 0)}`"
      @click="emit('seek', state?.startsAtSeconds ?? 0)"
    >
      {{ formatTime(state?.startsAtSeconds ?? 0) }}
    </button>

    <span class="w-5 shrink-0 text-slate-600">G{{ state?.gameNumber ?? '?' }}</span>

    <button
      data-testid="row-score"
      class="w-12 shrink-0 rounded px-1 font-mono tabular-nums"
      :class="rally.isLet ? 'bg-slate-800 text-slate-400' : 'bg-slate-800 text-slate-100'"
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
      <Minus v-if="rally.isLet" :size="14" class="text-slate-600" />
      <Check v-else-if="rally.winnerSide === 1" :size="14" class="text-emerald-400" />
      <X v-else :size="14" class="text-red-400" />
    </span>

    <span data-testid="row-server" class="min-w-0 flex-1 truncate text-slate-500">
      {{ state ? names[state.servingSlot] ?? `Slot ${state.servingSlot}` : '' }}
      <span class="text-slate-700">{{ state?.serviceCourt === 'right' ? '▸R' : '▸L' }}</span>
    </span>

    <select
      class="w-44 shrink-0 rounded border border-slate-800 bg-slate-900 px-1 py-0.5 text-slate-300"
      :value="rally.scoredByPlayerId ?? ''"
      @change="emit('set-scorer', rally.idx, ($event.target as HTMLSelectElement).value || null)"
    >
      <option value="">
        scorer
      </option>
      <option v-for="(playerId, slot) in slotToPlayerId" :key="slot" :value="playerId">
        {{ names[Number(slot)] }}
      </option>
    </select>

    <button
      data-testid="row-star"
      class="shrink-0"
      :class="rally.isHighlight ? 'text-amber-400' : 'text-slate-700 hover:text-slate-400'"
      title="Toggle highlight"
      @click="emit('toggle-highlight', rally.idx)"
    >
      <Star :size="14" :fill="rally.isHighlight ? 'currentColor' : 'none'" />
    </button>
    <button
      class="shrink-0 text-slate-700 hover:text-slate-400"
      title="Toggle let"
      @click="emit('toggle-let', rally.idx)"
    >
      <RotateCcw :size="14" />
    </button>
    <button
      data-testid="row-delete"
      class="shrink-0 text-slate-700 hover:text-red-400"
      title="Delete rally"
      @click="emit('delete', rally.idx)"
    >
      <Trash2 :size="14" />
    </button>
  </li>
</template>
