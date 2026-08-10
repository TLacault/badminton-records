<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { PLAYER_INFO_FIELDS } from '~/utils/players'

const props = defineProps<{
  title: string
  /** True once the title is built from the roster rather than the upload name. */
  generated: boolean
  typeLabel: string | null
  /** `matches.player_info_fields` — what the public page will print. */
  infoFields: string[]
}>()

/** The enabled details, in the vocabulary's own order rather than the array's. */
const chips = computed(() =>
  PLAYER_INFO_FIELDS.filter(field => props.infoFields.includes(field.id)),
)

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function copy() {
  await navigator.clipboard.writeText(props.title)
  copied.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1600)
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <section
    data-testid="tag-title"
    class="rounded-2xl p-4 glass sm:px-5"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p class="eyebrow shrink-0">
        <UiYouTubeGlyph :size="14" />
        {{ generated ? 'Upload as' : 'Uploaded as' }}
      </p>

      <p
        data-testid="tag-title-text"
        class="min-w-0 flex-1 truncate font-display text-lg tracking-tight"
        :class="generated ? 'text-ink' : 'text-ink-muted'"
        :title="title"
      >
        {{ title }}
      </p>

      <button
        type="button"
        data-testid="tag-title-copy"
        class="btn btn-ghost shrink-0"
        @click="copy"
      >
        <component :is="copied ? Check : Copy" :size="15" aria-hidden="true" />
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>

    <!-- What the match is and what the public page will print beside each
         player, so both can be checked before an hour of tagging. -->
    <div class="mt-3 flex flex-wrap items-center gap-1.5">
      <span
        v-if="typeLabel"
        data-testid="tag-type"
        class="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs text-accent"
      >
        {{ typeLabel }}
      </span>
      <span
        v-for="chip in chips"
        :key="chip.id"
        class="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted"
      >
        {{ chip.label }}
      </span>
      <span v-if="!chips.length" class="text-xs text-ink-subtle">
        No player details will be shown.
      </span>
    </div>
  </section>
</template>
