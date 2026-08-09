<script setup lang="ts">
import { CircleCheck, CircleDashed, Eye, EyeOff, Loader } from '@lucide/vue'

const props = defineProps<{
  taggingStatus?: string
  visibility?: string
}>()

const tagging = computed(() => {
  switch (props.taggingStatus) {
    case 'tagged':
      return { label: 'Tagged', icon: CircleCheck, class: 'bg-emerald-950 text-emerald-300' }
    case 'in_progress':
      return { label: 'In progress', icon: Loader, class: 'bg-amber-950 text-amber-300' }
    default:
      return { label: 'Untagged', icon: CircleDashed, class: 'bg-slate-800 text-slate-400' }
  }
})

const visible = computed(() =>
  props.visibility === 'public'
    ? { label: 'Public', icon: Eye, class: 'bg-sky-950 text-sky-300' }
    : { label: 'Private', icon: EyeOff, class: 'bg-slate-800 text-slate-400' },
)
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span
      v-if="taggingStatus"
      data-testid="badge-tagging"
      class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
      :class="tagging.class"
    >
      <component :is="tagging.icon" :size="12" />{{ tagging.label }}
    </span>
    <span
      v-if="visibility"
      data-testid="badge-visibility"
      class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
      :class="visible.class"
    >
      <component :is="visible.icon" :size="12" />{{ visible.label }}
    </span>
  </span>
</template>
