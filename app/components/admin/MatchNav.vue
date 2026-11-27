<script setup lang="ts">
import { ArrowLeft, Clapperboard, SlidersHorizontal, Smartphone, Tag } from '@lucide/vue'

/**
 * One bar for a match's four tools, the same on each: back to the library on
 * the left, the tools as tabs. Pinned under the admin header on a desktop so a
 * switch is always one click away; it scrolls away on a phone, where the
 * tagger pins its video instead.
 */
const props = defineProps<{
  matchId: string
  current: 'tag' | 'publish' | 'clip' | 'setup'
}>()

const TOOLS = [
  { id: 'tag', label: 'Tag', icon: Tag, path: '/tag' },
  { id: 'publish', label: 'YouTube', icon: Clapperboard, path: '/publish' },
  { id: 'clip', label: 'Clip', icon: Smartphone, path: '/clip' },
  { id: 'setup', label: 'Setup', icon: SlidersHorizontal, path: '' },
] as const
</script>

<template>
  <nav
    aria-label="Match tools"
    class="z-30 -mx-2 mb-4 flex flex-wrap items-center gap-3 border-b border-line bg-bg/85 px-2 py-2 backdrop-blur-xl lg:sticky lg:top-14"
  >
    <NuxtLink
      to="/admin"
      class="flex min-h-9 items-center gap-2 rounded-lg font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-200 hover:text-accent"
    >
      <ArrowLeft :size="14" aria-hidden="true" />
      Videos
    </NuxtLink>
    <div class="flex gap-1 rounded-xl border border-line bg-bg-deep p-1">
      <NuxtLink
        v-for="tool in TOOLS"
        :key="tool.id"
        :to="`/admin/matches/${props.matchId}${tool.path}`"
        :aria-current="tool.id === props.current ? 'page' : undefined"
        class="flex min-h-8 items-center gap-1.5 rounded-lg px-3 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200"
        :class="tool.id === props.current ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'"
      >
        <component :is="tool.icon" :size="14" aria-hidden="true" />
        {{ tool.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
