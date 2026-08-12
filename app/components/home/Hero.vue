<script setup lang="ts">
import { ArrowDown, ArrowUpRight, Play, Video } from "@lucide/vue";
import { site } from "~/config/site";

defineProps<{
  /** Shown as the hero's proof strip. Omitted entirely when there is no data. */
  stats?: Array<{ value: string; label: string }>;
}>();
</script>

<template>
  <section
    class="relative isolate flex h-[100svh] items-center overflow-hidden"
  >
    <!-- ── Backdrop ─────────────────────────────────────────────────────── -->
    <div class="absolute inset-0 -z-10" aria-hidden="true">
      <!--
        Duotone: desaturate the photograph, then lay the club red over it in
        `color` blend mode. Kept dim on purpose — at full strength the whole
        viewport turns pink and the crimson stops meaning anything, because
        everything is crimson. The hall is texture; the accents are the brand.
      -->
      <!--
        `isolate` is load-bearing: without it `mix-blend-color` composites
        against the page background too and floods the whole hero rectangle
        with red rather than tinting the photograph inside it.
      -->
      <div class="absolute inset-0 isolate opacity-[0.22] dark:opacity-30">
        <img
          src="/brand/court.jpg"
          alt=""
          width="1920"
          height="1077"
          fetchpriority="high"
          decoding="async"
          class="size-full object-cover object-center grayscale contrast-125"
        />
        <div
          class="absolute inset-0 mix-blend-color"
          style="background-color: var(--ui-brand)"
        />
      </div>

      <!-- Scrim, bottom-weighted so the headline always has a dark floor. -->
      <div
        class="absolute inset-0"
        style="
          background: linear-gradient(
            to bottom,
            var(--ui-bg) 0%,
            color-mix(in oklab, var(--ui-bg) 45%, transparent) 32%,
            color-mix(in oklab, var(--ui-bg) 82%, transparent) 76%,
            var(--ui-bg) 100%
          );
        "
      />

      <!--
        The banner's signature diagonals, rebuilt as skewed gradient bars so
        they recolour with the theme and cost one paint instead of an image.
      -->
      <div
        class="absolute inset-y-[-30%] left-[6%] w-20 -skew-x-12 slash opacity-[0.12] blur-[3px] dark:opacity-[0.18]"
      />
      <div
        class="absolute inset-y-[-30%] left-[12%] w-4 -skew-x-12 slash opacity-30 dark:opacity-45"
      />
      <div
        class="absolute inset-y-[-30%] right-[10%] w-28 -skew-x-12 slash opacity-[0.1] blur-[4px] dark:opacity-[0.15]"
      />
      <div
        class="absolute inset-y-[-30%] right-[19%] w-2 -skew-x-12 slash opacity-25 dark:opacity-40"
      />
    </div>

    <!-- ── Content ──────────────────────────────────────────────────────── -->
    <div class="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <UiReveal class="flex flex-col items-start gap-6">
        <!-- The emblem alone, not the lockup: the club's set text is only
             legible above ~140px tall, and the kicker below already says it. -->
        <!-- <UiBrandLogo
          size="h-14 sm:h-16"
          :wordmark="false"
          class="drop-shadow-[0_0_24px_color-mix(in_oklab,var(--ui-accent)_45%,transparent)]"
        /> -->

        <p class="eyebrow">
          <span
            class="inline-block size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--ui-accent)] animate-glow-pulse"
          />
          {{ site.hero.kicker }}
        </p>

        <h1
          class="font-display text-[clamp(3rem,10vw,7rem)] font-bold uppercase leading-[0.88] tracking-[-0.02em]"
        >
          <span class="block">{{ $ltList(site.hero.title)[0] }}</span>
          <span class="block text-accent text-glow">{{
            $ltList(site.hero.title)[1]
          }}</span>
        </h1>

        <p class="max-w-[52ch] text-lg leading-relaxed text-ink-muted">
          {{ $lt(site.hero.lede) }}
        </p>

        <!-- The recording spec, on its own line rather than inside the lede:
             the picture is half of what is on offer here, and a claim about it
             is worth reading on its own. -->
        <p
          class="flex max-w-[56ch] flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-relaxed text-ink-muted"
        >
          <span
            class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/45 bg-accent-soft px-2 py-1 font-display text-xs font-bold uppercase tracking-[0.12em] text-accent"
          >
            <Video :size="14" aria-hidden="true" />
            {{ site.hero.quality.badge }}
          </span>
          <!-- {{ $lt(site.hero.quality.note) }} -->
        </p>

        <div class="mt-2 flex flex-wrap items-center gap-3">
          <NuxtLink to="/videos" class="btn btn-primary">
            <Play :size="16" class="fill-current" aria-hidden="true" />
            {{ $t("home.hero.watch") }}
          </NuxtLink>
          <a
            :href="site.club.youtube"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-ghost"
          >
            <UiYouTubeGlyph :size="16" />
            {{ $t("home.hero.channel") }}
            <ArrowUpRight :size="15" aria-hidden="true" />
          </a>
        </div>

        <!-- Proof strip. Hidden rather than shown empty when the numbers in
             site.ts are still placeholders. -->
        <dl
          v-if="stats?.length"
          class="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-6"
        >
          <div v-for="stat in stats" :key="stat.label">
            <dd class="font-display text-3xl font-bold tabular-nums text-ink">
              {{ stat.value }}
            </dd>
            <dt
              class="mt-0.5 font-display text-xs uppercase tracking-[0.16em] text-ink-subtle"
            >
              {{ stat.label }}
            </dt>
          </div>
        </dl>
      </UiReveal>
    </div>

    <a
      href="#about"
      class="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1.5 text-ink-subtle transition-colors duration-200 hover:text-accent sm:flex"
      :aria-label="$t('home.hero.skipAria')"
    >
      <span class="font-display text-[0.6875rem] uppercase tracking-[0.22em]">{{
        $t("home.hero.scroll")
      }}</span>
      <ArrowDown :size="16" class="animate-bounce" aria-hidden="true" />
    </a>
  </section>
</template>
