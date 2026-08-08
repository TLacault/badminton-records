<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })

const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">
      Edit match
    </h1>
    <NuxtLink
      data-testid="open-tagger"
      :to="`/admin/matches/${id}/tag`"
      class="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
    >
      Open tagging tool
    </NuxtLink>
  </div>
  <MatchForm class="mt-6" :match-id="id" />
</template>
