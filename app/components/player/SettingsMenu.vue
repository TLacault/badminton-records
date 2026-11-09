<script setup lang="ts">
import { EyeOff, Keyboard, Redo2, SlidersHorizontal, X } from '@lucide/vue'
import { NEVER_STOP, RANGE_STOPS } from '~/composables/usePlayerSettings'

const props = defineProps<{
  /** `player` hides the tagger's scoring and session keys. */
  keybindScope: 'all' | 'player'
  /** Fullscreen with the scrub bar up: the menu sits above it, so it is shorter. */
  raised?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  autoHideStop,
  autoHide,
  skipSeconds,
  chromeHeld,
  setAutoHideStop,
  setSkipSeconds,
} = usePlayerSettings()

// The chrome's idle timer counts pointer movement, and reading a list of
// shortcuts involves none. Held for as long as the menu is mounted, released
// however it closes — Escape, the gear, or the close button.
onMounted(() => {
  chromeHeld.value = true
})
onBeforeUnmount(() => {
  chromeHeld.value = false
})

type SectionId = 'options' | 'keyboard'
const section = ref<SectionId>('options')

const { t } = useI18n()

/**
 * The keyboard section is desktop only. Thirty rebindable shortcuts on a device
 * with no keyboard is a section that can never be used, taking half the tab
 * strip on the screen with the least room for one — so its tab is hidden below
 * `sm`, and with the tab gone the section is unreachable there.
 */
const sections = computed(() => [
  { id: 'options' as const, label: t('player.settingsPlayer'), icon: SlidersHorizontal, desktopOnly: false },
  { id: 'keyboard' as const, label: t('player.settingsKeyboard'), icon: Keyboard, desktopOnly: true },
])

/**
 * `0.5` → `0.5s`, `2` → `2s`. The half-steps need their decimal and the whole
 * ones must not carry a `.0`, or the scale reads as twice as many values.
 */
function secondsLabel(value: number) {
  return `${value}s`
}

const RANGE_LAST = RANGE_STOPS[RANGE_STOPS.length - 1]!

/** The auto-hide scale, plus the "never" stop that sits one step past its top. */
const hideStops = [...RANGE_STOPS, NEVER_STOP]

/**
 * Escape closes the menu before anything else can have the key.
 *
 * Capture phase, and stopped: the stage listens for Escape to leave the
 * YouTube handover, and the pages listen for every bound shortcut. A menu that
 * is open owns the key that closes it.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))

/**
 * A press anywhere but inside the panel closes it, at once.
 *
 * On pointerdown rather than click, so the menu is gone before the press it
 * came with has finished — on a phone that press is usually the video, and
 * watching the rally through a panel for the length of a tap is exactly what
 * this is here to stop. The stage swallows that same press so the video does
 * not also pause under the menu that just closed.
 *
 * The gear is the one thing outside the panel that is spared: it is a toggle,
 * and closing here would let it reopen on the click that follows.
 */
const panel = ref<HTMLElement | null>(null)

function onPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (panel.value?.contains(target)) return
  if (target.closest('[data-settings-trigger]')) return
  emit('close')
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))
</script>

<template>
  <!--
    Anchored to the bar it opened from, and sized to the frame rather than to
    its contents: the keyboard section is thirty rows long and would otherwise
    run off the top of the player.

    `--stage-h` is published by the stage, so the menu can take nearly the whole
    height of whatever player it is drawn in — the frame clips to its rounded
    corners, and a menu taller than the video is a menu with its top cut off.
    The fallback covers the fullscreen case, where there is room to spare.
  -->
  <div
    ref="panel"
    data-testid="settings-menu"
    class="settings-panel dark glass-player pointer-events-auto absolute right-2 z-30 flex w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl text-ink [--glass-bg:rgb(0_0_0/0.62)] sm:right-3 sm:w-[32rem]"
    :class="{ raised }"
    role="dialog"
    :aria-label="$t('player.settings')"
  >
    <!-- On a touch screen the tabs go (one section is left) but the close
         button stays: it is the obvious way out on a device with no Escape. -->
    <div class="flex shrink-0 items-center gap-1 border-b border-line p-1">
      <button
        v-for="s in sections"
        :key="s.id"
        type="button"
        :data-testid="`settings-tab-${s.id}`"
        class="coarse-hide min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em] transition-colors duration-150"
        :class="[
          s.desktopOnly ? 'hidden sm:inline-flex' : 'inline-flex',
          section === s.id ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink',
        ]"
        :aria-pressed="section === s.id"
        @click="section = s.id"
      >
        <component :is="s.icon" :size="13" aria-hidden="true" />
        {{ s.label }}
      </button>
      <button
        type="button"
        data-testid="settings-close"
        class="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-white/10 hover:text-ink"
        :aria-label="$t('player.close')"
        @click="emit('close')"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <template v-if="section === 'options'">
        <!--
          Two durations on the same scale and the same control, because they are
          the same kind of choice. A range rather than a row of chips: ten stops
          is too many to click through, and what is being picked is a length of
          time, which is what a slider is for.
        -->
        <div>
          <div class="flex items-baseline justify-between gap-2">
            <p class="label inline-flex items-center gap-1.5 text-[0.6875rem]">
              <Redo2 :size="12" aria-hidden="true" />
              {{ $t('player.skipBy') }}
            </p>
            <span
              data-testid="skip-value"
              class="font-mono text-xs tabular-nums text-accent"
            >{{ secondsLabel(skipSeconds) }}</span>
          </div>

          <input
            data-testid="skip-range"
            type="range"
            class="player-range mt-2 w-full"
            :min="RANGE_STOPS[0]"
            :max="RANGE_LAST"
            :step="0.5"
            :value="skipSeconds"
            :aria-label="$t('player.skipBy')"
            @input="setSkipSeconds(Number(($event.target as HTMLInputElement).value))"
          >

          <div class="coarse-hide mt-1 flex items-center justify-between">
            <span
              v-for="stop in RANGE_STOPS"
              :key="stop"
              class="h-1 w-px"
              :class="stop <= skipSeconds ? 'bg-accent/70' : 'bg-line-strong'"
              aria-hidden="true"
            />
          </div>
          <div class="coarse-hide flex items-center justify-between font-mono text-[0.625rem] text-ink-subtle">
            <span>{{ secondsLabel(RANGE_STOPS[0]!) }}</span>
            <span>{{ secondsLabel(RANGE_LAST) }}</span>
          </div>
        </div>

        <!--
          "Never" is the last stop rather than a button beside the slider. It is
          an answer to the same question — how long should the chrome stay? —
          and the longest possible answer belongs at the long end of the scale.
        -->
        <div class="mt-4 border-t border-line pt-3">
          <div class="flex items-baseline justify-between gap-2">
            <p class="label inline-flex items-center gap-1.5 text-[0.6875rem]">
              <EyeOff :size="12" aria-hidden="true" />
              {{ $t('player.hideAfter') }}
            </p>
            <span
              data-testid="autohide-value"
              class="font-mono text-xs tabular-nums"
              :class="autoHide ? 'text-accent' : 'text-ink-subtle'"
            >{{ autoHide ? secondsLabel(autoHideStop) : $t('player.never') }}</span>
          </div>

          <input
            data-testid="autohide-range"
            type="range"
            class="player-range mt-2 w-full"
            :min="RANGE_STOPS[0]"
            :max="NEVER_STOP"
            :step="0.5"
            :value="autoHideStop"
            :aria-label="$t('player.hideAfter')"
            @input="setAutoHideStop(Number(($event.target as HTMLInputElement).value))"
          >

          <div class="coarse-hide mt-1 flex items-center justify-between">
            <span
              v-for="stop in hideStops"
              :key="stop"
              class="w-px"
              :class="[
                stop === NEVER_STOP ? 'h-1.5' : 'h-1',
                stop <= autoHideStop ? 'bg-accent/70' : 'bg-line-strong',
              ]"
              aria-hidden="true"
            />
          </div>
          <div class="coarse-hide flex items-center justify-between font-mono text-[0.625rem] text-ink-subtle">
            <span>{{ secondsLabel(RANGE_STOPS[0]!) }}</span>
            <span>{{ $t('player.never') }}</span>
          </div>
        </div>
      </template>

      <PlayerKeyHelp v-else embedded :scope="props.keybindScope" />
    </div>
  </div>
</template>

<style scoped>
/*
 * The panel is bounded by the player it is drawn in, because the frame clips to
 * its rounded corners and a menu taller than the video is a menu with its top
 * cut off. `--stage-h` is published by the stage, since how tall the video is
 * depends on the column it was given and no media query can name that.
 *
 * On a phone the video is barely two hundred pixels tall, so the panel is
 * anchored over the control bar rather than above it — that bar is a third of
 * the height available, and the menu covering it while it is open costs
 * nothing. On a desktop there is room, and sitting above the bar leaves the
 * controls readable while the menu is up.
 */
.settings-panel {
  bottom: 0.25rem;
  max-height: min(calc(var(--stage-h, 40rem) - 1.25rem), 34rem);
}

@media (min-width: 640px) {
  .settings-panel {
    bottom: 100%;
    margin-bottom: 0.25rem;
    max-height: min(calc(var(--stage-h, 40rem) - 4.5rem), 34rem);
  }

  /* Above the fullscreen scrub bar as well as the control bar. */
  .settings-panel.raised {
    max-height: min(calc(var(--stage-h, 40rem) - 8rem), 34rem);
  }
}

/*
 * A touch screen gets the two sliders alone: the keyboard tab has no keyboard
 * to serve, and the tick rows repeat the
 * value printed beside each label. Scoped selectors outrank the width
 * utilities, so the narrow panel holds in landscape too.
 */
@media (pointer: coarse) {
  .settings-panel {
    width: min(15rem, calc(100vw - 1.5rem));
  }

  .coarse-hide {
    display: none !important;
  }
}

/*
 * A range that matches the rest of the chrome rather than the operating
 * system's. Written out per engine because a range input has no single
 * cross-browser hook for its track and thumb.
 */
.player-range {
  -webkit-appearance: none;
  appearance: none;
  height: 1.25rem;
  background: transparent;
  cursor: pointer;
}

.player-range::-webkit-slider-runnable-track {
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-line-strong);
}

.player-range::-moz-range-track {
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-line-strong);
}

.player-range::-moz-range-progress {
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-accent);
}

.player-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0.875rem;
  height: 0.875rem;
  margin-top: -0.3125rem;
  border-radius: 999px;
  background: var(--ui-accent);
  box-shadow: var(--ui-glow-soft);
}

.player-range::-moz-range-thumb {
  width: 0.875rem;
  height: 0.875rem;
  border: 0;
  border-radius: 999px;
  background: var(--ui-accent);
  box-shadow: var(--ui-glow-soft);
}
</style>
