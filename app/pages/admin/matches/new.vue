<script setup lang="ts">
import { ArrowLeft, Plus } from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin' })
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <NuxtLink
      to="/admin"
      class="flex w-fit min-h-9 items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-200 hover:text-accent"
    >
      <ArrowLeft :size="14" aria-hidden="true" />
      Videos
    </NuxtLink>

    <p class="eyebrow mt-4">
      <Plus :size="15" aria-hidden="true" />
      New
    </p>
    <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
      New match
    </h1>

    <MatchForm class="mt-8" :match-id="null" />
  </div>
</template>
