<script setup lang="ts">
import { ArrowLeft, Clapperboard, Film, SlidersHorizontal, Smartphone, Sparkles, Tag, Wand2 } from '@lucide/vue'

/**
 * The bar over a match's admin pages, kept in the layout so it never reloads.
 *
 * Left, what has been made: the four videos of the match (the raw recording
 * and the three linked to it), each opening its page as the site shows it;
 * one not made yet is greyed out. Then Setup, for the video in view.
 * Right, what makes them: the four tools, which all work on the raw.
 */
type Tool = 'view' | 'tag' | 'publish' | 'highlights' | 'shorts' | 'setup'
const props = defineProps<{ matchId: string, current: Tool }>()

const client = useSupabaseClient()
const { data: family } = await useAsyncData(`nav-family-${props.matchId}`, async () => {
  const { data: self } = await client.from('matches').select('id, source_match_id').eq('id', props.matchId).maybeSingle()
  const rawId = (self as { source_match_id: string | null } | null)?.source_match_id ?? props.matchId
  const { data } = await client.from('matches').select('id, video_kind').or(`id.eq.${rawId},source_match_id.eq.${rawId}`)
  return { rawId, videos: (data ?? []) as { id: string, video_kind: string }[] }
}, { watch: [() => props.matchId] })

const rawId = computed(() => family.value?.rawId ?? props.matchId)

const MADE = [
  { kind: 'raw', label: 'Raw', icon: Film },
  { kind: 'match', label: 'YouTube', icon: Clapperboard },
  { kind: 'highlights', label: 'Highlights', icon: Sparkles },
  { kind: 'shorts', label: 'Shorts', icon: Smartphone },
] as const

const made = computed(() => MADE.map(m => ({ ...m, id: family.value?.videos.find(v => v.video_kind === m.kind)?.id ?? null })))

const CREATE = [
  { id: 'tag', label: 'Tag', icon: Tag, path: '/tag' },
  { id: 'publish', label: 'YouTube', icon: Clapperboard, path: '/publish' },
  { id: 'highlights', label: 'Highlights', icon: Sparkles, path: '/highlights' },
  { id: 'shorts', label: 'Shorts', icon: Smartphone, path: '/shorts' },
] as const

const TAB = 'flex min-h-8 items-center gap-1.5 rounded-lg px-3 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200'
const on = 'bg-brand text-on-brand'
const off = 'text-ink-muted hover:text-ink'
</script>

<template>
  <nav
    aria-label="Match"
    class="z-30 -mx-2 mb-4 flex flex-wrap items-center gap-3 border-b border-line bg-bg/85 px-2 py-2 backdrop-blur-xl lg:sticky lg:top-14"
  >
    <NuxtLink
      to="/admin"
      class="flex min-h-9 items-center gap-2 rounded-lg font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle transition-colors duration-200 hover:text-accent"
    >
      <ArrowLeft :size="14" aria-hidden="true" />
      Videos
    </NuxtLink>

    <div class="flex gap-1 rounded-xl border border-line bg-bg-deep p-1" role="group" aria-label="Videos of this match">
      <template v-for="v in made" :key="v.kind">
        <NuxtLink
          v-if="v.id"
          :to="`/admin/matches/${v.id}`"
          :aria-current="current === 'view' && v.id === matchId ? 'page' : undefined"
          :class="[TAB, current === 'view' && v.id === matchId ? on : off]"
        >
          <component :is="v.icon" :size="14" aria-hidden="true" />
          {{ v.label }}
        </NuxtLink>
        <span v-else :class="TAB" class="cursor-not-allowed text-ink-subtle/40" :title="`No ${v.label} video linked yet`">
          <component :is="v.icon" :size="14" aria-hidden="true" />
          {{ v.label }}
        </span>
      </template>
    </div>

    <NuxtLink
      :to="`/admin/matches/${matchId}/setup`"
      :aria-current="current === 'setup' ? 'page' : undefined"
      class="rounded-xl border border-line p-1"
      title="Setup of this video"
    >
      <span :class="[TAB, current === 'setup' ? on : off]">
        <SlidersHorizontal :size="14" aria-hidden="true" />
        Setup
      </span>
    </NuxtLink>

    <div class="ml-auto flex items-center gap-3">
      <span class="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">
        <Wand2 :size="14" aria-hidden="true" />
        Create
      </span>
      <div class="flex gap-1 rounded-xl border border-line bg-bg-deep p-1" role="group" aria-label="Create from the raw recording">
        <NuxtLink
          v-for="tool in CREATE"
          :key="tool.id"
          :to="`/admin/matches/${rawId}${tool.path}`"
          :aria-current="tool.id === current ? 'page' : undefined"
          :class="[TAB, tool.id === current ? on : off]"
        >
          <component :is="tool.icon" :size="14" aria-hidden="true" />
          {{ tool.label }}
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>
