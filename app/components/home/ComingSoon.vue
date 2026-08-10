<script setup lang="ts">
import { ArrowRight, BookOpen, Hourglass, Video, Waypoints } from '@lucide/vue'
import { site } from '~/config/site'

const ICONS = { videos: Video, 'resources': BookOpen, 'skill-tree': Waypoints } as const

const upcoming = computed(() => site.pillars.filter(pillar => !pillar.ready))
</script>

<template>
  <section id="soon" class="scroll-mt-28">
    <UiReveal>
      <UiSectionHeading
        :eyebrow="$t('home.soon.eyebrow')"
        :icon="Hourglass"
        :title="$t('home.soon.title')"
        :lede="$t('home.soon.lede')"
        align="center"
        class="mx-auto"
      />
    </UiReveal>

    <ul class="mt-12 grid gap-5 md:grid-cols-2">
      <UiReveal
        v-for="(pillar, i) in upcoming"
        :key="pillar.id"
        as="li"
        :delay="i * 80"
      >
        <NuxtLink
          :to="pillar.to"
          class="group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-7 glass transition-[transform,border-color] duration-300 ease-brand hover:-translate-y-1 hover:border-accent/40 sm:p-9"
        >
          <!-- Crimson bloom that wakes up on hover: the section is dormant,
               not dead. -->
          <span
            class="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
            style="background: radial-gradient(circle, color-mix(in oklab, var(--ui-accent) 45%, transparent), transparent 70%)"
            aria-hidden="true"
          />

          <div class="relative flex items-start justify-between gap-4">
            <span
              class="grid size-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent transition-shadow duration-300 group-hover:shadow-[var(--ui-glow-strong)]"
              aria-hidden="true"
            >
              <component :is="ICONS[pillar.id as keyof typeof ICONS]" :size="24" />
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-subtle"
            >
              <Hourglass :size="11" aria-hidden="true" />
              {{ $t('home.soon.inTheWorks') }}
            </span>
          </div>

          <h3 class="relative mt-6 font-display text-3xl font-bold uppercase tracking-wide text-ink transition-colors duration-200 group-hover:text-accent">
            {{ $lt(pillar.title) }}
          </h3>
          <p class="relative mt-3 flex-1 text-[1.0625rem] leading-relaxed text-ink-muted">
            {{ $lt(pillar.blurb) }}
          </p>

          <p class="relative mt-6 inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-accent">
            {{ $t('home.soon.takeALook') }}
            <ArrowRight
              :size="15"
              class="transition-transform duration-300 ease-brand group-hover:translate-x-1"
              aria-hidden="true"
            />
          </p>
        </NuxtLink>
      </UiReveal>
    </ul>
  </section>
</template>
