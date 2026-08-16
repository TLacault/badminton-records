<script setup lang="ts">
import { Settings, X } from '@lucide/vue'

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

/** A double tap on an edge. The page seeks and flashes; the stage only asks. */
const emit = defineEmits<{ nudge: [direction: -1 | 1] }>()

const host = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')

/**
 * The frame's own height, published as a CSS variable for anything drawn inside
 * it to size against.
 *
 * The frame clips to its rounded corners, so a panel in the overlay that is
 * taller than the video is a panel with its top cut off — and how tall the
 * video is depends on the column it was given, which no media query can name.
 * The settings menu reads this to take as much height as the player allows.
 */
const frameHeight = ref(0)
let frameObserver: ResizeObserver | null = null

onMounted(() => {
  if (!frame.value) return
  frameHeight.value = frame.value.getBoundingClientRect().height
  frameObserver = new ResizeObserver(([entry]) => {
    frameHeight.value = entry?.contentRect.height ?? 0
  })
  frameObserver.observe(frame.value)
})
onBeforeUnmount(() => frameObserver?.disconnect())

/**
 * Left unset until it has been measured, never published as `0px`.
 *
 * A CSS variable falls back only when it is missing; `0px` is a value, and a
 * panel sizing itself with `calc(var(--stage-h) - 4.5rem)` against it collapses
 * to nothing. The first render always has a height of zero, so writing it out
 * would hand every consumer a broken number before the real one arrives.
 */
const stageHeightVar = computed(() =>
  frameHeight.value ? `${frameHeight.value}px` : undefined,
)

/**
 * The handover. Quality is the one thing YouTube will not let us set — the API
 * ignores every level you pass it — so the way to change it is its own settings
 * menu, and the way to reach that is to stop covering the player.
 *
 * All or nothing, rather than a hole punched over the gear: the menu unfolds
 * upward from the bottom right into a panel the size of our whole control bar,
 * and a hole would let you open it and then swallow the click on `1080p`.
 */
const nativeMode = ref(false)

const api = useYouTubePlayer(host, videoId, {
  // Suspended for the handover: clicks belong to the iframe now, and pulling
  // focus out from under an open menu is what closes it.
  restoreFocus: () => props.restoreFocus && !nativeMode.value,
})
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(frame)

/**
 * Chrome appears with the cursor and leaves a couple of seconds later, the way
 * video chrome should: there when you reach for it, gone while you watch.
 *
 * A cross-origin iframe swallows every pointer event inside it, so "the cursor
 * stopped moving" would not be observable — except that the shield below now
 * covers the iframe, so movement over the video reaches us after all. A paused
 * player keeps the chrome, and any shortcut counts as activity, so a keypress
 * never lands on a hidden overlay.
 *
 * The delay is the viewer's, set in the settings menu, and can be turned off
 * outright — scrubbing a rally frame by frame wants the bar to stay put.
 */
const { autoHide, autoHideMs, chromeHeld } = usePlayerSettings()
const cursorActive = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | null = null

function wake() {
  cursorActive.value = true
  if (idleTimer) clearTimeout(idleTimer)
  if (!autoHide.value) return
  idleTimer = setTimeout(() => {
    cursorActive.value = false
  }, autoHideMs.value)
}

// Turning auto-hide off mid-watch must bring the chrome back rather than
// freeze it in whatever state the last timer left it in.
watch(autoHide, () => wake())

function sleep() {
  if (idleTimer) clearTimeout(idleTimer)
  cursorActive.value = false
}

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
  if (tapTimer) clearTimeout(tapTimer)
})

/**
 * Tap the middle to play or pause; tap either edge twice to jump.
 *
 * The zones are the phone convention, and they earn their place on a desktop
 * too — the video is the biggest target on the page and the seek keys are not
 * reachable from a couch. The centre still toggles on the first click with no
 * delay: waiting a quarter of a second to find out whether a second click is
 * coming is a lag on the one control that is pressed constantly, and nothing
 * is bound to a double click there to make the wait worth paying.
 *
 * The edges do wait, because there a single click and a double click mean
 * different things and the first cannot be run before the second is ruled out.
 */
const DOUBLE_TAP_MS = 260
const EDGE_FRACTION = 0.3
let tapTimer: ReturnType<typeof setTimeout> | null = null

function zoneAt(clientX: number): -1 | 0 | 1 {
  const rect = frame.value?.getBoundingClientRect()
  if (!rect || !rect.width) return 0
  const ratio = (clientX - rect.left) / rect.width
  if (ratio < EDGE_FRACTION) return -1
  if (ratio > 1 - EDGE_FRACTION) return 1
  return 0
}

function onShieldClick(event: MouseEvent) {
  const zone = zoneAt(event.clientX)

  if (tapTimer) {
    clearTimeout(tapTimer)
    tapTimer = null
    if (zone !== 0) {
      emit('nudge', zone)
      wake()
      return
    }
  }

  if (zone === 0) {
    api.toggle()
    return
  }

  tapTimer = setTimeout(() => {
    tapTimer = null
    api.toggle()
  }, DOUBLE_TAP_MS)
}

/**
 * Everything ours goes: the bar, but the scrim above all, since that is what
 * buries YouTube's own bottom bar — leave it and the gear is invisible rather
 * than merely unclickable.
 */
const chromeVisible = computed(() =>
  !nativeMode.value
  && (chromeHeld.value || !autoHide.value || cursorActive.value || !api.isPlaying.value),
)

/**
 * The way-back pill idles out too, but never all the way to nothing.
 *
 * While the handover lasts the shield is lifted, so the iframe is swallowing
 * pointer events again and "the cursor moved" stops being observable. A pill
 * that hid completely would have no way to hear the movement that should bring
 * it back — the only exit left would be Escape, which one click into the iframe
 * takes away. So it dims to a ghost instead: out of the way of the frame, still
 * findable, and back to full on hover or focus, which are its own events.
 */
const nativeExitDim = computed(() =>
  nativeMode.value && autoHide.value && !cursorActive.value,
)

function enterNativeMode() {
  nativeMode.value = true
  // The handover starts the clock: no pointer events reach us from here, so
  // this is the last wake the pill will get on its own.
  wake()
}

function exitNativeMode() {
  nativeMode.value = false
  wake()
}

/**
 * Escape leaves the handover, and is the only key this component still owns.
 *
 * The cheat sheet that used to live in here — a read-only panel behind a `?`
 * — has moved out to PlayerKeyHelp, where the same keys can actually be
 * changed. Its `?` went with it: a binding outside the keybind system, sitting
 * over a key any action could be rebound onto, is exactly the collision the
 * panel exists to prevent.
 *
 * Escape only reaches us while focus is still on the page — one click into the
 * iframe and the keyboard is YouTube's — so the pill remains the exit that
 * always works, and this is the one that is quicker when it can be.
 */
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
  if (event.key === 'Escape' && nativeMode.value) exitNativeMode()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ ...api, isFullscreen, toggleFullscreen, wake, nativeMode, enterNativeMode, exitNativeMode })
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
    :style="{
      '--stage-h': stageHeightVar,
      'boxShadow': isFullscreen ? undefined : 'var(--ui-glow-soft), var(--ui-shadow)',
    }"
    @pointerenter="wake"
    @pointermove="wake"
    @pointerleave="sleep"
  >
    <div ref="host" class="h-full w-full" />

    <!--
      The shield. YouTube's own chrome is off, but the title and "Watch on
      YouTube" overlay cannot be turned off by any parameter, and a click on
      either opened a new tab — including clicks meant for our scoreboard,
      which sits over exactly that corner. Covering the iframe ends that, and
      hands us the click to use as play/pause instead.

      It also gives back pointer movement over the video, which a cross-origin
      iframe would otherwise swallow, so the chrome can idle out properly.

      It lifts for the handover, and only then: that is the whole point of the
      handover, and the stray-tab risk is the viewer's own doing while it lasts.
    -->
    <button
      v-if="videoId && !nativeMode"
      type="button"
      data-testid="stage-shield"
      class="absolute inset-0 h-full w-full cursor-default"
      :aria-label="$t('player.shieldHint')"
      tabindex="-1"
      @click="onShieldClick"
      @pointermove="wake"
    />

    <!--
      Overlay content sits above the shield. Anything interactive in here opts
      back in with pointer-events-auto.

      Hidden outright for the handover rather than faded: the scoreboard sits
      over YouTube's title and the scrim over its bar, and while the player is
      YouTube's it should be all YouTube's.
    -->
    <div v-if="!nativeMode" class="pointer-events-none absolute inset-0">
      <slot name="overlay" :is-fullscreen="isFullscreen" :chrome-visible="chromeVisible" />
    </div>

    <!--
      The way back. It has to be a button, not a key: one click into the iframe
      moves focus across origins and our keydown listener stops hearing
      anything, Escape included.

      Top centre is the one band YouTube leaves empty — its title runs from the
      left, its share buttons sit at the right — and it is far from the settings
      menu, which unfolds from the opposite corner.
    -->
    <button
      v-if="nativeMode"
      type="button"
      data-testid="stage-native-exit"
      class="absolute left-1/2 top-3 z-20 inline-flex min-h-8 -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/70 px-3 font-display text-[0.6875rem] uppercase tracking-[0.1em] text-white/80 backdrop-blur-md transition-[opacity,color,border-color] duration-300 hover:border-accent/60 hover:!opacity-100 hover:text-white focus-visible:!opacity-100"
      :class="nativeExitDim ? 'opacity-15' : 'opacity-100'"
      style="box-shadow: var(--ui-glow-soft)"
      @click="exitNativeMode"
      @pointerenter="wake"
    >
      <Settings :size="13" aria-hidden="true" />
      {{ $t('player.nativeControls') }}
      <X :size="13" aria-hidden="true" />
    </button>

    <p v-if="!videoId" class="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-subtle">
      {{ $t('player.noVideo') }}
    </p>
  </div>
</template>
