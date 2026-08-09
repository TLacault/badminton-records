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
  'set-timestamp': [idx: number, seconds: number]
  delete: [idx: number]
}>()

const stateByIdx = computed(() => {
  const map = new Map<number, RallyState>()
  for (const s of props.derived.rallyStates) map.set(s.idx, s)
  return map
})

/**
 * Newest first. While tagging, the point just logged is the one you need to
 * check or correct, so it belongs at the top rather than at the bottom of a
 * list you have to chase downwards.
 */
const ordered = computed(() => [...props.rallies].reverse())

/** idx of the row to flash; cleared once the animation has run. */
const flashIdx = ref<number | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.rallies.length, (next, previous) => {
  // Only on growth: deletes and undo must not flash.
  if (next <= previous) return
  const newest = props.rallies.at(-1)
  if (!newest) return
  flashIdx.value = newest.idx
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashIdx.value = null
  }, 900)
})

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<template>
  <!--
    h-full + flex so the panel fills its grid cell and the list takes whatever
    height is left. A fixed max-height left the panel short, with dead space
    below it on tall screens.
  -->
  <div class="flex h-full flex-col overflow-hidden rounded border border-slate-800 bg-slate-900">
    <div class="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2 text-sm">
      <span class="font-semibold">Points</span>
      <span data-testid="pl-count" class="text-slate-500">{{ rallies.length }}</span>
    </div>

    <ul data-testid="pl-rows" class="min-h-0 flex-1 overflow-y-auto px-3">
      <TaggingPointRow
        v-for="rally in ordered"
        :key="rally.idx"
        :rally="rally"
        :state="stateByIdx.get(rally.idx) ?? null"
        :names="names"
        :slot-to-player-id="slotToPlayerId"
        :flash="flashIdx === rally.idx"
        @seek="(s: number) => emit('seek', s)"
        @flip="(i: number) => emit('flip', i)"
        @toggle-let="(i: number) => emit('toggle-let', i)"
        @toggle-highlight="(i: number) => emit('toggle-highlight', i)"
        @set-scorer="(i: number, p: string | null) => emit('set-scorer', i, p)"
        @set-timestamp="(i: number, sec: number) => emit('set-timestamp', i, sec)"
        @delete="(i: number) => emit('delete', i)"
      />
    </ul>

    <p v-if="!rallies.length" class="px-3 py-4 text-xs text-slate-500">
      Press A or Z to log the first point.
    </p>
  </div>
</template>
