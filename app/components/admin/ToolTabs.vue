<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'

/** The panel switcher of every Create tool: one strip, the active panel in brand red. */
defineProps<{ tabs: readonly { id: T, label: string, icon: Component }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    role="tablist"
    class="grid gap-1 rounded-xl border border-line bg-bg-deep p-1"
    :style="{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="entry in tabs"
      :key="entry.id"
      type="button"
      role="tab"
      :aria-selected="model === entry.id"
      class="flex min-h-10 items-center justify-center gap-1.5 rounded-lg font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200"
      :class="model === entry.id ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'"
      @click="model = entry.id"
    >
      <component :is="entry.icon" :size="14" aria-hidden="true" />
      <span class="hidden sm:inline">{{ entry.label }}</span>
    </button>
  </div>
</template>
