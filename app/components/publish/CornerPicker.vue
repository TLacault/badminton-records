<script setup lang="ts">
import type { Corner } from '~~/shared/publish'

/** Where the scoreboard sits, picked on a small screen rather than from a list. */
const model = defineModel<Corner>({ required: true })

const CORNERS: { id: Corner, label: string, pos: string }[] = [
  { id: 'tl', label: 'Top left', pos: 'left-2 top-2' },
  { id: 'tr', label: 'Top right', pos: 'right-2 top-2' },
  { id: 'bl', label: 'Bottom left', pos: 'left-2 bottom-2' },
  { id: 'br', label: 'Bottom right', pos: 'right-2 bottom-2' },
]
</script>

<template>
  <div class="flex flex-col items-center">
    <div class="relative aspect-video w-full max-w-72 rounded-lg border-2 border-line-strong bg-bg-deep shadow-inner" role="radiogroup" aria-label="Scoreboard corner">
      <button
        v-for="c in CORNERS"
        :key="c.id"
        type="button"
        role="radio"
        :aria-checked="model === c.id"
        :aria-label="c.label"
        :title="c.label"
        class="absolute flex h-7 w-16 flex-col justify-center gap-0.5 rounded px-1.5 transition-[background-color,border-color,box-shadow] duration-200"
        :class="[c.pos, model === c.id ? 'bg-brand shadow-[var(--ui-glow-soft)]' : 'border border-dashed border-line-strong hover:border-accent/60 hover:bg-accent/10']"
        @click="model = c.id"
      >
        <span class="h-1 rounded-full" :class="model === c.id ? 'w-10 bg-white/90' : 'w-8 bg-ink-subtle/40'" />
        <span class="h-1 rounded-full" :class="model === c.id ? 'w-7 bg-white/70' : 'w-6 bg-ink-subtle/30'" />
      </button>
    </div>
    <!-- The stand: it reads as a screen, not a box. -->
    <span class="h-2 w-6 bg-line-strong" aria-hidden="true" />
    <span class="h-1 w-16 rounded-full bg-line-strong" aria-hidden="true" />
  </div>
</template>
