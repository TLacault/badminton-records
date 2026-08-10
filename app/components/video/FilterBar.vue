<script setup lang="ts">
import type { Component } from 'vue'
import type { ListRow, MatchEntry, VideoFilters } from '~/utils/videoFilters'
import {
  CalendarArrowDown,
  CalendarArrowUp,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  Hourglass,
  Layers,
  Loader,
  Search,
  Star,
  Tags,
  Target,
  Timer,
  TrendingDown,
  Trophy,
  User,
  Users,
  X,
} from '@lucide/vue'
import {
  emptyFilters,
  FORMATS,
  isFiltered,
  RESULTS,
  SORTS,
  STATUSES,
  suggestionsFor,
  typesIn,
} from '~/utils/videoFilters'

const props = withDefaults(
  defineProps<{
    /** The unfiltered list, used to build the autocomplete and the type list. */
    entries: MatchEntry<ListRow>[]
    /** Result count after filtering, printed on the bar. */
    resultCount: number
    /** Tagging-status filter. Admin only — guests see one library. */
    showStatus?: boolean
  }>(),
  { showStatus: false },
)

const filters = defineModel<VideoFilters>({ required: true })

/** Collapsed until asked for: most visits are a scroll, not a search. */
const open = ref(false)

/**
 * Icons per option, kept beside the vocabulary rather than inside it: the
 * filter lists are shared with plain data consumers that have no use for a
 * component reference.
 */
const SORT_ICONS: Record<string, Component> = {
  newest: CalendarArrowDown,
  oldest: CalendarArrowUp,
  longest: Timer,
  shortest: Hourglass,
  points: Target,
}
const RESULT_ICONS: Record<string, Component> = {
  all: Layers,
  won: Trophy,
  lost: TrendingDown,
  unfinished: CircleDashed,
}
const FORMAT_ICONS: Record<string, Component> = {
  all: Layers,
  doubles: Users,
  singles: User,
}
const STATUS_ICONS: Record<string, Component> = {
  all: Layers,
  tagged: CircleCheck,
  in_progress: Loader,
  untagged: CircleDashed,
}

const sortOptions = computed(() => SORTS.map(s => ({ ...s, value: s.id, icon: SORT_ICONS[s.id] })))
const resultOptions = computed(() => RESULTS.map(r => ({ ...r, value: r.id, icon: RESULT_ICONS[r.id] })))
const formatOptions = computed(() => FORMATS.map(f => ({ ...f, value: f.id, icon: FORMAT_ICONS[f.id] })))
const statusOptions = computed(() => STATUSES.map(s => ({ ...s, value: s.id, icon: STATUS_ICONS[s.id] })))
const typeOptions = computed(() => [
  { value: 'all', label: 'Any type', icon: Layers },
  ...types.value.map(t => ({ value: t, label: t, icon: Tags })),
])

const suggestions = computed(() => suggestionsFor(props.entries))
const types = computed(() => typesIn(props.entries))
const active = computed(() => isFiltered(filters.value))

function reset() {
  filters.value = emptyFilters()
}
</script>

<template>
  <section class="overflow-hidden rounded-2xl glass">
    <div class="flex items-center gap-2 px-4 py-2.5">
      <button
        type="button"
        data-testid="filters-toggle"
        class="flex min-h-9 flex-1 items-center gap-2 text-left"
        :aria-expanded="open"
        aria-controls="video-filters"
        @click="open = !open"
      >
        <Search :size="15" class="shrink-0 text-accent" aria-hidden="true" />
        <span class="label !text-ink">Find a match</span>
        <span v-if="active" class="text-xs tabular-nums text-ink-muted">
          {{ resultCount }} shown
        </span>
        <ChevronDown
          :size="15"
          class="ml-auto shrink-0 text-ink-subtle transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>

      <button
        v-if="active"
        type="button"
        data-testid="filters-reset"
        class="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-ink-subtle transition-colors duration-200 hover:text-accent"
        @click="reset"
      >
        <X :size="13" aria-hidden="true" />
        {{ $t('filters.clear') }}
      </button>
    </div>

    <div v-show="open" id="video-filters" class="border-t border-line px-4 py-4">
      <label class="block">
        <span class="label">Player, club, type, venue</span>
        <input
          v-model="filters.query"
          data-testid="filters-query"
          type="search"
          list="video-filter-suggestions"
          placeholder="Tim Lacault"
          class="field mt-2"
        >
        <!-- Native autocomplete: it stays keyboard-accessible and needs no
             popup of our own to get right. -->
        <datalist id="video-filter-suggestions">
          <option v-for="s in suggestions" :key="s" :value="s" />
        </datalist>
      </label>

      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div data-testid="filters-sort">
          <span class="label">Sort by</span>
          <UiSelect v-model="filters.sort" class="mt-2" :label="$t('filters.sortBy')" :options="sortOptions" />
        </div>

        <div data-testid="filters-result">
          <span class="label">Result</span>
          <UiSelect v-model="filters.result" class="mt-2" :label="$t('filters.result')" :options="resultOptions" />
        </div>

        <div data-testid="filters-format">
          <span class="label">Format</span>
          <UiSelect v-model="filters.format" class="mt-2" :label="$t('filters.format')" :options="formatOptions" />
        </div>

        <!-- Only offered when the library actually holds more than one type. -->
        <div v-if="types.length > 1" data-testid="filters-type">
          <span class="label">Type</span>
          <UiSelect v-model="filters.type" class="mt-2" :label="$t('filters.type')" :options="typeOptions" />
        </div>

        <div v-if="showStatus" data-testid="filters-status">
          <span class="label">Tagging</span>
          <UiSelect v-model="filters.status" class="mt-2" :label="$t('filters.tagging')" :options="statusOptions" />
        </div>
      </div>

      <label class="mt-4 inline-flex items-center gap-2 text-sm text-ink-muted">
        <input
          v-model="filters.highlightsOnly"
          data-testid="filters-highlights"
          type="checkbox"
          class="size-4 accent-[var(--ui-brand)]"
        >
        <Star :size="13" class="text-accent" aria-hidden="true" />
        {{ $t('filters.highlightsOnly') }}
      </label>
    </div>
  </section>
</template>
