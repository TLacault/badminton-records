<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ListRow } from '~/utils/videoFilters'
import { Film, Search, Star } from '@lucide/vue'
import { deriveRow } from '~/utils/matchSummary'
import { LIST_SELECT } from '~/utils/matchSummary'
import { decorate } from '~/utils/videoFilters'

/**
 * Which match to cut from.
 *
 * Sorted by how much there is to cut rather than by date: a match with
 * fourteen highlights tagged is a reel waiting to happen, and one with none is
 * an evening's work first. Untagged matches are listed anyway — the clips can
 * be dragged out by hand — but they sit under everything that is ready.
 */

const emit = defineEmits<{ pick: [entry: { id: string, videoId: string, title: string }] }>()

const client = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { data: rows } = await useAsyncData('reel-matches', async () => {
  // The video id is not in LIST_SELECT — every other list in the app names a
  // match rather than plays it — and it is the one field this page cannot do
  // without, since it is what the source video is fetched and cached by.
  const query = client
    .from('matches')
    .select(`${LIST_SELECT}, youtube_video_id`)
    .not('youtube_video_id', 'is', null)
    .order('played_on', { ascending: false, nullsFirst: false })

  // Signed in, the row-level policies decide what comes back; anonymously the
  // public wall's own filter is the one to match.
  const { data } = await (user.value ? query : query.eq('visibility', 'public'))
  return (data ?? []) as unknown as (ListRow & { youtube_video_id: string })[]
})

const query = ref('')

const entries = computed(() =>
  decorate(rows.value ?? []).map((entry) => {
    const derived = deriveRow(entry.row)
    return {
      ...entry,
      highlights: derived?.rallyStates.filter(s => s.isHighlight).length ?? 0,
      videoId: (entry.row as { youtube_video_id: string }).youtube_video_id,
    }
  }),
)

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  const list = needle
    ? entries.value.filter(e => e.haystack.includes(needle))
    : entries.value
  return [...list].sort((a, b) => b.highlights - a.highlights)
})

const { bcp47, t } = useI18n()
</script>

<template>
  <div>
    <label class="relative block">
      <Search
        :size="16"
        class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
      <input
        v-model="query"
        type="search"
        class="field pl-10"
        :placeholder="$t('reel.searchMatches')"
        :aria-label="$t('reel.searchMatches')"
      >
    </label>

    <ul class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="entry in filtered" :key="entry.row.id">
        <button
          type="button"
          data-testid="reel-match-option"
          class="group flex w-full items-start gap-3 rounded-xl border border-line bg-panel p-3 text-left transition-colors duration-200 ease-brand hover:border-accent/50"
          @click="emit('pick', { id: entry.row.id, videoId: entry.videoId, title: entry.title })"
        >
          <div class="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-bg-deep">
            <img
              v-if="entry.row.youtube_thumbnail_url"
              :src="entry.row.youtube_thumbnail_url"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            >
            <Film v-else :size="18" class="absolute inset-0 m-auto text-ink-subtle" aria-hidden="true" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate font-display text-sm font-semibold text-ink group-hover:text-accent">
              {{ entry.title }}
            </p>
            <p class="mt-0.5 truncate text-xs text-ink-subtle">
              {{ formatDateShort(entry.row.played_on, bcp47, t('common.undated')) }}
              <template v-if="entry.row.venue"> · {{ entry.row.venue }}</template>
            </p>
            <p
              class="mt-1.5 inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.1em]"
              :class="entry.highlights ? 'text-accent' : 'text-ink-subtle'"
            >
              <Star
                :size="12"
                :class="entry.highlights ? 'fill-accent' : ''"
                aria-hidden="true"
              />
              {{ $t('reel.highlightCount', { n: entry.highlights }) }}
            </p>
          </div>
        </button>
      </li>
    </ul>

    <p v-if="!filtered.length" class="mt-8 text-center text-sm text-ink-subtle">
      {{ $t('reel.noMatches') }}
    </p>
  </div>
</template>
