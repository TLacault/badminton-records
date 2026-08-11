<script setup lang="ts">
import { Check, Share2, TriangleAlert } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    /** Path or absolute URL to copy. A path is resolved against this origin. */
    to: string
    /** Printed beside the icon. Icon only when absent, as on a card. */
    label?: string | null
  }>(),
  { label: null },
)

// Two roots — the button and the notice it teleports — so the class a caller
// writes has to be aimed at the button by hand.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()

/** Long enough to read four words, short enough not to be dismissed. */
const NOTICE_MS = 1600
/** Keeps the notice off the edge of the window when the click lands there. */
const MARGIN = 72

const notice = ref<{ x: number, y: number, ok: boolean } | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

async function share(event: MouseEvent) {
  // On a card the button sits on top of a link covering the whole card, and on
  // the match page inside a header that is not one. Stopping both here means
  // the button behaves the same wherever it is put.
  event.preventDefault()
  event.stopPropagation()

  const url = new URL(props.to, window.location.origin).toString()
  let ok = true
  try {
    await navigator.clipboard.writeText(url)
  }
  catch {
    // Denied permission, or an insecure origin: there is nothing to retry, and
    // silence would read as a link successfully copied.
    ok = false
  }

  notice.value = {
    x: Math.min(Math.max(event.clientX, MARGIN), window.innerWidth - MARGIN),
    y: event.clientY,
    ok,
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    notice.value = null
  }, NOTICE_MS)
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <button
    type="button"
    data-testid="share-link"
    v-bind="$attrs"
    :aria-label="label ? undefined : t('share.copy')"
    :title="t('share.copy')"
    @click="share"
  >
    <Share2 :size="14" aria-hidden="true" />
    <span v-if="label">{{ label }}</span>
  </button>

  <!--
    Teleported, and fixed to where the pointer was: a card clips its own
    overflow, so a notice rendered in place would be cut off by the very card
    that was shared.
  -->
  <Teleport to="body">
    <!--
      No enter transition: a confirmation is wanted the instant it is clicked,
      and an animated one is a chance for it to be missed. It only fades out.
      The offset rides in the style attribute beside the coordinates it belongs
      with — as a class it would fight the fade for the `translate` property,
      and whichever won would decide where the notice sits.
    -->
    <Transition
      leave-active-class="transition-opacity duration-300 ease-brand"
      leave-to-class="opacity-0"
    >
      <div
        v-if="notice"
        data-testid="share-notice"
        role="status"
        aria-live="polite"
        class="pointer-events-none fixed z-[100] flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink glass-menu"
        :style="{ left: `${notice.x}px`, top: `${notice.y - 12}px`, translate: '-50% -100%' }"
      >
        <component
          :is="notice.ok ? Check : TriangleAlert"
          :size="13"
          :class="notice.ok ? 'text-accent' : 'text-ink-subtle'"
          aria-hidden="true"
        />
        {{ notice.ok ? t('share.copied') : t('share.failed') }}
      </div>
    </Transition>
  </Teleport>
</template>
