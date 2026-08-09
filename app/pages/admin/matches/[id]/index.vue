<script setup lang="ts">
import { ArrowLeft, Pencil, Tag } from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const route = useRoute()
const id = route.params.id as string
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

    <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">
          <Pencil :size="15" aria-hidden="true" />
          Editing
        </p>
        <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
          Match
        </h1>
      </div>
      <NuxtLink
        data-testid="open-tagger"
        :to="`/admin/matches/${id}/tag`"
        class="btn btn-primary"
      >
        <Tag :size="16" aria-hidden="true" />
        Open tagging tool
      </NuxtLink>
    </div>

    <MatchForm class="mt-8" :match-id="id" />
  </div>
</template>
