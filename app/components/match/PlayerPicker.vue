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
const emit = defineEmits<{
  select: [slot: number, playerId: string | null]
  /** A licensee was added to the roster and needs loading into `players`. */
  created: []
}>()

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

function set(slot: number, value: string | null) {
  emit('select', slot, value)
}
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <div v-for="slot in slots" :key="slot">
      <span
        class="label"
        :class="slot <= 2 ? 'text-accent' : ''"
      >{{ labels[slot] }}</span>
      <PlayerSlotSearch
        class="mt-2"
        :testid="`slot-${slot}`"
        :label="labels[slot]!"
        :players="players"
        :model-value="modelValue[slot] ?? null"
        @update:model-value="value => set(slot, value)"
        @created="emit('created')"
      />
    </div>
  </div>
</template>
