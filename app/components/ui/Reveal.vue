<script setup lang="ts">
/**
 * Reveals its slot when it scrolls into view.
 *
 * The hidden class is rendered by the server too, so there is no flash of
 * fully-drawn content being yanked back to opacity 0 on hydration. Two escape
 * hatches keep that safe: `prefers-reduced-motion` unhides in CSS, and the
 * <noscript> rule in nuxt.config unhides when JS never arrives.
 */
const props = withDefaults(
  defineProps<{
    /** Stagger within a group. Keep to 40–60ms steps; more reads as lag. */
    delay?: number
    as?: string
  }>(),
  { delay: 0, as: 'div' },
)

const el = ref<HTMLElement | null>(null)
const shown = ref(false)

onMounted(() => {
  if (!el.value || typeof IntersectionObserver === 'undefined') {
    shown.value = true
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return
      shown.value = true
      observer.disconnect()
    },
    // Fires a little before the element is fully on screen, so the motion has
    // finished by the time the reader's eye reaches it.
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  )

  observer.observe(el.value)
  onBeforeUnmount(() => observer.disconnect())
})
</script>

<template>
  <component
    :is="props.as"
    ref="el"
    :class="shown ? 'reveal-shown' : 'reveal-hidden'"
    :style="{ '--reveal-delay': `${props.delay}ms` }"
  >
    <slot />
  </component>
</template>
