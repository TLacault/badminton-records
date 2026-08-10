<script setup lang="ts">
import {
  Gauge,
  Maximize,
  Minimize,
  Pause,
  Play,
  Rewind,
  Volume1,
  Volume2,
  VolumeX,
} from '@lucide/vue'

const props = defineProps<{
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
}>()

const emit = defineEmits<{
  toggle: []
  toggleFullscreen: []
  setRate: [rate: number]
}>()

/**
 * YouTube's own resolution names. Shown because it can be shown — the level
 * cannot be chosen: setPlaybackQuality is ignored by YouTube now, whatever
 * you pass it. Speed is the control that still works, so speed is the control
 * we offer.
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
      The scrub bar, and only in fullscreen: windowed, the same timeline sits
      under the player where there is room to read it, and two of them would
      be one too many.
    -->
    <div v-if="isFullscreen && timelineVisible" class="px-3 pb-1.5">
      <slot name="timeline" />
    </div>

    <div class="flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
      <button
        type="button"
        data-testid="control-play"
        class="grid size-9 shrink-0 place-items-center rounded-lg text-white transition-colors duration-150 hover:text-accent"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="emit('toggle')"
      >
        <component :is="isPlaying ? Pause : Play" :size="20" :fill="isPlaying ? 'none' : 'currentColor'" aria-hidden="true" />
      </button>

      <p data-testid="control-time" class="shrink-0 font-mono text-xs tabular-nums text-white/90">
        {{ clock(currentTime) }} <span class="text-white/50">/ {{ clock(duration) }}</span>
      </p>

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <span
          v-if="qualityLabel"
          data-testid="control-quality"
          class="rounded border border-white/25 px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums text-white/70"
          title="Current quality. YouTube no longer allows this to be chosen."
        >{{ qualityLabel }}</span>

        <div class="relative">
          <button
            type="button"
            data-testid="control-rate"
            class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-xs tabular-nums text-white transition-colors duration-150 hover:text-accent"
            :aria-expanded="rateOpen"
            aria-label="Playback speed"
            @click="rateOpen = !rateOpen"
          >
            <Gauge :size="15" aria-hidden="true" />
            {{ rateLabel(rate) }}
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
          class="grid size-9 place-items-center rounded-lg text-white transition-colors duration-150 hover:text-accent"
          :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="emit('toggleFullscreen')"
        >
          <component :is="isFullscreen ? Minimize : Maximize" :size="18" aria-hidden="true" />
        </button>
      </div>
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
