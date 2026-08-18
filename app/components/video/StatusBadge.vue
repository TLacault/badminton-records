<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { taggingState } from '~/utils/taggingStatus'

const props = defineProps<{
  taggingStatus?: string
  visibility?: string
}>()

/*
 * Bichromatic, so shape and weight carry what a second hue used to: crimson
 * means "done / live", a plain outline means "not yet", and every state keeps
 * its own icon so the badges are still readable in greyscale.
 *
 * The three editing states come from the shared vocabulary rather than being
 * spelled out here: the guest cards, the library's segmented control and this
 * badge are three views of one fact and must never word it three ways.
 */
const tagging = computed(() => {
  const state = taggingState(props.taggingStatus)
  return { label: state.label, icon: state.icon, class: state.chip }
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
      <component
        :is="tagging.icon"
        :size="12"
        :fill="taggingStatus === 'tagged' ? 'currentColor' : 'none'"
        aria-hidden="true"
      />{{ tagging.label }}
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
