<script setup lang="ts">
import { bindingLabel, KEYBIND_ACTIONS, PLAYER_ACTIONS } from '~/composables/useKeybinds'

const props = withDefaults(
  defineProps<{
    videoId: string | null
    /**
     * Pull keystrokes back out of the iframe after a click into the player.
     * Both players want this now that shortcuts drive them; it stays a prop so
     * a future embed with no keyboard of its own can opt out.
     */
    restoreFocus?: boolean
  }>(),
  { restoreFocus: true },
)

const host = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')
const api = useYouTubePlayer(host, videoId, {
  restoreFocus: toRef(props, 'restoreFocus').value,
})
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(frame)

/**
 * Chrome appears with the cursor and leaves two seconds later, the way video
 * chrome should: there when you reach for it, gone while you watch.
 *
 * A cross-origin iframe swallows every pointer event inside it, so "the cursor
 * stopped moving" is not observable once the mouse is over the video — only
 * entering and leaving the stage are. Two things fill the gap: a paused player
 * keeps the chrome, and any shortcut counts as activity, so a keypress never
 * lands on a hidden overlay. Keyboard focus pins it open, or the sheet would
 * be unreachable without a mouse.
 */
const IDLE_MS = 2000
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

const chromeVisible = computed(() =>
  cursorActive.value || focused.value || !api.isPlaying.value,
)

/** The sheet, built from the live bindings so a rebind shows up here too. */
const { bindings } = useKeybinds()
const shortcuts = computed(() =>
  PLAYER_ACTIONS.map((id) => {
    const action = KEYBIND_ACTIONS.find(a => a.id === id)
    const keys = bindings.value[id] ?? []
    return {
      id,
      label: action?.label ?? id,
      keys: keys.map(bindingLabel).join(' / '),
    }
  }).filter(item => item.keys),
)

defineExpose({ ...api, isFullscreen, toggleFullscreen, wake })
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
      <slot name="overlay" :is-fullscreen="isFullscreen" :chrome-visible="chromeVisible" />
    </div>

    <!--
      The shortcut sheet, where our fullscreen button used to be. F does that
      job now, so a button for it was one more thing covering the video.

      Bottom centre, above YouTube's control bar: the corners belong to the
      embed — settings and fullscreen on the right, channel chrome on the left
      — and covering any of them is worse than sharing the middle with the
      seek bar.
    -->
    <div
      v-if="videoId"
      data-testid="stage-shortcuts"
      class="pointer-events-none absolute bottom-14 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-white/25 bg-black/70 px-3 py-2 backdrop-blur-md transition-opacity duration-200"
      :class="chromeVisible ? 'opacity-100' : 'opacity-0'"
      :aria-hidden="!chromeVisible"
      style="box-shadow: var(--ui-glow-soft)"
    >
      <ul class="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
        <li
          v-for="item in shortcuts"
          :key="item.id"
          class="flex items-baseline gap-1.5 whitespace-nowrap text-[0.6875rem] leading-5 text-white/80"
        >
          <kbd class="rounded border border-white/30 bg-white/10 px-1 font-mono text-[0.625rem] text-white">{{ item.keys }}</kbd>
          {{ item.label }}
        </li>
      </ul>
    </div>

    <p v-if="!videoId" class="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-subtle">
      {{ $t('player.noVideo') }}
    </p>
  </div>
</template>
