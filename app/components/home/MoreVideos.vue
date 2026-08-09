<script setup lang="ts">
import type { ListRow, MatchEntry } from '~/utils/videoFilters'
import { ArrowRight, Film } from '@lucide/vue'

defineProps<{ matches: MatchEntry<ListRow>[] }>()
</script>

<template>
  <section v-if="matches.length" id="more" class="scroll-mt-28">
    <UiReveal>
      <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <UiSectionHeading
          eyebrow="From the archive"
          :icon="Film"
          title="Other videos"
          lede="Earlier sessions, older opponents, and the matches worth going back to."
        />
        <NuxtLink to="/videos" class="btn btn-ghost btn-sm">
          Browse everything
          <ArrowRight :size="15" aria-hidden="true" />
        </NuxtLink>
      </div>
    </UiReveal>

    <ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiReveal
        v-for="(entry, i) in matches"
        :key="entry.row.id"
        as="li"
        :delay="i * 50"
      >
        <VideoMatchCard :entry="entry" />
      </UiReveal>
    </ul>
  </section>
</template>
