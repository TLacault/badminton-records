<script setup lang="ts">
import type { ReelMusic, ReelTrack } from '~~/shared/reel'
import { Music, Upload, Wand2, X } from '@lucide/vue'

/**
 * The song, and which part of it the reel gets.
 *
 * The window is the interesting control. A compilation is however long it is —
 * nineteen seconds, two minutes — and the song is not, so something has to
 * choose the slice. Auto-fit puts it on the loudest stretch that is exactly
 * long enough, which lands on the chorus in most of what anyone cuts to; the
 * waveform is there so that when it lands somewhere wrong you can see why and
 * drag it.
 */

const props = defineProps<{
  music: ReelMusic
  track: ReelTrack | null
  /** How many seconds of song the reel needs. */
  need: number
  canDownload: boolean
  importing: boolean
  progress: number | null
  error: string | null
  matchAudio: number
}>()

const emit = defineEmits<{
  import: [url: string]
  attach: [file: File]
  autoFit: []
  patch: [patch: Partial<ReelMusic>]
  matchAudio: [value: number]
  clear: []
}>()

const url = ref(props.music.url)
watch(() => props.music.url, value => { url.value = value })

const duration = computed(() => props.track?.duration ?? props.music.duration)
const hasTrack = computed(() => props.music.kind !== 'none')

/** ~180 bars however long the track is: more than that is a grey block. */
const bars = computed(() => {
  const peaks = props.track?.peaks ?? []
  if (!peaks.length) return []
  const width = Math.max(1, Math.ceil(peaks.length / 180))
  const out: number[] = []
  for (let i = 0; i < peaks.length; i += width) {
    out.push(Math.max(...peaks.slice(i, i + width)))
  }
  const ceiling = Math.max(...out, 0.0001)
  return out.map(value => value / ceiling)
})

const windowStyle = computed(() => {
  if (!duration.value) return { left: '0%', width: '0%' }
  return {
    left: `${Math.min(100, (props.music.startAt / duration.value) * 100)}%`,
    width: `${Math.min(100 - (props.music.startAt / duration.value) * 100, (props.need / duration.value) * 100)}%`,
  }
})

const wave = ref<HTMLElement | null>(null)
const dragging = ref(false)

/** Dragging moves the window's centre to the pointer, clamped to the track. */
function moveWindow(event: PointerEvent) {
  const rect = wave.value?.getBoundingClientRect()
  if (!rect?.width || !duration.value) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const centred = ratio * duration.value - props.need / 2
  const startAt = Math.min(Math.max(0, centred), Math.max(0, duration.value - props.need))
  emit('patch', { startAt: Math.round(startAt * 100) / 100, autoFit: false })
}

function onDown(event: PointerEvent) {
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  moveWindow(event)
}
function onMove(event: PointerEvent) {
  if (dragging.value) moveWindow(event)
}
function onUp() {
  dragging.value = false
}

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('attach', file)
}

function clock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <form class="flex gap-2" @submit.prevent="emit('import', url)">
      <input
        v-model="url"
        type="url"
        inputmode="url"
        class="field !min-h-10 flex-1 !text-sm"
        :placeholder="$t('reel.musicPlaceholder')"
        :aria-label="$t('reel.musicUrl')"
      >
      <button type="submit" class="btn btn-primary btn-sm shrink-0" :disabled="importing || !url.trim()">
        <Music :size="15" aria-hidden="true" />
        {{ importing ? $t('reel.importing') : $t('reel.import') }}
      </button>
    </form>

    <p v-if="!canDownload" class="mt-2 text-xs text-ink-subtle">
      {{ $t('reel.musicNoHost') }}
    </p>

    <div v-if="importing" class="mt-3 h-1 overflow-hidden rounded-full bg-bg-deep">
      <div
        class="h-full rounded-full bg-accent transition-[width] duration-300"
        :style="{ width: `${Math.round((progress ?? 0) * 100)}%` }"
      />
    </div>

    <p v-if="error" class="mt-2 text-xs text-accent">
      {{ error }}
    </p>

    <label class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-accent">
      <Upload :size="14" aria-hidden="true" />
      {{ $t('reel.musicFile') }}
      <input type="file" accept="audio/*" class="sr-only" @change="onFile">
    </label>

    <template v-if="hasTrack">
      <div class="mt-4 flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
          {{ music.title || $t('reel.untitledTrack') }}
        </p>
        <span class="shrink-0 font-mono text-xs tabular-nums text-ink-subtle">{{ clock(duration) }}</span>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:text-accent"
          :aria-label="$t('reel.removeMusic')"
          @click="emit('clear')"
        >
          <X :size="15" aria-hidden="true" />
        </button>
      </div>

      <!-- The waveform and the window over it. Without measurements there is
           still a window to drag, just nothing drawn under it. -->
      <div
        ref="wave"
        data-testid="reel-waveform"
        class="relative mt-2 flex h-20 w-full cursor-ew-resize touch-none select-none items-end gap-px overflow-hidden rounded-xl border border-line bg-bg-deep px-1 py-1"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <span
          v-for="(bar, i) in bars"
          :key="i"
          class="flex-1 rounded-sm bg-them/50"
          :style="{ height: `${Math.max(3, bar * 100)}%` }"
        />
        <p v-if="!bars.length" class="absolute inset-0 grid place-items-center text-xs text-ink-subtle">
          {{ $t('reel.noWaveform') }}
        </p>

        <div
          class="pointer-events-none absolute inset-y-0 border-x-2 border-accent bg-accent/20"
          :style="windowStyle"
        />
      </div>

      <div class="mt-2 flex items-center gap-2">
        <p class="font-mono text-xs tabular-nums text-ink-muted">
          {{ clock(music.startAt) }} → {{ clock(music.startAt + need) }}
        </p>
        <button type="button" class="btn btn-sm btn-ghost ml-auto !min-h-8" @click="emit('autoFit')">
          <Wand2 :size="14" aria-hidden="true" />
          {{ $t('reel.autoFit') }}
        </button>
      </div>

      <label class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          class="size-4 accent-[var(--ui-accent)]"
          :checked="music.autoFit"
          @change="emit('patch', { autoFit: ($event.target as HTMLInputElement).checked })"
        >
        {{ $t('reel.autoFitAlways') }}
      </label>

      <div class="mt-4 grid gap-3">
        <label class="block">
          <span class="label">{{ $t('reel.musicVolume') }} · {{ Math.round(music.volume * 100) }}%</span>
          <input
            type="range" min="0" max="1.5" step="0.05"
            class="mt-2 w-full accent-[var(--ui-accent)]"
            :value="music.volume"
            @input="emit('patch', { volume: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>

        <label class="block">
          <span class="label">{{ $t('reel.matchAudio') }} · {{ Math.round(matchAudio * 100) }}%</span>
          <input
            type="range" min="0" max="1" step="0.05"
            class="mt-2 w-full accent-[var(--ui-accent)]"
            :value="matchAudio"
            @input="emit('matchAudio', Number(($event.target as HTMLInputElement).value))"
          >
          <span class="mt-1 block text-[0.6875rem] text-ink-subtle">{{ $t('reel.matchAudioHint') }}</span>
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="label">{{ $t('reel.fadeIn') }} · {{ music.fadeInSeconds.toFixed(1) }}s</span>
            <input
              type="range" min="0" max="6" step="0.1"
              class="mt-2 w-full accent-[var(--ui-accent)]"
              :value="music.fadeInSeconds"
              @input="emit('patch', { fadeInSeconds: Number(($event.target as HTMLInputElement).value) })"
            >
          </label>
          <label class="block">
            <span class="label">{{ $t('reel.fadeOut') }} · {{ music.fadeOutSeconds.toFixed(1) }}s</span>
            <input
              type="range" min="0.1" max="6" step="0.1"
              class="mt-2 w-full accent-[var(--ui-accent)]"
              :value="music.fadeOutSeconds"
              @input="emit('patch', { fadeOutSeconds: Number(($event.target as HTMLInputElement).value) })"
            >
          </label>
        </div>
      </div>
    </template>
  </div>
</template>
