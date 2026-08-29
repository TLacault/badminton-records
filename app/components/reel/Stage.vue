<script setup lang="ts">
import type { ReelProject, TimelinePiece } from '~~/shared/reel'
import type { PieceMedia, ReelControls } from '~/composables/useReelPlayback'
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from '@lucide/vue'
import { captionFor } from '~~/shared/reel'

/**
 * The preview.
 *
 * One player is dragged along the edit list rather than a film being built —
 * see `useReelPlayback`. What this component adds is everything the eye needs
 * for the edit to read as a film: the grade and the punch-in as CSS on the
 * frame, the caption where drawtext will put it, and a dip over each join.
 *
 * None of that is the render. The render is ffmpeg, and it is the truth; this
 * is a rehearsal accurate enough to make decisions from, which is the trade
 * every editor makes with its own preview.
 */

const props = defineProps<{
  pieces: TimelinePiece[]
  project: ReelProject
  /** A file on disk or a cached copy. Null means the YouTube embed. */
  sourceUrl: string | null
  videoId: string | null
  musicUrl: string | null
  introUrl: string | null
  outroUrl: string | null
}>()

const pieces = computed(() => props.pieces)

const sourceEl = ref<HTMLVideoElement | null>(null)
const bookendEl = ref<HTMLVideoElement | null>(null)
const musicEl = ref<HTMLAudioElement | null>(null)
const embedHost = ref<HTMLElement | null>(null)

const embedded = computed(() => !props.sourceUrl && Boolean(props.videoId))
const embedId = computed(() => (embedded.value ? props.videoId : null))
const embed = useYouTubePlayer(embedHost, embedId)

const active = ref<PieceMedia>('source')
const muted = ref(false)

function bookendSrc(media: PieceMedia) {
  return media === 'intro' ? props.introUrl : props.outroUrl
}

/**
 * The stage as the engine drives it. Two video elements rather than one with a
 * swapped `src`: a bookend and the match are different files, and reloading
 * one element at a cut costs the half-second of black that the cut was
 * supposed to hide.
 */
const controls: ReelControls = {
  ready: () => (embedded.value ? embed.ready.value : Boolean(sourceEl.value?.readyState)),
  media: () => active.value,
  time: () => {
    if (active.value !== 'source') return bookendEl.value?.currentTime ?? 0
    return embedded.value ? embed.getTime() : (sourceEl.value?.currentTime ?? 0)
  },
  load: (media, seconds) => {
    active.value = media
    if (media === 'source') {
      controls.seek(seconds)
      return
    }
    const el = bookendEl.value
    const src = bookendSrc(media)
    if (!el || !src) return
    // Compared before assigning: setting `src` to what it already is reloads
    // the element in every browser, and the reel would stutter on every loop.
    if (!el.src.endsWith(src)) el.src = src
    el.currentTime = seconds
  },
  seek: (seconds) => {
    if (active.value !== 'source') {
      if (bookendEl.value) bookendEl.value.currentTime = seconds
      return
    }
    if (embedded.value) embed.seekTo(seconds)
    else if (sourceEl.value) sourceEl.value.currentTime = seconds
  },
  play: () => {
    if (active.value !== 'source') {
      bookendEl.value?.play().catch(() => {})
      sourceEl.value?.pause()
      return
    }
    bookendEl.value?.pause()
    if (embedded.value) embed.play()
    else sourceEl.value?.play().catch(() => {})
  },
  pause: () => {
    bookendEl.value?.pause()
    sourceEl.value?.pause()
    if (embedded.value) embed.pause()
    musicEl.value?.pause()
  },
  rate: (value) => {
    if (sourceEl.value) sourceEl.value.playbackRate = value
    if (embedded.value) embed.setRate(value)
  },
}

const controlsRef = shallowRef<ReelControls | null>(controls)

const playback = useReelPlayback(pieces, controlsRef, {
  overlap: () => (props.project.transition === 'cut' ? 0 : props.project.transitionSeconds),
})

const piece = computed(() => playback.piece.value)
const clip = computed(() => piece.value?.clip ?? null)

/** The look, as CSS. Deliberately the same list of names the renderer knows. */
const GRADE_CSS: Record<string, string> = {
  none: '',
  punch: 'contrast(1.12) saturate(1.3)',
  mono: 'grayscale(1) contrast(1.18)',
  warm: 'sepia(0.28) saturate(1.25) hue-rotate(-8deg)',
  cool: 'saturate(1.05) hue-rotate(8deg) brightness(1.02)',
  faded: 'contrast(0.88) brightness(1.04) saturate(0.72)',
}

const frameStyle = computed(() => ({
  filter: GRADE_CSS[clip.value?.grade ?? 'none'] || 'none',
  transform: `scale(${clip.value?.zoom ?? 1})`,
}))

/** The caption lives for its first three and a half seconds, like drawtext's. */
const caption = computed(() => {
  const current = clip.value
  if (!current || !props.project.captions || !current.showLabel) return null
  const into = playback.position.value - (piece.value?.startsAt ?? 0)
  if (into < 0 || into > 3.6) return null
  const text = captionFor(current)
  return text ? { text, fading: into > 3 } : null
})

/** Black over the join, and over the head and tail of the reel. */
const veil = computed(() => {
  const joining = playback.joining.value
  const position = playback.position.value
  const duration = playback.duration.value
  let opacity = 0
  let colour = 'black'

  if (joining) {
    if (props.project.transition === 'fadeblack') opacity = Math.sin(joining * Math.PI)
    else if (props.project.transition === 'flash') {
      opacity = Math.sin(joining * Math.PI) * 0.85
      colour = 'white'
    }
    else opacity = Math.sin(joining * Math.PI) * 0.55
  }

  if (props.project.fadeEdges && duration) {
    if (position < 0.5) opacity = Math.max(opacity, 1 - position / 0.5)
    if (position > duration - 0.8) opacity = Math.max(opacity, (position - (duration - 0.8)) / 0.8)
  }

  return { opacity, colour }
})

// ── Sound ───────────────────────────────────────────────────────────────────

/**
 * The song rides along beside the picture rather than being cut into it.
 *
 * Nudged back into place whenever it drifts a quarter of a second, which it
 * does constantly: every clip boundary is a seek, and a seek on a video
 * element takes as long as it takes.
 */
function syncMusic() {
  const el = musicEl.value
  if (!el || !props.musicUrl) return
  const wanted = props.project.music.startAt + playback.position.value
  if (Math.abs(el.currentTime - wanted) > 0.25) el.currentTime = wanted
  el.volume = muted.value ? 0 : Math.min(1, props.project.music.volume)
  if (playback.playing.value && el.paused) el.play().catch(() => {})
  if (!playback.playing.value && !el.paused) el.pause()
}

function syncVolume() {
  const level = muted.value ? 0 : Math.min(1, props.project.output.matchAudio)
  if (sourceEl.value) sourceEl.value.volume = level
  if (bookendEl.value) bookendEl.value.volume = level
  if (embedded.value) embed.changeVolume(Math.round(level * 100) - embed.volume.value)
}

let frame = 0
function loop() {
  frame = requestAnimationFrame(loop)
  syncMusic()
}

onMounted(() => {
  frame = requestAnimationFrame(loop)
  syncVolume()
})
onBeforeUnmount(() => cancelAnimationFrame(frame))

watch(() => [props.project.output.matchAudio, muted.value, props.sourceUrl], syncVolume)

// A new source file, or the first one, leaves the player parked on nothing.
watch(() => props.sourceUrl, () => {
  nextTick(() => playback.seek(playback.position.value, { keepPlaying: false }))
})

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Scrubbing the strip under the preview. */
const scrub = ref<HTMLElement | null>(null)
const dragging = ref(false)

function seekFromPointer(event: PointerEvent) {
  const rect = scrub.value?.getBoundingClientRect()
  if (!rect?.width) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  playback.seek(ratio * playback.duration.value)
}

function onDown(event: PointerEvent) {
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  seekFromPointer(event)
}
function onMove(event: PointerEvent) {
  if (dragging.value) seekFromPointer(event)
}
function onUp() {
  dragging.value = false
}

defineExpose({
  position: computed(() => playback.position.value),
  duration: computed(() => playback.duration.value),
  playing: computed(() => playback.playing.value),
  index: computed(() => playback.index.value),
  seek: playback.seek,
  goToPiece: playback.goToPiece,
  toggle: playback.toggle,
  pause: playback.pause,
})
</script>

<template>
  <div>
    <div
      data-testid="reel-stage"
      class="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black"
    >
      <!-- The frame itself. Everything the grade and the punch-in do is done
           here, so the overlays above it stay sharp and unfiltered. -->
      <div class="absolute inset-0 transition-[filter,transform] duration-300 ease-brand" :style="frameStyle">
        <video
          v-show="active === 'source' && !embedded"
          ref="sourceEl"
          :src="sourceUrl ?? undefined"
          class="h-full w-full object-cover"
          playsinline
          preload="auto"
        />
        <div
          v-show="active === 'source' && embedded"
          class="pointer-events-none h-full w-full"
        >
          <div ref="embedHost" class="h-full w-full" />
        </div>
        <video
          v-show="active !== 'source'"
          ref="bookendEl"
          class="h-full w-full object-contain"
          playsinline
          preload="auto"
        />
      </div>

      <div
        class="pointer-events-none absolute inset-0 transition-opacity duration-100"
        :style="{ background: veil.colour, opacity: veil.opacity }"
        aria-hidden="true"
      />

      <Transition
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-300"
        leave-to-class="opacity-0"
      >
        <p
          v-if="caption"
          data-testid="reel-caption"
          class="pointer-events-none absolute bottom-14 left-5 font-display text-lg font-bold uppercase tracking-[0.08em] text-white legible sm:bottom-16 sm:text-2xl"
          :class="caption.fading ? 'opacity-60' : ''"
        >
          {{ caption.text }}
        </p>
      </Transition>

      <p
        v-if="!pieces.length || (!sourceUrl && !embedded)"
        class="absolute inset-0 grid place-items-center px-6 text-center font-display text-sm uppercase tracking-[0.14em] text-white/60"
      >
        {{ !sourceUrl && !embedded ? $t('reel.noSource') : $t('reel.emptyStage') }}
      </p>

      <!-- Controls. Always up: this is an editing surface, and a bar that
           hides while you are deciding whether a cut works is a bar you fight. -->
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8">
        <div
          ref="scrub"
          class="group relative h-3 w-full cursor-pointer touch-none select-none"
          role="slider"
          :aria-valuemin="0"
          :aria-valuemax="Math.round(playback.duration.value)"
          :aria-valuenow="Math.round(playback.position.value)"
          :aria-label="$t('reel.scrub')"
          tabindex="0"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
          @keydown.left.prevent="playback.seek(playback.position.value - 1)"
          @keydown.right.prevent="playback.seek(playback.position.value + 1)"
        >
          <div class="absolute inset-x-0 top-1 h-1 rounded-full bg-white/25">
            <div
              class="h-full rounded-full bg-accent shadow-[0_0_10px_var(--ui-accent)]"
              :style="{ width: `${playback.duration.value ? (playback.position.value / playback.duration.value) * 100 : 0}%` }"
            />
          </div>
        </div>

        <div class="mt-1 flex items-center gap-1.5">
          <button
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-lg text-white transition-colors hover:text-accent"
            :aria-label="playback.playing.value ? $t('reel.pause') : $t('reel.play')"
            @click="playback.toggle()"
          >
            <component :is="playback.playing.value ? Pause : Play" :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:text-accent"
            :aria-label="$t('reel.previousClip')"
            @click="playback.step(-1)"
          >
            <SkipBack :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:text-accent"
            :aria-label="$t('reel.nextClip')"
            @click="playback.step(1)"
          >
            <SkipForward :size="16" aria-hidden="true" />
          </button>

          <p class="ml-1 font-mono text-xs tabular-nums text-white/80">
            {{ clock(playback.position.value) }} / {{ clock(playback.duration.value) }}
          </p>

          <p
            v-if="piece"
            class="ml-auto hidden truncate font-display text-xs uppercase tracking-[0.12em] text-white/60 sm:block"
          >
            <template v-if="piece.kind === 'clip'">
              {{ $t('reel.clipN', { n: pieces.filter(p => p.kind === 'clip').indexOf(piece) + 1 }) }}
            </template>
            <template v-else>{{ piece.kind === 'intro' ? $t('reel.intro') : $t('reel.outro') }}</template>
          </p>

          <button
            type="button"
            class="ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:text-accent sm:ml-1.5"
            :aria-label="muted ? $t('reel.unmute') : $t('reel.mute')"
            @click="muted = !muted"
          >
            <component :is="muted ? VolumeX : Volume2" :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <audio ref="musicEl" :src="musicUrl ?? undefined" preload="auto" class="hidden" />
  </div>
</template>
