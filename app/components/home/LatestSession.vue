<script setup lang="ts">
import type { Session } from '~/utils/sessions'
import type { ListRow, MatchEntry } from '~/utils/videoFilters'
import { ArrowRight, CalendarDays, Clapperboard, MapPin, Timer } from '@lucide/vue'

const { bcp47 } = useI18n()

const props = defineProps<{ session: Session<MatchEntry<ListRow>> | null }>()

const groups = computed(() => splitKinds(props.session?.matches ?? [], e => e.row))
const lead = computed(() => groups.value.matches[0] ?? groups.value.extras[0] ?? null)
const rest = computed(() => groups.value.matches.filter(e => e !== lead.value))
const extras = computed(() => groups.value.extras.filter(e => e !== lead.value))
</script>

<template>
  <section id="latest" class="scroll-mt-28">
    <UiReveal>
      <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <UiSectionHeading
          :eyebrow="$t('home.latest.eyebrow')"
          :icon="CalendarDays"
          :title="session ? [session.eventName, formatDateLong(session.date, bcp47, $t('common.undated'))].filter(Boolean).join(' · ') : $t('home.latest.none')"
          :lede="$t('home.latest.lede')"
        />
        <NuxtLink to="/videos" class="btn btn-ghost btn-sm">
          {{ $t('home.latest.all') }}
          <ArrowRight :size="15" aria-hidden="true" />
        </NuxtLink>
      </div>

      <ul v-if="session" class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
        <li class="inline-flex items-center gap-1.5">
          <Clapperboard :size="14" class="text-accent" aria-hidden="true" />
          {{ session.matchCount }} {{ session.matchCount === 1 ? 'match' : 'matches' }}
        </li>
        <li v-if="session.totalSeconds" class="inline-flex items-center gap-1.5">
          <Timer :size="14" class="text-accent" aria-hidden="true" />
          <span class="tabular-nums">{{ formatSpan(session.totalSeconds) }}</span> of play
        </li>
        <li v-if="session.venue" class="inline-flex items-center gap-1.5">
          <MapPin :size="14" class="text-accent" aria-hidden="true" />
          {{ session.venue }}
        </li>
      </ul>
    </UiReveal>

    <template v-if="session">
      <UiReveal :delay="80" class="mt-8 block">
        <VideoMatchCard v-if="lead" :entry="lead" featured />
      </UiReveal>

      <ul v-if="rest.length" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UiReveal
          v-for="(entry, i) in rest"
          :key="entry.row.id"
          as="li"
          :delay="i * 50"
        >
          <VideoMatchCard :entry="entry" />
        </UiReveal>
      </ul>

      <template v-if="extras.length">
        <h3 class="label mb-4 mt-8">
          {{ $t('card.extras') }}
        </h3>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UiReveal v-for="(entry, i) in extras" :key="entry.row.id" as="li" :delay="i * 50">
            <VideoMatchCard :entry="entry" />
          </UiReveal>
        </ul>
      </template>
    </template>

    <UiReveal v-else class="mt-8 block">
      <p class="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-muted">
        {{ $t('home.latest.empty') }}
      </p>
    </UiReveal>
  </section>
</template>
