<script setup lang="ts">
import type { DerivedMatch, RallyInput, RallyState } from '~~/shared/badminton'

const props = defineProps<{
  rallies: RallyInput[]
  derived: DerivedMatch
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

const stateByIdx = computed(() => {
  const map = new Map<number, RallyState>()
  for (const s of props.derived.rallyStates) map.set(s.idx, s)
  return map
})

const list = ref<HTMLElement | null>(null)

// Keep the newest rally in view while tagging.
watch(() => props.rallies.length, async () => {
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
})
</script>

<template>
  <div class="rounded border border-slate-800 bg-slate-900">
    <div class="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-sm">
      <span class="font-semibold">Points</span>
      <span data-testid="pl-count" class="text-slate-500">{{ rallies.length }}</span>
    </div>
    <!--
      Fills the viewport minus the chrome above it (nav, page padding, title
      row, panel header) so the list scrolls internally and the page itself
      never does.
    -->
    <ul ref="list" data-testid="pl-rows" class="max-h-[calc(100vh-12rem)] overflow-y-auto px-3">
      <TaggingPointRow
        v-for="rally in rallies"
        :key="rally.idx"
        :rally="rally"
        :state="stateByIdx.get(rally.idx) ?? null"
        :names="names"
        :slot-to-player-id="slotToPlayerId"
        @seek="(s: number) => emit('seek', s)"
        @flip="(i: number) => emit('flip', i)"
        @toggle-let="(i: number) => emit('toggle-let', i)"
        @toggle-highlight="(i: number) => emit('toggle-highlight', i)"
        @set-scorer="(i: number, p: string | null) => emit('set-scorer', i, p)"
        @delete="(i: number) => emit('delete', i)"
      />
    </ul>
    <p v-if="!rallies.length" class="px-3 py-4 text-xs text-slate-500">
      Press A or Z to log the first point.
    </p>
  </div>
</template>
