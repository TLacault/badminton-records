<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    eyebrow?: string
    icon?: Component
    title: string
    lede?: string
    /** `h1` on the page's single top-level heading, `h2` everywhere else. */
    level?: 'h1' | 'h2' | 'h3'
    align?: 'start' | 'center'
  }>(),
  { level: 'h2', align: 'start' },
)
</script>

<template>
  <div
    class="flex flex-col gap-3"
    :class="align === 'center' ? 'items-center text-center' : 'items-start'"
  >
    <p v-if="eyebrow" class="eyebrow">
      <component :is="icon" v-if="icon" :size="15" aria-hidden="true" />
      {{ eyebrow }}
    </p>

    <component
      :is="level"
      class="text-balance font-display font-bold uppercase leading-[0.95] tracking-tight"
      :class="level === 'h1'
        ? 'text-[clamp(2.75rem,8vw,5.5rem)]'
        : 'text-[clamp(2rem,4.5vw,3.25rem)]'"
    >
      <slot name="title">{{ title }}</slot>
    </component>

    <p
      v-if="lede || $slots.lede"
      class="max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-muted"
    >
      <slot name="lede">{{ lede }}</slot>
    </p>

    <slot />
  </div>
</template>
