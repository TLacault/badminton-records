<script setup lang="ts">
import type { Component } from 'vue'
import { ArrowLeft, Check, Hourglass } from '@lucide/vue'

defineProps<{
  eyebrow: string
  title: string
  lede: string
  icon: Component
  /** What the section will hold. Sets an expectation instead of an apology. */
  planned: string[]
}>()
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col items-center py-10 text-center sm:py-16">
    <UiReveal class="flex flex-col items-center">
      <span
        class="relative grid size-20 place-items-center rounded-3xl border border-accent/30 bg-accent-soft text-accent"
        style="box-shadow: var(--ui-glow-soft)"
        aria-hidden="true"
      >
        <component :is="icon" :size="34" />
        <span
          class="absolute inset-0 rounded-3xl border border-accent/40 animate-glow-pulse"
        />
      </span>

      <p class="eyebrow mt-7">
        <Hourglass :size="14" aria-hidden="true" />
        {{ eyebrow }}
      </p>

      <h1 class="mt-3 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-bold uppercase leading-[0.92] tracking-tight">
        {{ title }}
      </h1>

      <p class="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-muted">
        {{ lede }}
      </p>
    </UiReveal>

    <UiReveal :delay="80" class="mt-12 w-full">
      <div class="rounded-2xl p-6 text-left glass sm:p-8">
        <h2 class="label">
          What's coming
        </h2>
        <ul class="mt-5 space-y-3.5">
          <li
            v-for="item in planned"
            :key="item"
            class="flex items-start gap-3 text-[1.0625rem] leading-relaxed text-ink-muted"
          >
            <span
              class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent-soft text-accent"
              aria-hidden="true"
            >
              <Check :size="12" />
            </span>
            {{ item }}
          </li>
        </ul>
      </div>
    </UiReveal>

    <UiReveal :delay="140" class="mt-10">
      <NuxtLink to="/videos" class="btn btn-primary">
        <ArrowLeft :size="16" aria-hidden="true" />
        Watch the matches meanwhile
      </NuxtLink>
    </UiReveal>
  </div>
</template>
