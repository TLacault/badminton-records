<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const client = useSupabaseClient<Database>()
const { data: matches } = await useAsyncData('admin-matches', async () => {
  const { data } = await client
    .from('matches')
    .select('id, title, played_on, format, status')
    .order('played_on', { ascending: false, nullsFirst: false })
  return data ?? []
})
</script>

<template>
  <h1 class="text-2xl font-bold">
    Matches
  </h1>
  <ul class="mt-6 divide-y divide-slate-800">
    <li v-for="m in matches" :key="m.id" class="flex items-center gap-4 py-3">
      <span
        class="rounded px-2 py-0.5 text-xs"
        :class="m.status === 'published' ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-400'"
      >{{ m.status }}</span>
      <NuxtLink :to="`/admin/matches/${m.id}`" class="font-medium hover:underline">
        {{ m.title }}
      </NuxtLink>
      <span class="text-sm text-slate-500">{{ m.played_on }} · {{ m.format }}</span>
      <NuxtLink
        :to="`/admin/matches/${m.id}/tag`"
        class="ml-auto rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
      >
        Tag
      </NuxtLink>
    </li>
  </ul>
  <p v-if="!matches?.length" data-testid="no-matches" class="mt-6 text-slate-400">
    No matches yet.
  </p>
</template>
