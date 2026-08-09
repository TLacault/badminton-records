<script setup lang="ts">
import { CircleCheck, CircleDashed, Eye, EyeOff, Loader } from '@lucide/vue'

const props = defineProps<{
  taggingStatus?: string
  visibility?: string
}>()

/*
 * Bichromatic, so shape and weight carry what a second hue used to: crimson
 * means "done / live", a plain outline means "not yet", and every state keeps
 * its own icon so the badges are still readable in greyscale.
 */
const tagging = computed(() => {
  switch (props.taggingStatus) {
    case 'tagged':
      return { label: 'Tagged', icon: CircleCheck, class: 'border-accent/40 bg-accent-soft text-accent' }
    case 'in_progress':
      return { label: 'In progress', icon: Loader, class: 'border-dashed border-accent/40 text-accent' }
    default:
      return { label: 'Untagged', icon: CircleDashed, class: 'border-line text-ink-subtle' }
  }
})

const visible = computed(() =>
  props.visibility === 'public'
    ? { label: 'Public', icon: Eye, class: 'border-line-strong bg-panel-strong text-ink' }
    : { label: 'Private', icon: EyeOff, class: 'border-line text-ink-subtle' },
)
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1.5">
    <span
      v-if="taggingStatus"
      data-testid="badge-tagging"
      class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em]"
      :class="tagging.class"
    >
      <component :is="tagging.icon" :size="12" aria-hidden="true" />{{ tagging.label }}
    </span>
    <span
      v-if="visibility"
      data-testid="badge-visibility"
      class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em]"
      :class="visible.class"
    >
      <component :is="visible.icon" :size="12" aria-hidden="true" />{{ visible.label }}
    </span>
  </span>
</template>
