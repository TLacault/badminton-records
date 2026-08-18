<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ListRow } from '~/utils/videoFilters'
import { CircleCheck, CircleDashed, Clapperboard, Eye, EyeOff, MapPin, RefreshCw, SlidersHorizontal, Timer, TriangleAlert, Video } from '@lucide/vue'
import { disciplineCode, LIST_SELECT } from '~/utils/matchSummary'
import { groupBySession } from '~/utils/sessions'
import { applyFilters, decorate, emptyFilters } from '~/utils/videoFilters'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const client = useSupabaseClient<Database>()

type AdminMatch = ListRow & {
  visibility: string
  youtube_video_id: string | null
}

const { data: matches, refresh } = await useAsyncData('admin-matches', async () => {
  const { data } = await client
    .from('matches')
    .select(`${LIST_SELECT}, visibility, youtube_video_id`)
    .order('played_on', { ascending: false, nullsFirst: false })
  return (data ?? []) as unknown as AdminMatch[]
}, {
  // Rows are toggled in place — publish, tagging status — and a shallow ref
  // (the Nuxt default) would not notice a property changing on one of them.
  deep: true,
})

const filters = ref(emptyFilters())
const entries = computed(() => decorate(matches.value ?? []))
const filtered = computed(() => applyFilters(entries.value, filters.value))

/**
 * The same evenings the public library shows. An admin scanning for "the
 * Tuesday I have not tagged yet" is looking for a session, not a row, and the
 * query already comes back ordered by date so this is one pass.
 */
const sessions = computed(() => groupBySession(filtered.value, entry => entry.row))

const CHIP = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em]'

/** Header summary. Cheap to derive and the only place the two flags are ever
 *  visible as totals rather than per row. */
const counts = computed(() => {
  const rows = matches.value ?? []
  return {
    total: rows.length,
    tagged: rows.filter(m => m.tagging_status === 'tagged').length,
    published: rows.filter(m => m.visibility === 'public').length,
  }
})

const importing = ref(false)
const importResult = ref<string | null>(null)
const importError = ref<string | null>(null)

async function importFromYouTube() {
  importing.value = true
  importResult.value = null
  importError.value = null
  try {
    const res = await $fetch('/api/youtube/import', { method: 'POST' })
    importResult.value = res.imported
      ? `Imported ${res.imported} new video${res.imported === 1 ? '' : 's'} (${res.skipped} already known).`
      : `No new videos — all ${res.found} are already imported.`
    await refresh()
  }
  catch (cause) {
    const err = cause as { statusMessage?: string, message?: string }
    importError.value = err.statusMessage ?? err.message ?? 'Import failed'
  }
  finally {
    importing.value = false
  }
}

/** Optimistic: flip locally, roll back if the write is rejected. */
async function toggleVisibility(id: string, current: string) {
  const next = current === 'public' ? 'private' : 'public'
  const row = matches.value?.find(m => m.id === id)
  if (row) row.visibility = next
  const { error } = await client.from('matches').update({ visibility: next }).eq('id', id)
  if (error) {
    if (row) row.visibility = current
    importError.value = error.message
  }
}

/**
 * Tagging status straight from the list. It is normally written by the tagger
 * as work progresses; this is the same correction the edit form offers, one
 * screen earlier.
 */
async function setTaggingStatus(id: string, next: string) {
  const row = matches.value?.find(m => m.id === id)
  const previous = row?.tagging_status
  if (row) row.tagging_status = next
  const { error } = await client.from('matches').update({ tagging_status: next }).eq('id', id)
  if (error) {
    if (row && previous) row.tagging_status = previous
    importError.value = error.message
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">
          <Video :size="15" aria-hidden="true" />
          Library
        </p>
        <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
          Videos
        </h1>
        <p class="mt-2 text-sm text-ink-muted">
          <span class="tabular-nums">{{ counts.total }}</span> imported ·
          <span class="tabular-nums">{{ counts.tagged }}</span> edited ·
          <span class="tabular-nums">{{ counts.published }}</span> published
        </p>
      </div>

      <button
        data-testid="yt-import"
        :disabled="importing"
        class="btn btn-ghost"
        @click="importFromYouTube"
      >
        <RefreshCw :size="15" :class="importing ? 'animate-spin' : ''" aria-hidden="true" />
        {{ importing ? 'Importing…' : 'Import from YouTube' }}
      </button>
    </div>

    <p
      v-if="importResult"
      data-testid="yt-import-result"
      role="status"
      class="mt-5 flex items-start gap-2 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-muted"
    >
      <CircleCheck :size="16" class="mt-px shrink-0 text-accent" aria-hidden="true" />
      {{ importResult }}
    </p>
    <p
      v-if="importError"
      data-testid="yt-import-error"
      role="alert"
      class="mt-5 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent"
    >
      <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
      {{ importError }}
    </p>

    <VideoFilterBar
      v-model="filters"
      class="mt-8"
      :entries="entries"
      :result-count="filtered.length"
      show-status
    />

    <div class="mt-4 flex flex-col gap-8">
      <section
        v-for="(session, s) in sessions"
        :key="session.date ?? `undated-${s}`"
        data-testid="admin-session"
      >
        <!-- Sticky, like the public library: on a long evening the date stays
             overhead while you scan. Offset by the admin header's height. -->
        <header class="sticky top-14 z-10 -mx-2 mb-3 border-b border-line bg-bg/85 px-2 py-2 backdrop-blur-xl">
          <h2 class="font-display text-lg font-bold uppercase tracking-wide text-ink">
            {{ formatDateLong(session.date) }}
          </h2>
          <ul class="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <li class="inline-flex items-center gap-1.5">
              <Clapperboard :size="12" class="text-accent" aria-hidden="true" />
              {{ session.matches.length }} {{ session.matches.length === 1 ? 'match' : 'matches' }}
            </li>
            <li v-if="session.totalSeconds" class="inline-flex items-center gap-1.5">
              <Timer :size="12" class="text-accent" aria-hidden="true" />
              <span class="tabular-nums">{{ formatSpan(session.totalSeconds) }}</span>
            </li>
            <li v-if="session.venue" class="inline-flex items-center gap-1.5">
              <MapPin :size="12" class="text-accent" aria-hidden="true" />
              {{ session.venue }}
            </li>
          </ul>
        </header>

        <ul class="flex flex-col gap-2.5">
          <li
            v-for="{ row: m, title, outcome, typeLabel } in session.matches"
            :key="m.id"
            :data-match-id="m.id"
            class="relative flex flex-wrap items-center gap-4 rounded-2xl p-3 glass transition-[border-color] duration-200 hover:border-accent/30"
          >
            <!--
              The whole row opens the tagger — the work this page exists for,
              and the reason a row is here at all. A stretched link rather than
              wrapping the row in an anchor, because the row also holds buttons
              and selects, and an anchor cannot contain them.
            -->
            <NuxtLink
              :to="`/admin/matches/${m.id}/tag`"
              class="absolute inset-0 rounded-2xl"
              :aria-label="`Tag ${title}`"
            />

            <div class="relative w-32 shrink-0 overflow-hidden rounded-xl border border-line bg-bg-deep">
              <img
                v-if="m.youtube_thumbnail_url"
                :src="m.youtube_thumbnail_url"
                alt=""
                width="1280"
                height="720"
                loading="lazy"
                decoding="async"
                class="aspect-video w-full object-cover"
              >
              <div v-else class="grid aspect-video w-full place-items-center text-ink-subtle">
                <CircleDashed :size="18" aria-hidden="true" />
              </div>
              <span
                v-if="m.youtube_duration_seconds"
                class="absolute bottom-1 right-1 rounded bg-black/80 px-1 font-mono text-[10px] tabular-nums text-white"
              >{{ formatDuration(m.youtube_duration_seconds) }}</span>
            </div>

            <div class="pointer-events-none min-w-0 flex-1 basis-64">
              <!-- The fixture from the roster, not the YouTube upload name. -->
              <p class="truncate font-display text-lg font-semibold uppercase tracking-wide text-ink">
                {{ title }}
              </p>
              <!-- No date and no venue: the session header above carries both
                   for the whole evening, and repeating them per row printed a
                   dash on every match that has neither. -->
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <VideoStatusBadge :visibility="m.visibility" />
                <span v-if="typeLabel" :class="CHIP" class="border-line text-ink-muted">{{ typeLabel }}</span>
                <span :class="CHIP" class="border-line text-ink-muted">{{ disciplineCode(m.format) }}</span>
                <span
                  v-if="outcome"
                  :class="[CHIP, outcome.state === 'won'
                    ? 'border-transparent bg-brand text-on-brand'
                    : outcome.state === 'lost'
                      ? 'border-line-strong text-ink-muted'
                      : 'border-dashed border-line text-ink-subtle']"
                ><span class="tabular-nums">{{ outcome.scoreLabel }}</span></span>
              </div>
            </div>

            <!-- Controls sit above the stretched link so they stay clickable. -->
            <div class="relative flex shrink-0 items-center gap-2">
              <VideoTaggingStatusPicker
                data-testid="row-tagging-status"
                :label="`Editing state for ${title}`"
                :model-value="m.tagging_status"
                @update:model-value="value => setTaggingStatus(m.id, value)"
              />

              <!-- The public link, not the admin one: what you send someone is
                   the page they can actually open. -->
              <UiShareButton
                :to="`/matches/${m.id}`"
                class="btn btn-sm btn-ghost !px-2.5"
              />

              <button
                data-testid="toggle-visibility"
                class="btn btn-sm btn-ghost"
                :title="m.visibility === 'public' ? 'Make private' : 'Make public'"
                @click="toggleVisibility(m.id, m.visibility)"
              >
                <component :is="m.visibility === 'public' ? EyeOff : Eye" :size="14" aria-hidden="true" />
                {{ m.visibility === 'public' ? 'Unpublish' : 'Publish' }}
              </button>

              <!-- Who played, which format, how it is scored: the once-per-match
                   setup, kept out of the way of the tagging the row leads to. -->
              <NuxtLink :to="`/admin/matches/${m.id}`" class="btn btn-sm btn-ghost">
                <SlidersHorizontal :size="14" aria-hidden="true" />
                Setup
              </NuxtLink>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <p
      v-if="matches?.length && !filtered.length"
      class="mt-4 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-muted"
    >
      No match answers to that.
    </p>

    <div
      v-if="!matches?.length"
      data-testid="no-matches"
      class="mt-8 rounded-2xl border border-dashed border-line px-6 py-16 text-center"
    >
      <Video :size="30" class="mx-auto text-ink-subtle" aria-hidden="true" />
      <p class="mt-4 font-display text-xl font-semibold uppercase tracking-wide text-ink">
        No videos yet
      </p>
      <p class="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        Pull the channel's uploads in — it only ever adds video ids you do not already hold.
      </p>
      <button :disabled="importing" class="btn btn-primary mt-6" @click="importFromYouTube">
        <RefreshCw :size="15" :class="importing ? 'animate-spin' : ''" aria-hidden="true" />
        Import from YouTube
      </button>
    </div>
  </div>
</template>
