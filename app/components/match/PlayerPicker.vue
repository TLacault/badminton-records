<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchFormat, Slot } from '~~/shared/badminton'

type Player = Database['public']['Tables']['players']['Row']

const props = defineProps<{
  modelValue: Record<number, string | null>
  format: MatchFormat
  players: Player[]
}>()

// Reports the single slot that changed rather than a whole rebuilt object.
// Deriving `{ ...props.modelValue, [slot]: v }` looks equivalent but is not:
// props do not update synchronously, so two changes in quick succession both
// build from the same stale object and the first one is silently lost.
const emit = defineEmits<{ select: [slot: number, playerId: string | null] }>()

// Singles uses slots 1 and 3 only; the numkeys still map slot -> player.
const slots = computed<Slot[]>(() =>
  props.format === 'singles' ? [1, 3] : [1, 2, 3, 4],
)

const labels: Record<number, string> = {
  1: 'Slot 1 (&) — our side',
  2: 'Slot 2 (é) — our side',
  3: 'Slot 3 (") — opponents',
  4: 'Slot 4 (\') — opponents',
}

function set(slot: number, value: string) {
  emit('select', slot, value || null)
}
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2">
    <label v-for="slot in slots" :key="slot" class="block">
      <span class="text-sm text-slate-400">{{ labels[slot] }}</span>
      <select
        :data-testid="`slot-${slot}`"
        :value="modelValue[slot] ?? ''"
        class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
        @change="set(slot, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">
          —
        </option>
        <option v-for="p in players" :key="p.id" :value="p.id">
          {{ p.first_name }} {{ p.last_name }}
        </option>
      </select>
    </label>
  </div>
</template>
