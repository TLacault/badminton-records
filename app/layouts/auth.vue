<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
</script>

<template>
  <!--
    Sign-in gets its own chrome: no nav, no footer. There is exactly one thing
    to do here, and every other link is a way to not do it.
  -->
  <div class="relative flex min-h-dvh flex-col overflow-hidden">
    <UiAmbientBackdrop />

    <div class="absolute inset-0 -z-10" aria-hidden="true">
      <!-- Isolated so the crimson blend tints the photograph and not the page
           behind it. See the same note in home/Hero.vue. -->
      <div class="absolute inset-0 isolate opacity-15 dark:opacity-25">
        <img
          src="/brand/court.jpg"
          alt=""
          width="1920"
          height="1077"
          decoding="async"
          class="size-full object-cover grayscale contrast-125"
        >
        <div class="absolute inset-0 mix-blend-color" style="background-color: var(--ui-brand)" />
      </div>
      <div
        class="absolute inset-0"
        style="background: radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in oklab, var(--ui-bg) 35%, transparent), var(--ui-bg) 85%)"
      />
      <div class="absolute inset-y-[-30%] left-[8%] w-16 -skew-x-12 slash opacity-25 blur-sm dark:opacity-40" />
      <div class="absolute inset-y-[-30%] right-[12%] w-24 -skew-x-12 slash opacity-20 blur-md dark:opacity-30" />
    </div>

    <header class="p-4 sm:p-6">
      <NuxtLink
        to="/"
        class="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-ink-muted transition-colors duration-200 hover:text-accent"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        Back to the site
      </NuxtLink>
    </header>

    <main class="flex flex-1 items-center justify-center px-4 pb-16">
      <slot />
    </main>
  </div>
</template>
