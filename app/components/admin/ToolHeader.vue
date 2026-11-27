<script setup lang="ts">
import type { Component } from 'vue'

/**
 * The first line of every Create tool (Tag, YouTube, Highlights, Shorts):
 * the tool's icon and the video's title on the left, the tool's history
 * (undo, redo, reset, save state) on the right. Under it, every tool uses the
 * tagger's grid: `grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42rem)]`,
 * player left, the tool's panels right.
 */
defineProps<{ icon: Component, title?: string, subtitle?: string | null }>()
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-on-brand" style="box-shadow: var(--ui-glow-soft)">
        <component :is="icon" :size="18" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <slot name="title">
          <h1 class="truncate font-display text-2xl font-bold uppercase leading-tight tracking-tight sm:text-3xl">
            {{ title }}
          </h1>
        </slot>
        <p v-if="subtitle" class="truncate text-sm text-ink-subtle">
          {{ subtitle }}
        </p>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <slot name="actions" />
    </div>
  </header>
</template>
