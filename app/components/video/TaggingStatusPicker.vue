<script setup lang="ts">
import type { TaggingStatus } from '~/utils/taggingStatus'
import { TAGGING_STATES } from '~/utils/taggingStatus'

/**
 * Where a match is in the edit, as three segments rather than a dropdown.
 *
 * A dropdown answers the question only after it is read: every row on the
 * library looked identical until you got to the word inside it. Three segments
 * with one lit answers it from across the room — raw, being edited, edited —
 * in the same crimson the guest cards use for the same three facts, and it is
 * still one press to change, instead of a press to open and a press to pick.
 */
const props = defineProps<{ label: string }>()

const model = defineModel<string>({ required: true })

function pick(id: TaggingStatus) {
  if (model.value !== id) model.value = id
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="props.label"
    class="inline-flex items-center gap-0.5 rounded-xl border border-line bg-panel p-0.5"
  >
    <button
      v-for="s in TAGGING_STATES"
      :key="s.id"
      type="button"
      role="radio"
      :data-testid="`tagging-${s.id}`"
      :aria-checked="model === s.id"
      :title="s.label"
      class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-transparent px-2 font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] transition-[background-color,color,border-color] duration-150"
      :class="model === s.id ? s.chip : 'text-ink-muted hover:border-line-strong hover:text-ink'"
      @click="pick(s.id)"
    >
      <component
        :is="s.icon"
        :size="14"
        :fill="model === s.id && s.id === 'tagged' ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
      <!-- Only the state it is in says its name: three words per row, on every
           row, is a column of noise, and the icons carry the other two. -->
      <span :class="model === s.id ? '' : 'sr-only'">{{ s.label }}</span>
    </button>
  </div>
</template>
