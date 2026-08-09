<script setup lang="ts">
import { Handshake, UserRound, Users } from '@lucide/vue'
import { site } from '~/config/site'

const partner = site.partner

const rankChips = computed(() =>
  ([
    ['S', partner.ranks.singles],
    ['D', partner.ranks.doubles],
    ['Mx', partner.ranks.mixed],
  ] as const).filter(([, value]) => Boolean(value)),
)
</script>

<template>
  <section id="partner" class="scroll-mt-28">
    <div
      class="relative overflow-hidden rounded-[1.75rem] glass"
    >
      <!-- A single diagonal behind the pair: two players, one line through
           both of them. -->
      <div
        class="pointer-events-none absolute inset-y-[-40%] right-[12%] w-40 -skew-x-12 slash opacity-15 blur-xl dark:opacity-25"
        aria-hidden="true"
      />

      <div class="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] lg:gap-12">
        <div>
          <UiReveal>
            <UiSectionHeading
              eyebrow="Every double, same partner"
              :icon="Handshake"
              title="The pair"
            />
          </UiReveal>

          <UiReveal :delay="60">
            <div class="mt-6 space-y-4 text-[1.0625rem] leading-relaxed text-ink-muted">
              <p v-for="(paragraph, i) in partner.bio" :key="i">
                {{ paragraph }}
              </p>
            </div>

            <ul v-if="partner.traits.length" class="mt-6 flex flex-wrap gap-2">
              <li
                v-for="trait in partner.traits"
                :key="trait"
                class="rounded-full border border-accent/25 bg-accent-soft px-3.5 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.1em] text-accent"
              >
                {{ trait }}
              </li>
            </ul>
          </UiReveal>
        </div>

        <UiReveal :delay="120" class="lg:self-center">
          <div class="rounded-2xl border border-line p-5">
            <div class="flex items-center gap-4">
              <img
                v-if="partner.portrait"
                :src="assetUrl(partner.portrait)"
                :alt="partner.name"
                width="200"
                height="200"
                loading="lazy"
                decoding="async"
                class="size-16 shrink-0 rounded-2xl border border-line object-cover"
              >
              <span
                v-else
                class="grid size-16 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent"
                aria-hidden="true"
              >
                <UserRound :size="26" />
              </span>

              <div class="min-w-0">
                <p class="truncate font-display text-xl font-bold uppercase leading-tight tracking-wide text-ink">
                  {{ partner.name }}
                </p>
                <p class="mt-0.5 truncate text-sm text-ink-muted">
                  {{ partner.role }}
                </p>
              </div>
            </div>

            <dl v-if="rankChips.length" class="mt-5 grid grid-cols-3 gap-2">
              <div
                v-for="[label, value] in rankChips"
                :key="label"
                class="rounded-lg bg-panel-strong px-2 py-2 text-center"
              >
                <dd class="font-display text-base font-bold tabular-nums text-accent">
                  {{ value }}
                </dd>
                <dt class="font-display text-[0.6875rem] uppercase tracking-[0.12em] text-ink-subtle">
                  {{ label }}
                </dt>
              </div>
            </dl>

            <p class="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-muted">
              <Users :size="15" class="shrink-0 text-accent" aria-hidden="true" />
              Playing together since {{ partner.together }}
            </p>
          </div>
        </UiReveal>
      </div>
    </div>
  </section>
</template>
