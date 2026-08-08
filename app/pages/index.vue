<script setup lang="ts">
import type { Database } from '~/types/database.types'

const client = useSupabaseClient<Database>()
const { data: matches } = await useAsyncData('published-matches', async () => {
  const { data } = await client
    .from('matches')
    .select('id, title, played_on, venue, format')
    .eq('status', 'published')
    .order('played_on', { ascending: false, nullsFirst: false })
  return data ?? []
})
</script>

<template>
  <h1 class="text-2xl font-bold">
    Matches
  </h1>
  <ul data-testid="public-matches" class="mt-6 space-y-3">
    <li v-for="m in matches" :key="m.id" class="rounded border border-slate-800 p-4 hover:border-slate-700">
      <NuxtLink :to="`/matches/${m.id}`" class="font-semibold hover:underline">
        {{ m.title }}
      </NuxtLink>
      <p class="mt-1 text-sm text-slate-400">
        {{ m.played_on || 'Date unknown' }} · {{ m.format }}{{ m.venue ? ` · ${m.venue}` : '' }}
      </p>
    </li>
  </ul>
  <p v-if="!matches?.length" data-testid="public-empty" class="mt-6 text-slate-400">
    Nothing published yet.
  </p>
</template>
