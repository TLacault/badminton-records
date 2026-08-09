<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    videoId: string | null
    /** Tagging needs keystrokes back after any click into the player. */
    restoreFocus?: boolean
  }>(),
  { restoreFocus: false },
)

const host = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')
const api = useYouTubePlayer(host, videoId, {
  restoreFocus: toRef(props, 'restoreFocus').value,
})

defineExpose(api)
</script>

<template>
  <!--
    Capped by height, not width: in the full-width tagging layout an
    unconstrained 16:9 box on a wide screen grows tall enough to push the
    point list off-screen. Bounding the width to 60vh worth of height keeps
    the aspect ratio intact instead of letterboxing.
  -->
  <div class="relative mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded bg-black">
    <div ref="host" class="h-full w-full" />

    <!--
      Overlay content sits above the player but must never intercept a click:
      the native controls are underneath and have to stay reachable. Any
      interactive child opts back in with pointer-events-auto.
    -->
    <div class="pointer-events-none absolute inset-0">
      <slot name="overlay" />
    </div>

    <p v-if="!videoId" class="absolute inset-0 grid place-items-center text-slate-500">
      No YouTube video ID set for this match.
    </p>
  </div>
</template>
