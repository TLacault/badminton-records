<script setup lang="ts">
import type { Database } from '~/types/database.types'
import { Eye, EyeOff, RefreshCw } from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const client = useSupabaseClient<Database>()

const { data: matches, refresh } = await useAsyncData('admin-matches', async () => {
  const { data } = await client
    .from('matches')
    .select('id, title, played_on, format, visibility, tagging_status, youtube_video_id, youtube_thumbnail_url, youtube_duration_seconds')
    .order('played_on', { ascending: false, nullsFirst: false })
  return data ?? []
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
</script>

<template>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">
      Videos
    </h1>
    <button
      data-testid="yt-import"
      :disabled="importing"
      class="inline-flex items-center gap-2 rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
      @click="importFromYouTube"
    >
      <RefreshCw :size="14" :class="importing ? 'animate-spin' : ''" />
      {{ importing ? 'Importing…' : 'Import / refresh from YouTube' }}
    </button>
  </div>

  <p v-if="importResult" data-testid="yt-import-result" class="mt-3 rounded bg-slate-900 px-3 py-2 text-sm text-slate-300">
    {{ importResult }}
  </p>
  <p v-if="importError" data-testid="yt-import-error" class="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">
    {{ importError }}
  </p>

  <ul class="mt-6 divide-y divide-slate-800">
    <li v-for="m in matches" :key="m.id" class="flex items-center gap-4 py-3" :data-match-id="m.id">
      <div class="relative w-32 shrink-0 overflow-hidden rounded bg-slate-900">
        <img
          v-if="m.youtube_thumbnail_url"
          :src="m.youtube_thumbnail_url"
          alt=""
          class="aspect-video w-full object-cover"
        >
        <div v-else class="aspect-video w-full" />
        <span
          v-if="m.youtube_duration_seconds"
          class="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] tabular-nums text-slate-200"
        >{{ formatDuration(m.youtube_duration_seconds) }}</span>
      </div>

      <div class="min-w-0 flex-1">
        <NuxtLink :to="`/admin/matches/${m.id}`" class="block truncate font-medium hover:underline">
          {{ m.title }}
        </NuxtLink>
        <p class="mt-1 text-sm text-slate-500">
          {{ formatDate(m.played_on) }} · {{ m.format }}
        </p>
        <VideoStatusBadge
          class="mt-1.5"
          :tagging-status="m.tagging_status"
          :visibility="m.visibility"
        />
      </div>

      <button
        data-testid="toggle-visibility"
        class="inline-flex shrink-0 items-center gap-1.5 rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
        :title="m.visibility === 'public' ? 'Make private' : 'Make public'"
        @click="toggleVisibility(m.id, m.visibility)"
      >
        <component :is="m.visibility === 'public' ? EyeOff : Eye" :size="14" />
        {{ m.visibility === 'public' ? 'Unpublish' : 'Publish' }}
      </button>

      <NuxtLink
        :to="`/admin/matches/${m.id}/tag`"
        class="shrink-0 rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
      >
        Tag
      </NuxtLink>
    </li>
  </ul>

  <p v-if="!matches?.length" data-testid="no-matches" class="mt-6 text-slate-400">
    No videos yet — use “Import / refresh from YouTube” to pull them from the channel.
  </p>
</template>
