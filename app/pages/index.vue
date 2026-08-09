<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ListRow } from '~/utils/videoFilters'
import { site } from '~/config/site'
import { LIST_SELECT } from '~/utils/matchSummary'
import { decorate } from '~/utils/videoFilters'

// The hero bleeds edge to edge, so the layout's measure is applied per section
// on this page instead of once around the whole outlet.
definePageMeta({ bleed: true })

const client = useSupabaseClient<Database>()

const { data: matches } = await useAsyncData('home-matches', async () => {
  // RLS already hides private rows; the explicit filter keeps the intent
  // legible and lets the index on (visibility, played_on) do the work.
  const { data } = await client
    .from('matches')
    .select(LIST_SELECT)
    .eq('visibility', 'public')
    .order('played_on', { ascending: false, nullsFirst: false })
  return (data ?? []) as unknown as ListRow[]
})

const entries = computed(() => decorate(matches.value ?? []))
const sessions = computed(() => groupBySession(entries.value, entry => entry.row))
const latest = computed(() => sessions.value[0] ?? null)

/** Everything but the newest session, capped so the landing page stays a
 *  landing page rather than a second archive. */
const more = computed(() =>
  sessions.value.slice(1).flatMap(session => session.matches).slice(0, 6),
)

/*
 * Measured, not typed in. A hand-maintained "42 sessions" goes stale the week
 * after it is written; these three only ever say what the library actually
 * holds, and the strip disappears on an empty library rather than showing
 * three zeroes.
 */
const heroStats = computed(() => {
  const all = matches.value ?? []
  if (!all.length) return []
  const seconds = all.reduce((sum, m) => sum + (m.youtube_duration_seconds ?? 0), 0)
  return [
    { value: String(sessions.value.length), label: 'Sessions filmed' },
    { value: String(all.length), label: 'Matches online' },
    { value: `${Math.max(1, Math.round(seconds / 3600))}h`, label: 'Of play' },
  ]
})

useSeoMeta({
  title: site.seo.title,
  description: site.seo.description,
  ogTitle: site.seo.title,
  ogDescription: site.seo.description,
  ogType: 'website',
})
</script>

<template>
  <div>
    <HomeHero :stats="heroStats" />

    <div class="mx-auto flex max-w-6xl flex-col gap-24 px-4 py-20 sm:gap-32 sm:px-6 sm:py-28">
      <HomeAbout />
      <HomeGear />
      <HomePartner />
      <HomeLatestSession :session="latest" />
      <HomeMoreVideos :matches="more" />
      <HomeComingSoon />
    </div>
  </div>
</template>
