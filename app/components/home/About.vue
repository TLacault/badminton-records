<script setup lang="ts">
import { Hand, Milestone, UserRound } from '@lucide/vue'
import { site } from '~/config/site'

const player = site.player

const rankChips = computed(() =>
  ([
    ['Singles', player.ranks.singles],
    ['Doubles', player.ranks.doubles],
    ['Mixed', player.ranks.mixed],
  ] as const).filter(([, value]) => Boolean(value)),
)
</script>

<template>
  <section id="about" class="scroll-mt-28">
    <div class="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
      <!-- ── Portrait ─────────────────────────────────────────────────── -->
      <UiReveal class="lg:sticky lg:top-28 lg:self-start">
        <figure class="relative">
          <div
            class="absolute -inset-3 -z-10 rounded-[2rem] opacity-60 blur-2xl"
            style="background: radial-gradient(60% 60% at 50% 30%, color-mix(in oklab, var(--ui-accent) 40%, transparent), transparent 70%)"
            aria-hidden="true"
          />
          <img
            :src="assetUrl(player.portrait)"
            :alt="`${player.name} playing for ${site.club.name}`"
            width="900"
            height="900"
            loading="lazy"
            decoding="async"
            class="aspect-square w-full rounded-[1.75rem] border border-line object-cover"
          >
          <figcaption
            class="absolute inset-x-3 bottom-3 rounded-2xl px-4 py-3 glass-strong"
          >
            <p class="font-display text-xl font-bold uppercase leading-none tracking-wide text-ink">
              {{ player.name }}
            </p>
            <p class="mt-1.5 text-sm leading-snug text-ink-muted">
              {{ $lt(player.role) }}
            </p>
          </figcaption>
        </figure>

        <dl v-if="rankChips.length" class="mt-4 grid grid-cols-3 gap-2">
          <div
            v-for="[label, value] in rankChips"
            :key="label"
            class="rounded-xl border border-line px-3 py-2.5 text-center"
          >
            <dd class="font-display text-lg font-bold tabular-nums text-accent">
              {{ value }}
            </dd>
            <dt class="font-display text-[0.625rem] uppercase tracking-[0.16em] text-ink-subtle">
              {{ label }}
            </dt>
          </div>
        </dl>
      </UiReveal>

      <!-- ── Story ────────────────────────────────────────────────────── -->
      <div>
        <UiReveal>
          <UiSectionHeading
            :eyebrow="$t('home.about.eyebrow')"
            :icon="UserRound"
            :title="$t('home.about.title')"
          />
        </UiReveal>

        <UiReveal :delay="60">
          <div class="mt-6 space-y-4 text-[1.0625rem] leading-relaxed text-ink-muted">
            <p v-for="(paragraph, i) in player.bio" :key="i">
              {{ $lt(paragraph) }}
            </p>
          </div>

          <ul class="mt-6 flex flex-wrap gap-2">
            <li class="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-muted">
              <Milestone :size="14" class="text-accent" aria-hidden="true" />
              {{ $t('home.about.playingSince') }} {{ $lt(player.playingSince) }}
            </li>
            <!-- Hidden rather than shown as a dangling key while `hand` is
                 still empty in site.ts. -->
            <li
              v-if="player.hand"
              class="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-muted"
            >
              <Hand :size="14" class="text-accent" aria-hidden="true" />
              {{ $t(`home.about.hand.${player.hand}`) }}
            </li>
          </ul>
        </UiReveal>

        <!-- ── Timeline ───────────────────────────────────────────────── -->
        <UiReveal v-if="player.career.length" :delay="120" class="mt-10">
          <h3 class="label">
            {{ $t('home.about.milestones') }}
          </h3>
          <ol class="mt-5 space-y-0">
            <li
              v-for="(entry, i) in player.career"
              :key="i"
              class="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 pb-8 last:pb-0"
            >
              <!-- Rail. Stops at the last node so the line does not dangle. -->
              <span
                v-if="i < player.career.length - 1"
                class="absolute left-[7px] top-4 h-full w-px bg-line"
                aria-hidden="true"
              />
              <span
                class="relative mt-1.5 size-[15px] shrink-0 rounded-full border-2 border-accent bg-bg"
                :class="i === 0 ? 'shadow-[0_0_12px_var(--ui-accent)]' : ''"
                aria-hidden="true"
              />
              <div>
                <p class="font-display text-sm font-semibold uppercase tracking-[0.16em] text-accent tabular-nums">
                  {{ entry.year }}
                </p>
                <p class="mt-1 font-display text-lg font-semibold uppercase tracking-wide text-ink">
                  {{ $lt(entry.title) }}
                </p>
                <p class="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {{ $lt(entry.detail) }}
                </p>
              </div>
            </li>
          </ol>
        </UiReveal>
      </div>
    </div>
  </section>
</template>
