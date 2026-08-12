<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ListRow } from '~/utils/videoFilters'
import { Clapperboard, MapPin, Timer, Video } from '@lucide/vue'
import { LIST_SELECT } from '~/utils/matchSummary'
import { applyFilters, decorate, emptyFilters, isFiltered } from '~/utils/videoFilters'

const { t, bcp47 } = useI18n()

const client = useSupabaseClient<Database>()

const { data: matches } = await useAsyncData('public-matches', async () => {
  const { data } = await client
    .from('matches')
    .select(LIST_SELECT)
    .eq('visibility', 'public')
    .order('played_on', { ascending: false, nullsFirst: false })
  return (data ?? []) as unknown as ListRow[]
})

const filters = ref(emptyFilters())
// Decorated once — the scoring engine runs per match — then filtered.
const entries = computed(() => decorate(matches.value ?? []))
const filtered = computed(() => applyFilters(entries.value, filters.value))

/**
 * Sessions are the default shape — an evening is watched as an evening. Once
 * you search or re-sort, that grouping is exactly what you asked to break, so
 * the results come back as one flat list.
 */
const searching = computed(() => isFiltered(filters.value))
const sessions = computed(() => groupBySession(filtered.value, entry => entry.row))

useSeoMeta({
  title: () => t('videos.seoTitle'),
  description: () => t('videos.lede'),
})
</script>

<template>
  <div>
    <UiReveal>
      <UiSectionHeading
        :eyebrow="$t('videos.eyebrow')"
        :icon="Video"
        level="h1"
        title="Videos"
        :lede="$t('videos.lede')"
      />
    </UiReveal>

    <VideoFilterBar
      v-model="filters"
      class="mt-10"
      :entries="entries"
      :result-count="filtered.length"
    />

    <ul v-if="searching" data-testid="public-results" class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="entry in filtered" :key="entry.row.id">
        <VideoMatchCard :entry="entry" />
      </li>
    </ul>

    <div v-else data-testid="public-matches" class="mt-14 flex flex-col gap-16">
      <section v-for="(session, s) in sessions" :key="session.date ?? `undated-${s}`">
        <UiReveal>
          <!-- Sticky so the date stays overhead while you scan a long session,
               offset by the header height so the two never overlap. -->
          <header class="sticky top-16 z-10 -mx-4 mb-6 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl sm:top-18 sm:-mx-6 sm:px-6">
            <h2 class="font-display text-2xl font-bold uppercase tracking-wide text-ink sm:text-3xl">
              {{ formatDateLong(session.date, bcp47, $t('common.undated')) }}
            </h2>
            <ul class="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-muted">
              <li class="inline-flex items-center gap-1.5">
                <Clapperboard :size="13" class="text-accent" aria-hidden="true" />
                {{ session.matches.length }} {{ session.matches.length === 1 ? 'match' : 'matches' }}
              </li>
              <li v-if="session.totalSeconds" class="inline-flex items-center gap-1.5">
                <Timer :size="13" class="text-accent" aria-hidden="true" />
                <span class="tabular-nums">{{ formatSpan(session.totalSeconds) }}</span>
              </li>
              <li v-if="session.venue" class="inline-flex items-center gap-1.5">
                <MapPin :size="13" class="text-accent" aria-hidden="true" />
                {{ session.venue }}
              </li>
            </ul>
          </header>
        </UiReveal>

        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UiReveal
            v-for="(entry, i) in session.matches"
            :key="entry.row.id"
            as="li"
            :delay="i * 40"
          >
            <VideoMatchCard :entry="entry" />
          </UiReveal>
        </ul>
      </section>
    </div>

    <p
      v-if="!filtered.length"
      data-testid="public-empty"
      class="mt-14 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-ink-muted"
    >
      {{ searching ? 'No match answers to that.' : 'Nothing published yet.' }}
    </p>
  </div>
</template>
