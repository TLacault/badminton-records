<script setup lang="ts">
import type { ListRow, MatchEntry } from '~/utils/videoFilters'
import { ArrowRight, Clapperboard, Film, Smartphone, Sparkles } from '@lucide/vue'

/**
 * "From this match": the other films cut from the same rallies, as banners
 * rather than cards. Cards are what "Up next" offers, a stranger's match; these
 * are the same match told another way, so they get the louder treatment: the
 * still behind, the kind in big type, and a light that sweeps across on hover.
 */
defineProps<{ entries: MatchEntry<ListRow>[], linkBase?: string }>()

const { t } = useI18n()

const ICONS: Record<string, unknown> = { raw: Film, match: Clapperboard, highlights: Sparkles, shorts: Smartphone }
const label = (kind: string) => t(`card.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)
</script>

<template>
  <section class="mt-14">
    <p class="eyebrow">
      <Sparkles :size="15" aria-hidden="true" />
      {{ $t('match.related') }}
    </p>
    <h2 class="mt-2 font-display text-3xl font-bold uppercase leading-none tracking-tight sm:text-4xl">
      {{ $t('match.relatedTitle') }}
    </h2>

    <ul class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <li v-for="entry in entries" :key="entry.row.id">
        <NuxtLink
          :to="`${linkBase ?? '/matches'}/${entry.row.id}`"
          class="group relative flex min-h-36 items-end overflow-hidden rounded-2xl border border-line bg-bg-deep p-5 transition-[border-color,box-shadow,transform] duration-300 ease-brand hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--ui-glow-strong)] focus-visible:border-accent/60"
        >
          <img
            v-if="entry.row.youtube_thumbnail_url"
            :src="entry.row.youtube_thumbnail_url"
            alt=""
            loading="lazy"
            class="absolute inset-0 size-full object-cover opacity-35 transition-[opacity,transform] duration-500 ease-brand group-hover:scale-105 group-hover:opacity-50"
          >
          <span class="absolute inset-0 bg-gradient-to-tr from-black/90 via-black/60 to-transparent" aria-hidden="true" />
          <!-- The edge light: always a thin crimson line on top, brighter on hover. -->
          <span class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
          <!-- The sweep: a soft streak that crosses the banner once on hover. -->
          <span
            class="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[450%] motion-reduce:hidden"
            aria-hidden="true"
          />

          <span class="relative flex w-full items-end justify-between gap-4">
            <span class="min-w-0">
              <span class="flex items-center gap-2.5">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-on-brand" style="box-shadow: var(--ui-glow-soft)">
                  <component :is="ICONS[entry.row.video_kind ?? 'raw']" :size="17" aria-hidden="true" />
                </span>
                <span class="font-display text-2xl font-bold uppercase leading-none tracking-wide text-white">
                  {{ label(entry.row.video_kind ?? 'raw') }}
                </span>
              </span>
              <span class="mt-2.5 block truncate text-sm text-white/70">
                {{ entry.row.youtube_title || entry.title }}
                <template v-if="entry.row.youtube_duration_seconds"> · {{ formatDuration(entry.row.youtube_duration_seconds) }}</template>
              </span>
            </span>
            <ArrowRight :size="20" class="shrink-0 text-white/60 transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true" />
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
