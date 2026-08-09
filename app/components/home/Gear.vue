<script setup lang="ts">
import type { GearItem } from '~/config/site'
import { Backpack, Footprints, Grip, Spline, Swords, Wind } from '@lucide/vue'
import { site } from '~/config/site'

/**
 * Lucide has no racket or shuttlecock, so each category gets the closest
 * honest metaphor rather than an emoji: crossed swords for the racket you
 * fight with, a spline for the string bed, wind for the shuttle's flight.
 */
const ICONS: Record<GearItem['icon'], typeof Swords> = {
  racket: Swords,
  string: Spline,
  shoes: Footprints,
  shuttle: Wind,
  grip: Grip,
  bag: Backpack,
}
</script>

<template>
  <section id="gear" class="scroll-mt-28">
    <UiReveal>
      <UiSectionHeading
        eyebrow="What's in the bag"
        :icon="Backpack"
        title="Equipment"
        lede="The kit behind every rally on this site — and why each piece is in there."
      />
    </UiReveal>

    <ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiReveal
        v-for="(item, i) in site.gear"
        :key="item.category"
        as="li"
        :delay="i * 50"
      >
        <article
          class="group relative h-full overflow-hidden rounded-2xl p-5 glass transition-[transform,border-color] duration-300 ease-brand hover:-translate-y-1 hover:border-accent/40"
        >
          <!-- Light sweeps across the card on hover. Transform only, so it
               composites without touching layout. -->
          <span
            class="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/8 to-transparent opacity-0 transition-opacity duration-300 group-hover:animate-sweep group-hover:opacity-100"
            aria-hidden="true"
          />

          <span
            class="grid size-11 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent transition-shadow duration-300 group-hover:shadow-[var(--ui-glow-strong)]"
            aria-hidden="true"
          >
            <component :is="ICONS[item.icon]" :size="20" />
          </span>

          <h3 class="mt-4 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-subtle">
            {{ item.category }}
          </h3>
          <p class="mt-1 font-display text-xl font-bold uppercase leading-tight tracking-wide text-ink">
            {{ item.name }}
          </p>
          <p v-if="item.spec" class="mt-1.5 font-mono text-sm tabular-nums text-accent">
            {{ item.spec }}
          </p>
          <p v-if="item.note" class="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            {{ item.note }}
          </p>
        </article>
      </UiReveal>
    </ul>
  </section>
</template>
