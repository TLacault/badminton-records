<script setup lang="ts">
import {
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
  quality: string | null
  /** Armed by the T shortcut. */
  timelineVisible: boolean
  volumeFlash: number | null
  rateFlash: number | null
  seekFlash: -1 | 1 | null
  jumpFlash: string | null
  /** `player` hides the tagger's scoring and session keys in the settings menu. */
  keybindScope?: 'all' | 'player'
}>(), { keybindScope: 'player' })

const emit = defineEmits<{
  toggle: []
  toggleFullscreen: []
  setRate: [rate: number]
  /** Stand our layer down so YouTube's own settings menu can be reached. */
  nativeControls: []
}>()

/**
 * YouTube's own resolution names. The level cannot be set through the API —
 * setPlaybackQuality is ignored now, whatever you pass it — so the chip below
 * hands the player back to YouTube instead of trying.
 */
const QUALITY_LABELS: Record<string, string> = {
  tiny: '144p',
  small: '240p',
  medium: '360p',
  large: '480p',
  hd720: '720p',
  hd1080: '1080p',
  hd1440: '1440p',
  hd2160: '4K',
}

const qualityLabel = computed(() =>
  props.quality ? QUALITY_LABELS[props.quality] ?? props.quality : null,
)

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
 * its trigger gone is furniture nobody asked for. Handing the player to YouTube
 * closes it too, since our layer is standing down.
 */
const settingsOpen = ref(false)

watch(() => props.chromeVisible, (visible) => {
  if (!visible) settingsOpen.value = false
})

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) rateOpen.value = false
}

function handOver() {
  settingsOpen.value = false
  emit('nativeControls')
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
      The scrim. It is what makes white text over a bright rally readable, the
      way every video player does it — and it is also what buries YouTube's own
      bottom bar, which sits in exactly this band of the frame and cannot be
      asked to leave. Solid at the floor, gone by the top.
    -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black from-15% via-black/60 to-transparent"
      :class="isFullscreen ? 'h-44' : 'h-32'"
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
        <!--
          The settings button, immediately left of the quality chip: the two
          neighbouring things that change how the player behaves rather than
          what it is doing.
        -->
        <button
          type="button"
          data-testid="control-settings"
          class="grid size-8 place-items-center rounded-lg text-white transition-[color,transform] duration-150 hover:text-accent sm:size-9"
          :class="settingsOpen ? 'rotate-45 text-accent' : ''"
          :aria-expanded="settingsOpen"
          :aria-label="$t('player.settings')"
          @click="toggleSettings"
        >
          <Settings :size="17" aria-hidden="true" class="sm:size-[18px]" />
        </button>

        <!--
          The chip is the trigger, because it already names the thing you came
          for. Clicking it stands our whole layer down and gives the frame back
          to YouTube, whose settings menu is the only place quality can still
          be picked.
        -->
        <!-- Always here, label or not: quality only reports once a stream is
             flowing, and a paused player must not be a player with no way in. -->
        <button
          type="button"
          data-testid="control-quality"
          class="inline-grid min-h-8 min-w-8 place-items-center rounded border border-white/25 px-1 font-mono text-[0.5625rem] tabular-nums text-white/70 transition-colors duration-150 hover:border-accent/60 hover:text-white sm:min-h-9 sm:min-w-9 sm:px-1.5 sm:text-[0.625rem]"
          :title="$t('player.qualityHint')"
          :aria-label="$t('player.qualityHint')"
          @click="emit('nativeControls')"
        >
          <template v-if="qualityLabel">{{ qualityLabel }}</template>
          <MonitorCog v-else :size="13" aria-hidden="true" />
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
            class="absolute bottom-full right-0 mb-1.5 max-h-56 overflow-y-auto rounded-lg p-1 glass-menu"
            role="listbox"
          >
            <li v-for="value in rates" :key="value">
              <button
                type="button"
                role="option"
                :aria-selected="value === rate"
                class="w-full rounded-md px-3 py-1.5 text-right font-mono text-xs tabular-nums transition-colors duration-100 hover:bg-accent-soft hover:text-accent"
                :class="value === rate ? 'text-accent' : 'text-ink-muted'"
                @click="pickRate(value)"
              >
                {{ rateLabel(value) }}
              </button>
            </li>
          </ul>
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

      <!--
        Anchored to the bar rather than to the gear it opens from: measured
        from the gear's own right edge, a menu wider than the space left of it
        runs off the side of the player and into the frame's clip.
      -->
      <PlayerSettingsMenu
        v-if="settingsOpen"
        :rate="rate"
        :rates="rates"
        :quality-label="qualityLabel"
        :keybind-scope="keybindScope"
        @set-rate="value => emit('setRate', value)"
        @native-controls="handOver"
        @close="settingsOpen = false"
      />
    </div>
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
      <span class="font-mono text-xs tabular-nums text-white">5s</span>
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
