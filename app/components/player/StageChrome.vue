<script setup lang="ts">
import {
  CircleHelp,
  Gauge,
  Maximize,
  Minimize,
  MonitorCog,
  Pause,
  Play,
  Rewind,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from '@lucide/vue'

const props = withDefaults(defineProps<{
  /** Fades with the rest of the video chrome. */
  chromeVisible: boolean
  isFullscreen: boolean
  isPlaying: boolean
  currentTime: number
  duration: number
  rate: number
  rates: number[]
  volume: number
  muted: boolean
  /** Armed by the T shortcut. */
  timelineVisible: boolean
  volumeFlash: number | null
  rateFlash: number | null
  seekFlash: -1 | 1 | null
  jumpFlash: string | null
  /** `player` hides the tagger's scoring and session keys in the settings menu. */
  keybindScope?: 'all' | 'player'
  /** Shows the button that reopens the player tour, where a page renders one. */
  guide?: boolean
}>(), { keybindScope: 'player', guide: false })

const playerGuide = usePlayerGuide()

const emit = defineEmits<{
  toggle: []
  toggleFullscreen: []
  setRate: [rate: number]
  setVolume: [level: number]
  toggleMute: []
  /** Stand our layer down so YouTube's own settings menu can be reached. */
  nativeControls: []
}>()

/** Muted reads as zero on the bar, whatever level it will come back at. */
const shownVolume = computed(() => (props.muted ? 0 : props.volume))

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

// The nudge arrows are drawn with their distance on them, and that distance is
// now the viewer's rather than a constant.
const { skipSeconds, menuOpen } = usePlayerSettings()

const rateOpen = ref(false)
function pickRate(value: number) {
  emit('setRate', value)
  rateOpen.value = false
}

/** `1×` reads better than `1x`, and `0.5×` needs no trailing zero. */
function rateLabel(value: number) {
  return `${value}×`
}

/**
 * The settings menu, and the one rule that keeps it usable: it closes when the
 * chrome goes.
 *
 * The bar fades on an idle timer, and a menu left hanging over the video with
 * its trigger gone is furniture nobody asked for.
 */
const settingsOpen = menuOpen

watch(() => props.chromeVisible, (visible) => {
  if (!visible) settingsOpen.value = false
})

// A menu is a state of this player, not of the app: leaving the page with one
// open must not bring it back open on the next.
onBeforeUnmount(() => {
  settingsOpen.value = false
})

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) rateOpen.value = false
}
</script>

<template>
  <!--
    Everything YouTube's own bar used to do, in our styling, because its bar is
    gone: controls:0 leaves no play button, no progress and no fullscreen.

    The whole unit fades as one — bar and timeline together — the way video
    chrome should, so watching is never done through a layer of furniture.
  -->
  <div
    data-testid="stage-controls"
    class="absolute inset-x-0 bottom-0 transition-opacity duration-200"
    :class="chromeVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
    :aria-hidden="!chromeVisible"
  >
    <!--
      The scrim: what keeps white text readable over a bright rally, and what
      buries the bits of YouTube's own UI that surface in this band (its logo,
      "More videos") — dark at the floor and blurred, so nothing there reads as
      a second set of controls. The blur fades out with the same mask as the
      shade, so the top edge never shows.
    -->
    <div
      class="stage-scrim pointer-events-none absolute inset-x-0 bottom-0"
      :class="isFullscreen ? 'h-48' : 'h-36'"
      aria-hidden="true"
    />

    <!--
      The scrub bar, and only in fullscreen: windowed, the same timeline sits
      under the player where there is room to read it, and two of them would
      be one too many.

      Pushed down into the bar's own top padding, over the line YouTube draws
      its progress on: one scrub bar in that band, and it should be ours.
    -->
    <!-- z-10 because it now hangs over the bar's padding: without it the bar
         would take the clicks meant for the bottom of the scrub track. -->
    <div v-if="isFullscreen && timelineVisible" class="relative z-10 translate-y-5 px-3 pb-1.5">
      <slot name="timeline" />
    </div>

    <!--
      Tighter on a phone throughout: gap-1.5 rather than gap-3, smaller glyphs,
      and the speed chip drops its number. A control bar sized for a desktop
      wraps to two lines at 360px, and a wrapped bar covers the rally.
    -->
    <div class="relative flex items-center gap-1.5 px-2 pb-2 pt-6 sm:gap-3 sm:px-3">
      <button
        type="button"
        data-testid="control-play"
        class="grid size-8 shrink-0 place-items-center rounded-lg text-white transition-colors duration-150 hover:text-accent sm:size-9"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="emit('toggle')"
      >
        <component :is="isPlaying ? Pause : Play" :size="18" :fill="isPlaying ? 'none' : 'currentColor'" aria-hidden="true" class="sm:size-5" />
      </button>

      <p data-testid="control-time" class="shrink-0 font-mono text-[0.6875rem] tabular-nums text-white/90 sm:text-xs">
        {{ clock(currentTime) }} <span class="text-white/50">/ {{ clock(duration) }}</span>
      </p>

      <div class="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button
          v-if="guide"
          type="button"
          data-testid="control-guide"
          class="grid size-8 place-items-center rounded-lg text-white transition-colors duration-150 hover:text-accent sm:size-9"
          :aria-label="$t('guide.open')"
          :title="$t('guide.open')"
          @click="playerGuide.start()"
        >
          <CircleHelp :size="17" aria-hidden="true" class="sm:size-[18px]" />
        </button>

        <button
          type="button"
          data-testid="control-settings"
          data-settings-trigger
          class="grid size-8 place-items-center rounded-lg text-white transition-[color,transform] duration-150 hover:text-accent sm:size-9"
          :class="settingsOpen ? 'rotate-45 text-accent' : ''"
          :aria-expanded="settingsOpen"
          :aria-label="$t('player.settings')"
          @click="toggleSettings"
        >
          <Settings :size="17" aria-hidden="true" class="sm:size-[18px]" />
        </button>

        <div class="relative">
          <button
            type="button"
            data-testid="control-rate"
            class="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 font-mono text-xs tabular-nums text-white transition-colors duration-150 hover:text-accent sm:min-h-9 sm:px-2"
            :aria-expanded="rateOpen"
            aria-label="Playback speed"
            @click="rateOpen = !rateOpen"
          >
            <Gauge :size="15" aria-hidden="true" />
            <!-- The number is the label; on a phone the glyph carries it alone
                 unless the speed is not 1×, which is worth saying. -->
            <span :class="rate === 1 ? 'hidden sm:inline' : ''">{{ rateLabel(rate) }}</span>
          </button>

          <ul
            v-if="rateOpen"
            class="dark glass-player absolute bottom-full right-0 z-30 mb-1.5 rounded-lg p-1 [--glass-bg:rgb(0_0_0/0.62)]"
            role="listbox"
          >
            <li v-for="value in rates" :key="value">
              <button
                type="button"
                role="option"
                :aria-selected="value === rate"
                class="w-full rounded-md px-3 py-1 text-right font-mono text-xs tabular-nums transition-colors duration-100 hover:bg-accent-soft hover:text-accent"
                :class="value === rate ? 'text-accent' : 'text-ink-muted'"
                @click="pickRate(value)"
              >
                {{ rateLabel(value) }}
              </button>
            </li>
          </ul>
        </div>

        <!--
          Mute on the glyph, level on the slider beside it. The slider opens on
          hover or focus with a mouse; a phone has hardware keys for the level,
          so there the glyph alone mutes.
        -->
        <div class="group/volume flex items-center">
          <button
            type="button"
            data-testid="control-volume"
            class="grid size-8 place-items-center rounded-lg text-white transition-colors duration-150 hover:text-accent sm:size-9"
            :aria-label="muted ? $t('player.unmute') : $t('player.mute')"
            @click="emit('toggleMute')"
          >
            <component
              :is="shownVolume === 0 ? VolumeX : shownVolume < 50 ? Volume1 : Volume2"
              :size="17"
              aria-hidden="true"
              class="sm:size-[18px]"
            />
          </button>
          <input
            data-testid="control-volume-range"
            type="range"
            min="0"
            max="100"
            step="1"
            :value="shownVolume"
            :aria-label="$t('player.volume')"
            class="volume-range w-0 cursor-pointer opacity-0 transition-[width,opacity,margin] duration-200 ease-out group-hover/volume:mr-1 group-hover/volume:w-20 group-hover/volume:opacity-100 group-focus-within/volume:mr-1 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100"
            @input="emit('setVolume', Number(($event.target as HTMLInputElement).value))"
          >
        </div>

        <button
          type="button"
          data-testid="control-fullscreen"
          class="grid size-8 place-items-center rounded-lg text-white transition-colors duration-150 hover:text-accent sm:size-9"
          :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="emit('toggleFullscreen')"
        >
          <component :is="isFullscreen ? Minimize : Maximize" :size="17" aria-hidden="true" class="sm:size-[18px]" />
        </button>
      </div>

    </div>

    <!--
      Anchored to the whole chrome rather than to the gear or the bar: from the
      gear a wide menu runs off the side of the frame, and from the bar it
      lands on the fullscreen timeline. Two glass layers stacked also make
      Chrome drop the blur on one of them, so it never overlaps the scrub bar.
    -->
    <PlayerSettingsMenu
      v-if="settingsOpen"
      :keybind-scope="keybindScope"
      :raised="isFullscreen && timelineVisible"
      @close="settingsOpen = false"
    />
  </div>

  <!--
    YouTube's own corner: in some states the embed draws its volume, CC and
    gear at the top right, which our shield makes dead to clicks. Covered by a
    glass button that does the one thing those icons promise — opens YouTube's
    menu, through the handover, for quality and captions.
  -->
  <div
    class="absolute right-1.5 top-1.5 transition-opacity duration-200 sm:right-3 sm:top-3"
    :class="chromeVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
  >
    <button
      type="button"
      data-testid="control-youtube"
      class="glass-player inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-white/85 transition-colors duration-150 hover:border-white/30 hover:text-white sm:min-h-10 sm:min-w-44 sm:justify-center sm:px-3.5"
      :aria-label="$t('player.youtubeSettings')"
      :title="$t('player.youtubeSettings')"
      @click="emit('nativeControls')"
    >
      <MonitorCog :size="15" aria-hidden="true" />
      <span class="hidden sm:inline">{{ $t('player.youtubeSettings') }}</span>
    </button>
  </div>

  <!--
    Acknowledgements. Volume and speed happen inside a cross-origin iframe
    whose own indicator we never see, and a seek of five seconds can be
    invisible on a static shot — without these the keys feel dead.
  -->
  <Transition
    enter-active-class="transition duration-150"
    enter-from-class="opacity-0 scale-95"
    leave-active-class="transition duration-300"
    leave-to-class="opacity-0"
  >
    <div
      v-if="volumeFlash !== null"
      data-testid="stage-volume"
      class="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-xl border border-white/25 bg-black/70 px-4 py-3 backdrop-blur-md"
      style="box-shadow: var(--ui-glow-soft)"
      role="status"
      aria-live="polite"
    >
      <component
        :is="volumeFlash === 0 ? VolumeX : volumeFlash < 50 ? Volume1 : Volume2"
        :size="18"
        class="shrink-0 text-white"
        aria-hidden="true"
      />
      <div class="h-1.5 w-28 overflow-hidden rounded-full bg-white/25">
        <div class="h-full rounded-full bg-accent transition-[width] duration-150" :style="{ width: `${volumeFlash}%` }" />
      </div>
      <span class="w-9 text-right font-mono text-xs tabular-nums text-white">{{ volumeFlash }}%</span>
    </div>
  </Transition>

  <!-- Seek, the way YouTube does it: a nudge on the side you moved towards. -->
  <Transition
    enter-active-class="transition duration-100"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-300"
    leave-to-class="opacity-0"
  >
    <div
      v-if="seekFlash !== null"
      data-testid="stage-seek"
      class="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/60 px-4 py-3 backdrop-blur-sm"
      :class="seekFlash === -1 ? 'left-[12%]' : 'right-[12%]'"
      role="status"
    >
      <Rewind
        :size="18"
        class="text-white"
        :class="seekFlash === 1 ? 'rotate-180' : ''"
        fill="currentColor"
        aria-hidden="true"
      />
      <span class="font-mono text-xs tabular-nums text-white">{{ skipSeconds }}s</span>
    </div>
  </Transition>

  <Transition
    enter-active-class="transition duration-150"
    enter-from-class="opacity-0 -translate-y-1"
    leave-active-class="transition duration-300"
    leave-to-class="opacity-0"
  >
    <div
      v-if="rateFlash !== null || jumpFlash !== null"
      data-testid="stage-toast"
      class="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg border border-white/25 bg-black/70 px-3 py-1.5 font-display text-xs uppercase tracking-[0.1em] text-white backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      {{ rateFlash !== null ? `${rateLabel(rateFlash)} speed` : jumpFlash }}
    </div>
  </Transition>
</template>

<style scoped>
/* The bar's own range: white thumb on a thin track, nothing of the OS's. */
.volume-range {
  -webkit-appearance: none;
  appearance: none;
  height: 1.25rem;
  background: transparent;
}
.volume-range::-webkit-slider-runnable-track {
  height: 0.1875rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.3);
}
.volume-range::-moz-range-track {
  height: 0.1875rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.3);
}
.volume-range::-moz-range-progress {
  height: 0.1875rem;
  border-radius: 999px;
  background: var(--ui-accent);
}
.volume-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0.75rem;
  height: 0.75rem;
  margin-top: -0.28125rem;
  border-radius: 999px;
  background: #fff;
}
.volume-range::-moz-range-thumb {
  width: 0.75rem;
  height: 0.75rem;
  border: 0;
  border-radius: 999px;
  background: #fff;
}

.stage-scrim {
  background: linear-gradient(to top, rgb(0 0 0 / 0.85) 0%, rgb(0 0 0 / 0.6) 45%, transparent 100%);
  backdrop-filter: blur(10px);
  mask-image: linear-gradient(to top, #000 55%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, #000 55%, transparent 100%);
}

/* A phone sets its level with hardware keys; the glyph alone mutes there. */
@media (pointer: coarse) {
  .volume-range {
    display: none;
  }
}
</style>
