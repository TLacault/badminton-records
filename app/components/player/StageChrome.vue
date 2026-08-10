<script setup lang="ts">
import { Volume1, Volume2, VolumeX } from '@lucide/vue'

defineProps<{
  /** Fades with the rest of the video chrome. */
  chromeVisible: boolean
  /** Armed by the T shortcut; null when the match has nothing to draw. */
  timelineVisible: boolean
  /** 0–100, or null when no shortcut has touched the volume recently. */
  volumeFlash: number | null
}>()
</script>

<template>
  <!--
    The overlay furniture that is not the scoreboard: the timeline strip along
    the bottom and the volume readout.

    The timeline lives here rather than under the video because in fullscreen
    there is no "under the video" — and a seek bar you cannot reach without
    leaving fullscreen is not a seek bar.
  -->
  <div
    v-if="timelineVisible"
    data-testid="stage-timeline"
    class="pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-2 transition-opacity duration-200"
    :class="chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    :aria-hidden="!chromeVisible"
  >
    <slot name="timeline" />
  </div>

  <!--
    Volume has no other feedback: the change happens inside a cross-origin
    iframe whose own indicator we never see, so without this the key feels
    dead. Centred and brief, the way a television does it.
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
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-150"
          :style="{ width: `${volumeFlash}%` }"
        />
      </div>
      <span class="w-9 text-right font-mono text-xs tabular-nums text-white">{{ volumeFlash }}%</span>
    </div>
  </Transition>
</template>
