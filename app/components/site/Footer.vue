<script setup lang="ts">
import { ArrowUpRight, MapPin, ShieldCheck } from '@lucide/vue'
import { site } from '~/config/site'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="relative mt-28 border-t border-line">
    <!-- A single crimson filament along the seam: the section break reads as
         deliberate instead of as the page running out. -->
    <div class="absolute inset-x-0 top-0 h-px slash opacity-60" aria-hidden="true" />

    <div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
      <div>
        <UiBrandLogo variant="lockup" size="h-20" :wordmark="false" />
        <p class="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-ink-muted">
          {{ site.seo.description }}
        </p>
        <p class="mt-4 inline-flex items-center gap-1.5 text-sm text-ink-subtle">
          <MapPin :size="14" aria-hidden="true" />
          {{ site.club.town }}
        </p>
      </div>

      <nav aria-label="Sections">
        <h2 class="label">
          Sections
        </h2>
        <ul class="mt-4 space-y-2.5">
          <li v-for="pillar in site.pillars" :key="pillar.id">
            <NuxtLink
              :to="pillar.to"
              class="inline-flex items-center gap-2 text-[0.9375rem] text-ink-muted transition-colors duration-200 hover:text-accent"
            >
              {{ pillar.label }}
              <span v-if="!pillar.ready" class="text-[0.6875rem] uppercase tracking-widest text-ink-subtle">Soon</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <nav aria-label="Elsewhere">
        <h2 class="label">
          Elsewhere
        </h2>
        <ul class="mt-4 space-y-2.5">
          <li>
            <a
              :href="site.club.youtube"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 text-[0.9375rem] text-ink-muted transition-colors duration-200 hover:text-accent"
            >
              <UiYouTubeGlyph :size="16" />
              YouTube channel
              <ArrowUpRight :size="14" aria-hidden="true" />
            </a>
          </li>
          <li>
            <NuxtLink
              to="/login"
              class="inline-flex items-center gap-2 text-[0.9375rem] text-ink-subtle transition-colors duration-200 hover:text-accent"
            >
              <ShieldCheck :size="15" aria-hidden="true" />
              Admin sign in
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </div>

    <div class="border-t border-line">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 text-xs text-ink-subtle sm:px-6">
        <p>© {{ year }} {{ site.club.name }}</p>
        <p class="font-display uppercase tracking-[0.2em] text-accent">
          {{ site.club.tagline }}
        </p>
      </div>
    </div>
  </footer>
</template>
