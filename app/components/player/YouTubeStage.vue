<script setup lang="ts">
import { Maximize, Minimize } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    videoId: string | null
    /** Tagging needs keystrokes back after any click into the player. */
    restoreFocus?: boolean
  }>(),
  { restoreFocus: false },
)

const host = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')
const api = useYouTubePlayer(host, videoId, {
  restoreFocus: toRef(props, 'restoreFocus').value,
})
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(frame)

/**
 * The control appears with the cursor and leaves a second later, the way video
 * chrome should: there when you reach for it, gone while you watch.
 *
 * A cross-origin iframe swallows every pointer event inside it, so "the cursor
 * stopped moving" is not observable once the mouse is over the video — only
 * entering and leaving the stage are. Playback state fills the gap: a paused
 * player keeps the button, a playing one hides it a second after the last
 * movement we could see. Keyboard focus pins it open, or it would be
 * unreachable without a mouse.
 */
const IDLE_MS = 1000
const cursorActive = ref(false)
const focused = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | null = null

function wake() {
  cursorActive.value = true
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    cursorActive.value = false
  }, IDLE_MS)
}

function sleep() {
  if (idleTimer) clearTimeout(idleTimer)
  cursorActive.value = false
}

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
})

const controlVisible = computed(() =>
  cursorActive.value || focused.value || !api.isPlaying.value,
)

defineExpose({ ...api, isFullscreen, toggleFullscreen })
</script>

<template>
  <!--
    Full width of whatever column it is given, so the player lines up with the
    header, the timeline and the panels below it rather than sitting in a
    narrower box of its own.

    Fullscreen drops the frame, since there is nothing left to sit beside —
    the wrapper is the screen.
  -->
  <div
    ref="frame"
    class="group relative aspect-video w-full overflow-hidden bg-black"
    :class="isFullscreen ? 'rounded-none border-0' : 'rounded-2xl border border-line'"
    :style="isFullscreen ? undefined : 'box-shadow: var(--ui-glow-soft), var(--ui-shadow)'"
    @pointerenter="wake"
    @pointermove="wake"
    @pointerleave="sleep"
  >
    <div ref="host" class="h-full w-full" />

    <!--
      Overlay content sits above the player but must never intercept a click:
      the native controls are underneath and have to stay reachable. Any
      interactive child opts back in with pointer-events-auto.
    -->
    <div class="pointer-events-none absolute inset-0">
      <slot name="overlay" :is-fullscreen="isFullscreen" />
    </div>

    <!--
      Our own fullscreen control, and the only one that keeps the scoreboard:
      YouTube's fullscreens the bare iframe, so it is caught and handed back to
      this wrapper.

      Bottom centre, above YouTube's control bar: the corners belong to the
      embed — the settings and fullscreen buttons on the right, the channel
      chrome on the left — and covering any of them is worse than sharing the
      middle with the seek bar.
    -->
    <button
      v-if="videoId"
      type="button"
      data-testid="stage-fullscreen"
      class="pointer-events-auto absolute bottom-14 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-lg border border-white/25 bg-black/60 px-3 font-display text-xs font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-md transition-[opacity,background-color,border-color] duration-200 hover:border-accent/70 hover:bg-black/80"
      :class="controlVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
      style="box-shadow: var(--ui-glow-soft)"
      :aria-hidden="!controlVisible"
      :tabindex="videoId ? 0 : -1"
      :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen with scoreboard'"
      @focus="focused = true"
      @blur="focused = false"
      @click="toggleFullscreen"
    >
      <component :is="isFullscreen ? Minimize : Maximize" :size="15" aria-hidden="true" />
      {{ isFullscreen ? 'Exit fullscreen' : 'Fullscreen + score' }}
    </button>

    <p v-if="!videoId" class="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-subtle">
      No YouTube video ID set for this match.
    </p>
  </div>
</template>
