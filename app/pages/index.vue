<script setup lang="ts">
import type { Database } from '~/types/database.types'

const client = useSupabaseClient<Database>()
const { data: matches } = await useAsyncData('public-matches', async () => {
  // RLS already hides private rows; the explicit filter keeps the intent
  // legible and lets the index on (visibility, played_on) do the work.
  const { data } = await client
    .from('matches')
    .select('id, title, played_on, venue, format, tagging_status, youtube_thumbnail_url, youtube_duration_seconds')
    .eq('visibility', 'public')
    .order('played_on', { ascending: false, nullsFirst: false })
  return data ?? []
})
</script>

<template>
  <h1 class="text-2xl font-bold">
    Videos
  </h1>

  <ul data-testid="public-matches" class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
    <li v-for="m in matches" :key="m.id">
      <NuxtLink :to="`/matches/${m.id}`" class="group block">
        <div class="relative overflow-hidden rounded bg-slate-900">
          <img
            v-if="m.youtube_thumbnail_url"
            :src="m.youtube_thumbnail_url"
            alt=""
            class="aspect-video w-full object-cover transition group-hover:opacity-90"
          >
          <div v-else class="aspect-video w-full" />
          <span
            v-if="m.youtube_duration_seconds"
            class="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 text-xs tabular-nums text-slate-200"
          >{{ formatDuration(m.youtube_duration_seconds) }}</span>
        </div>
        <h2 class="mt-2 font-semibold leading-snug group-hover:underline">
          {{ m.title }}
        </h2>
        <p class="mt-1 text-sm text-slate-400">
          {{ formatDate(m.played_on) }} · {{ m.format }}{{ m.venue ? ` · ${m.venue}` : '' }}
        </p>
      </NuxtLink>
    </li>
  </ul>

  <p v-if="!matches?.length" data-testid="public-empty" class="mt-6 text-slate-400">
    Nothing published yet.
  </p>
</template>
