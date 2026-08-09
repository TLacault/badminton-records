<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

const { theme, toggle } = useTheme()

const isDark = computed(() => theme.value === 'dark')
const label = computed(() => (isDark.value ? 'Switch to light theme' : 'Switch to dark theme'))
</script>

<template>
  <button
    type="button"
    data-testid="theme-toggle"
    class="relative grid size-11 shrink-0 place-items-center rounded-xl border border-line text-ink-muted transition-[color,border-color,background-color] duration-200 ease-brand hover:border-accent/50 hover:text-accent focus-visible:text-accent"
    :aria-label="label"
    :title="label"
    :aria-pressed="isDark"
    @click="toggle"
  >
    <!--
      Both glyphs are always mounted and cross-faded. Swapping the component
      instead would pop, and the rotation is what makes the change read as one
      object turning rather than two icons trading places.
    -->
    <Sun
      :size="18"
      class="absolute transition-[opacity,transform] duration-300 ease-brand"
      :class="isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'"
      aria-hidden="true"
    />
    <Moon
      :size="18"
      class="absolute transition-[opacity,transform] duration-300 ease-brand"
      :class="isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'"
      aria-hidden="true"
    />
  </button>
</template>
