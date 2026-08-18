<script setup lang="ts">
import { Settings, X } from '@lucide/vue'
// Named explicitly rather than auto-imported: the template reads the rate.
import { BOOST_RATE, useSpeedBoost } from '~/composables/useSpeedBoost'

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
const { autoHide, autoHideMs, chromeHeld, menuOpen } = usePlayerSettings()
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

/**
 * A cursor leaving the frame means the viewer looked away. A finger leaving it
 * means the tap ended, which is the opposite — it is the moment they are most
 * likely to be reaching for the bar they just asked for.
 *
 * iOS fires pointerenter, pointermove and pointerleave around every single
 * tap, so treating a touch like a cursor made the chrome flash up and vanish
 * inside one tap: the whole overlay was unusable on a phone. On touch the
 * chrome only ever goes on the idle timer.
 */
function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  sleep()
}

function onHover(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  wake()
}

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
})

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
 * The gesture layer: tap, double tap on an edge, and hold.
 *
 * Everything is decided on pointerup rather than on click, because a press
 * that lasts half a second is a hold and must not also land as a tap. Lifting
 * the finger is the natural end of the gesture, so nothing feels delayed.
 *
 *   tap      centre  play / pause — or, on a phone with the bar down, bring it up
 *   tap ×2   edge    skip back or forward by the viewer's own distance
 *   hold     any     double speed for as long as it is held
 *
 * The edges are the phone convention and they earn their place on a desktop
 * too: the video is the biggest target on the page and the seek keys are not
 * reachable from a couch.
 */
const DOUBLE_TAP_MS = 260
const EDGE_FRACTION = 0.3
/** Past this the finger was dragged, and a drag is not a press. */
const DRAG_SLOP_PX = 12

const boost = useSpeedBoost({
  rate: () => api.rate.value,
  setRate: value => api.setRate(value),
  isPlaying: () => api.isPlaying.value,
})

let tapTimer: ReturnType<typeof setTimeout> | null = null
let lastTapAt = 0
let lastTapZone: -1 | 0 | 1 = 0
let pressed = false
let dragged = false
let downX = 0
let downY = 0
/** Set when the press was spent closing the settings menu. */
let swallowed = false

function zoneAt(clientX: number): -1 | 0 | 1 {
  const rect = frame.value?.getBoundingClientRect()
  if (!rect || !rect.width) return 0
  const ratio = (clientX - rect.left) / rect.width
  if (ratio < EDGE_FRACTION) return -1
  if (ratio > 1 - EDGE_FRACTION) return 1
  return 0
}

function handleTap(zone: -1 | 0 | 1, touch: boolean) {
  const now = Date.now()
  // Paired by the clock rather than by a pending timer: on a phone the first
  // tap often only raises the chrome, and a double tap has to be heard through
  // that too.
  const double = now - lastTapAt < DOUBLE_TAP_MS && zone === lastTapZone
  lastTapAt = now
  lastTapZone = zone
  if (tapTimer) {
    clearTimeout(tapTimer)
    tapTimer = null
  }

  if (double && zone !== 0) {
    emit('nudge', zone)
    wake()
    return
  }

  // A finger reaching for a bar that is not there is asking for the bar, not
  // for a pause. With a mouse the same tap is unambiguous, because the chrome
  // is already up: it comes back on the first movement.
  if (touch && !chromeVisible.value) {
    wake()
    return
  }

  if (zone === 0) {
    api.toggle()
    wake()
    return
  }

  // On an edge a single tap and a double tap mean different things, so the
  // single one cannot run until the second is ruled out.
  tapTimer = setTimeout(() => {
    tapTimer = null
    api.toggle()
    wake()
  }, DOUBLE_TAP_MS)
}

function onPointerDown(event: PointerEvent) {
  pressed = true
  dragged = false
  downX = event.clientX
  downY = event.clientY
  wake()

  // An open menu owns the next press anywhere else on the player: it closes,
  // and the rally underneath carries on rather than being paused by the same
  // tap.
  swallowed = menuOpen.value
  if (swallowed) {
    menuOpen.value = false
    return
  }

  boost.arm()
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'touch') wake()
  if (!pressed || dragged) return
  if (Math.abs(event.clientX - downX) > DRAG_SLOP_PX
    || Math.abs(event.clientY - downY) > DRAG_SLOP_PX) {
    dragged = true
    boost.release()
  }
}

function onPointerUp(event: PointerEvent) {
  if (!pressed) return
  pressed = false
  // A hold has already done its work; the tap it would have been is spent.
  if (boost.release() || swallowed || dragged) return
  handleTap(zoneAt(event.clientX), event.pointerType === 'touch')
}

function onPointerCancel() {
  pressed = false
  boost.release()
}

onBeforeUnmount(() => {
  if (tapTimer) clearTimeout(tapTimer)
})

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

defineExpose({
  ...api,
  isFullscreen,
  toggleFullscreen,
  wake,
  nativeMode,
  enterNativeMode,
  exitNativeMode,
  // The play/pause key holds the same boost the finger does, from the page
  // that owns the keyboard.
  armBoost: boost.arm,
  releaseBoost: boost.release,
})
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
    @pointerenter="onHover"
    @pointermove="onHover"
    @pointerleave="onPointerLeave"
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
      class="stage-shield absolute inset-0 h-full w-full cursor-default"
      :aria-label="$t('player.shieldHint')"
      tabindex="-1"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @contextmenu.prevent
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

    <!--
      What a held press is doing. Drawn here rather than in the control bar
      because the bar may well have idled out under the finger holding it, and
      a video that silently doubles its speed reads as a broken player.
    -->
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-200"
      leave-to-class="opacity-0"
    >
      <p
        v-if="boost.boosting.value"
        data-testid="stage-boost"
        class="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full border border-white/25 bg-black/70 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md"
        role="status"
      >
        {{ BOOST_RATE }}× {{ $t('player.speed') }}
      </p>
    </Transition>

    <p v-if="!videoId" class="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-subtle">
      {{ $t('player.noVideo') }}
    </p>
  </div>
</template>

<style scoped>
/*
 * A press on the shield is held for half a second at a time, which is exactly
 * what iOS answers with a selection callout and a magnifier. `manipulation`
 * also drops the 300ms click delay the double-tap zones would otherwise wait
 * through.
 */
.stage-shield {
  touch-action: manipulation;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
