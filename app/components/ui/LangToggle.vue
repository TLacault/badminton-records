<script setup lang="ts">
import { Languages } from '@lucide/vue'

const { locale, toggleLocale, t } = useI18n()

/** The language you would land in, not the one you are in. */
const target = computed(() => (locale.value === 'fr' ? 'EN' : 'FR'))

/**
 * Written in the destination language in both locale files, so the label is
 * legible to whoever needs it: a visitor looking for English is looking for
 * the word "English".
 */
const label = computed(() => (
  locale.value === 'fr' ? t('nav.switchToEn') : t('nav.switchToFr')
))

function swap() {
  // The whole page re-letters at once. Without a beat between the two states
  // it reads as a glitch rather than a change; with one it reads as a page
  // turning. Reduced-motion users get the swap with no fade — see main.css.
  if (import.meta.client) {
    const root = document.documentElement
    root.classList.add('lang-swapping')
    window.setTimeout(() => root.classList.remove('lang-swapping'), 260)
  }
  toggleLocale()
}
</script>

<template>
  <button
    type="button"
    data-testid="lang-toggle"
    class="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-ink-muted transition-[color,border-color,background-color] duration-200 ease-brand hover:border-accent/50 hover:text-accent focus-visible:text-accent"
    :aria-label="label"
    :title="label"
    @click="swap"
  >
    <Languages :size="18" aria-hidden="true" />
    <span class="font-display text-xs font-bold uppercase tracking-[0.12em]">
      {{ target }}
    </span>
  </button>
</template>
