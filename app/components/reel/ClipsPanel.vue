<script setup lang="ts">
import type { BreakInput, DerivedMatch, RallyState } from '~~/shared/badminton'
import type { ReelClip as Clip } from '~~/shared/reel'
import { ArrowDownWideNarrow, Plus, Sparkles, Star, Wand2 } from '@lucide/vue'
import { highlightSpans } from '~~/shared/badminton'
import { DEFAULT_LEAD_SECONDS, DEFAULT_TAIL_SECONDS } from '~~/shared/reel'

/**
 * The clip list, and the two ways to fill it.
 *
 * The first is one button: every highlight already tagged on this match,
 * padded and in order. That is the tool's whole reason for existing — the
 * tagging was done once, live, with a keyboard, and it should not have to be
 * done again with a mouse.
 *
 * The second is the point list underneath, for the rally nobody starred at the
 * time and everybody remembers afterwards.
 */

const props = defineProps<{
  clips: Clip[]
  derived: DerivedMatch | null
  breaks: BreakInput[]
  sourceDuration: number
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  patch: [id: string, patch: Partial<Clip>]
  remove: [id: string]
  move: [id: string, delta: number]
  play: [id: string]
  rebuild: [options: { lead: number, tail: number }]
  addRally: [idx: number]
  sort: []
}>()

const lead = ref(DEFAULT_LEAD_SECONDS)
const tail = ref(DEFAULT_TAIL_SECONDS)
const highlightsOnly = ref(true)

const rallies = computed<RallyState[]>(() => props.derived?.rallyStates ?? [])

const available = computed(() =>
  rallies.value.filter(rally => !highlightsOnly.value || rally.isHighlight),
)

const highlightCount = computed(() =>
  highlightSpans(rallies.value, props.breaks).length,
)

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <div class="rounded-xl border border-line bg-panel p-3">
      <div class="flex items-center gap-2">
        <Sparkles :size="15" class="shrink-0 text-accent" aria-hidden="true" />
        <p class="font-display text-sm font-semibold uppercase tracking-[0.1em] text-ink">
          {{ $t('reel.fromHighlights') }}
        </p>
        <span class="ml-auto font-mono text-xs tabular-nums text-ink-subtle">{{ highlightCount }}</span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <label class="block">
          <span class="label">{{ $t('reel.lead') }} · {{ lead.toFixed(1) }}s</span>
          <input v-model.number="lead" type="range" min="0" max="5" step="0.1" class="mt-2 w-full accent-[var(--ui-accent)]">
        </label>
        <label class="block">
          <span class="label">{{ $t('reel.tail') }} · {{ tail.toFixed(1) }}s</span>
          <input v-model.number="tail" type="range" min="0" max="5" step="0.1" class="mt-2 w-full accent-[var(--ui-accent)]">
        </label>
      </div>

      <button
        type="button"
        data-testid="reel-rebuild"
        class="btn btn-primary btn-sm mt-3 w-full"
        :disabled="!highlightCount"
        @click="emit('rebuild', { lead, tail })"
      >
        <Wand2 :size="15" aria-hidden="true" />
        {{ clips.length ? $t('reel.rebuild') : $t('reel.build') }}
      </button>
      <p v-if="clips.length" class="mt-1.5 text-center text-[0.6875rem] text-ink-subtle">
        {{ $t('reel.rebuildHint') }}
      </p>
    </div>

    <div class="mt-4 flex items-center gap-2">
      <p class="label">
        {{ $t('reel.clips') }} · {{ clips.length }}
      </p>
      <button
        type="button"
        class="btn btn-sm btn-ghost ml-auto !min-h-8"
        :disabled="clips.length < 2"
        @click="emit('sort')"
      >
        <ArrowDownWideNarrow :size="14" aria-hidden="true" />
        {{ $t('reel.sort') }}
      </button>
    </div>

    <ul class="mt-2 flex flex-col gap-2">
      <ReelClipRow
        v-for="(clip, i) in clips"
        :key="clip.id"
        :clip="clip"
        :index="i"
        :selected="clip.id === selectedId"
        :source-duration="sourceDuration"
        :is-first="i === 0"
        :is-last="i === clips.length - 1"
        @select="emit('select', clip.id)"
        @patch="patch => emit('patch', clip.id, patch)"
        @remove="emit('remove', clip.id)"
        @move="delta => emit('move', clip.id, delta)"
        @play="emit('play', clip.id)"
      />
    </ul>

    <p v-if="!clips.length" class="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-subtle">
      {{ $t('reel.noClips') }}
    </p>

    <!-- Every point, for the ones nobody starred while the match was running. -->
    <div class="mt-6">
      <div class="flex items-center gap-2">
        <p class="label">
          {{ $t('reel.addPoints') }}
        </p>
        <label class="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
          <input v-model="highlightsOnly" type="checkbox" class="size-4 accent-[var(--ui-accent)]">
          {{ $t('reel.starredOnly') }}
        </label>
      </div>

      <ul class="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line">
        <li v-for="rally in available" :key="rally.idx">
          <button
            type="button"
            class="flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-soft"
            @click="emit('addRally', rally.idx)"
          >
            <Star
              :size="12"
              class="shrink-0"
              :class="rally.isHighlight ? 'fill-accent text-accent' : 'text-ink-subtle'"
              aria-hidden="true"
            />
            <span class="font-display text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              S{{ rally.setNumber }}
            </span>
            <span class="font-display text-sm font-bold tabular-nums text-ink">
              {{ rally.scoreAfter[0] }}–{{ rally.scoreAfter[1] }}
            </span>
            <span class="ml-auto font-mono text-[0.6875rem] tabular-nums text-ink-subtle">
              {{ clock(rally.startsAtSeconds) }}
            </span>
            <Plus :size="14" class="shrink-0 text-accent" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <p v-if="!available.length" class="mt-2 text-center text-xs text-ink-subtle">
        {{ $t('reel.noPoints') }}
      </p>
    </div>
  </div>
</template>
