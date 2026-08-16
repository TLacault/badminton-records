<script setup lang="ts">
import type { Inserted } from '~/composables/useTaggingSession'
import type { BreakInput, DerivedMatch, RallyInput, RallyState } from '~~/shared/badminton'

const props = withDefaults(
  defineProps<{
    rallies: RallyInput[]
    breaks?: BreakInput[]
    derived: DerivedMatch
    names: Record<number, string>
    slotToPlayerId: Record<number, string>
    /** The point being watched, and so the one the editing keys act on. */
    currentIdx?: number | null
    /** The row a mutation just put in the log, for the flash. */
    lastInserted?: Inserted | null
  }>(),
  { breaks: () => [], currentIdx: null, lastInserted: null },
)

const emit = defineEmits<{
  seek: [seconds: number]
  flip: [idx: number]
  'toggle-let': [idx: number]
  'toggle-highlight': [idx: number]
  'set-scorer': [idx: number, playerId: string | null]
  'set-timestamp': [idx: number, seconds: number]
  delete: [idx: number]
  'set-break-time': [idx: number, edge: 'start' | 'end', seconds: number]
  'delete-break': [idx: number]
}>()

const stateByIdx = computed(() => {
  const map = new Map<number, RallyState>()
  for (const s of props.derived.rallyStates) map.set(s.idx, s)
  return map
})

type Entry =
  | { kind: 'rally', key: string, at: number, idx: number, rally: RallyInput }
  | { kind: 'break', key: string, at: number, idx: number, brk: BreakInput }

/**
 * Breaks sort above points at the same instant: a break tagged at the moment a
 * point ended began right after it, so in a newest-first list it is the later
 * of the two.
 */
function rank(entry: Entry) {
  return entry.kind === 'break' ? 1 : 0
}

/**
 * One log, newest first: points and the pauses between them, in video order.
 *
 * Two lists side by side made the one thing this screen is for — finding the
 * hole in a region already tagged — a matter of reading a timecode in one panel
 * and hunting for it in another. Interleaved, the break you forgot a point
 * inside is sitting right where the point belongs.
 *
 * Newest first because while tagging, the point just logged is the one you need
 * to check, and it belongs at the top rather than at the bottom of a list you
 * have to chase downwards.
 *
 * A break sorts by its START against a point's END, which is what puts it below
 * the point it follows and above the point that follows it.
 *
 * The tiebreaks are total orders rather than a preference, because points
 * sharing a timestamp are ordinary — a burst of presses during one exchange, or
 * a match tagged before the video was ready. A comparator that answers "after"
 * for every such pair is not a comparator, and `sort` is free to do whatever it
 * likes with it. It chose oldest-first, which is the one order this list must
 * never be in.
 */
const ordered = computed<Entry[]>(() => {
  const entries: Entry[] = [
    ...props.rallies.map(rally => ({
      kind: 'rally' as const,
      key: `r${rally.idx}`,
      at: rally.endedAtSeconds,
      idx: rally.idx,
      rally,
    })),
    ...props.breaks.map(brk => ({
      kind: 'break' as const,
      key: `b${brk.idx}`,
      at: brk.startsAtSeconds,
      idx: brk.idx,
      brk,
    })),
  ]
  return entries.sort((a, b) =>
    (b.at - a.at) || (rank(b) - rank(a)) || (b.idx - a.idx),
  )
})

/**
 * The row to flash, and the mutation that asked for it.
 *
 * The row is named by the session rather than guessed from the log. Guessing —
 * taking the last rally in the array — was right only while tagging forwards:
 * patch a hole at 3:44 and the flash fired on the final point of the match,
 * which reads as the new point having been appended to the end when it was
 * filed correctly all along.
 */
const flashKey = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.lastInserted?.seq, (seq) => {
  const inserted = props.lastInserted
  if (seq === undefined || !inserted) return
  flashKey.value = `${inserted.kind === 'rally' ? 'r' : 'b'}${inserted.idx}`
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashKey.value = null
  }, 900)
})

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
})

const list = ref<HTMLElement | null>(null)

/**
 * Keep the watched row in view — a highlight three hundred points off screen
 * is no help while scrubbing through a match.
 *
 * The list is scrolled by hand rather than with `scrollIntoView`, which walks
 * every scrollable ancestor and would drag the whole page around under the
 * video for a row that was only just out of sight.
 */
watch(() => props.currentIdx, async (idx) => {
  if (idx === null) return
  await nextTick()
  const container = list.value
  const row = container?.querySelector<HTMLElement>(`[data-rally-idx="${idx}"]`)
  if (!container || !row) return
  const view = container.getBoundingClientRect()
  const bounds = row.getBoundingClientRect()
  if (bounds.top < view.top) container.scrollTop -= view.top - bounds.top
  else if (bounds.bottom > view.bottom) container.scrollTop += bounds.bottom - view.bottom
})
</script>

<template>
  <!--
    h-full + flex so the panel fills its grid cell and the list takes whatever
    height is left. A fixed max-height left the panel short, with dead space
    below it on tall screens.
  -->
  <div class="flex h-full flex-col overflow-hidden rounded-2xl glass">
    <div class="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
      <span class="label !text-ink">Points</span>
      <div class="flex items-baseline gap-3">
        <span
          v-if="breaks.length"
          data-testid="pl-break-count"
          class="text-xs text-ink-subtle"
        >{{ breaks.length }} {{ breaks.length === 1 ? 'break' : 'breaks' }}</span>
        <span data-testid="pl-count" class="font-display text-sm font-semibold tabular-nums text-accent">
          {{ rallies.length }}
        </span>
      </div>
    </div>

    <ul ref="list" data-testid="pl-rows" class="min-h-0 flex-1 overflow-y-auto px-3">
      <template v-for="entry in ordered" :key="entry.key">
        <TaggingPointRow
          v-if="entry.kind === 'rally'"
          :rally="entry.rally"
          :state="stateByIdx.get(entry.rally.idx) ?? null"
          :names="names"
          :slot-to-player-id="slotToPlayerId"
          :flash="flashKey === entry.key"
          :current="currentIdx === entry.rally.idx"
          @seek="(s: number) => emit('seek', s)"
          @flip="(i: number) => emit('flip', i)"
          @toggle-let="(i: number) => emit('toggle-let', i)"
          @toggle-highlight="(i: number) => emit('toggle-highlight', i)"
          @set-scorer="(i: number, p: string | null) => emit('set-scorer', i, p)"
          @set-timestamp="(i: number, sec: number) => emit('set-timestamp', i, sec)"
          @delete="(i: number) => emit('delete', i)"
        />
        <TaggingBreakRow
          v-else
          :brk="entry.brk"
          :flash="flashKey === entry.key"
          @seek="(s: number) => emit('seek', s)"
          @set-time="(i: number, edge: 'start' | 'end', sec: number) => emit('set-break-time', i, edge, sec)"
          @delete="(i: number) => emit('delete-break', i)"
        />
      </template>
    </ul>

    <p v-if="!ordered.length" class="px-4 py-4 text-xs text-ink-subtle">
      Nothing logged yet — the keyboard panel under the video lists the keys.
    </p>
  </div>
</template>
