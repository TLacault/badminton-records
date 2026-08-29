<script setup lang="ts">
import type { TimelinePiece } from '~~/shared/reel'
import { captionFor } from '~~/shared/reel'

/**
 * The reel itself, end to end.
 *
 * The match timeline elsewhere in the app maps *video* time; this maps *film*
 * time, so a clip's width is how long it will be on screen — a half-speed clip
 * is twice as wide as the rally it came from, which is the whole point of
 * looking at a reel rather than at a list.
 */

const props = defineProps<{
  pieces: TimelinePiece[]
  position: number
  duration: number
  selectedId: string | null
}>()

const emit = defineEmits<{ seek: [seconds: number], select: [id: string] }>()

const track = ref<HTMLElement | null>(null)

function pct(seconds: number) {
  return `${props.duration ? Math.min(100, (seconds / props.duration) * 100) : 0}%`
}

const blocks = computed(() =>
  props.pieces.map((piece, i) => ({
    piece,
    left: pct(piece.startsAt),
    width: pct(piece.outSeconds),
    number: props.pieces.slice(0, i + 1).filter(p => p.kind === 'clip').length,
    label: piece.clip ? captionFor(piece.clip) : '',
  })),
)

function seekFromPointer(event: PointerEvent) {
  const rect = track.value?.getBoundingClientRect()
  if (!rect?.width) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  emit('seek', ratio * props.duration)
}

const dragging = ref(false)
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

function clock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <div
      ref="track"
      data-testid="reel-ribbon"
      class="relative h-16 w-full cursor-pointer touch-none select-none overflow-hidden rounded-xl border border-line bg-bg-deep"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <button
        v-for="block in blocks"
        :key="block.piece.id"
        type="button"
        class="absolute inset-y-0 overflow-hidden border-r border-bg-deep px-2 pt-1.5 text-left transition-[background-color,box-shadow] duration-200"
        :class="[
          block.piece.kind === 'clip'
            ? 'bg-us/85 hover:bg-us'
            : 'bg-them/70 hover:bg-them',
          block.piece.clip && block.piece.clip.id === selectedId
            ? 'z-10 ring-2 ring-inset ring-accent shadow-[0_0_16px_var(--ui-accent)]'
            : '',
        ]"
        :style="{ left: block.left, width: block.width }"
        :aria-label="block.piece.kind === 'clip'
          ? $t('reel.clipN', { n: block.number })
          : (block.piece.kind === 'intro' ? $t('reel.intro') : $t('reel.outro'))"
        @click.stop="block.piece.clip ? emit('select', block.piece.clip.id) : emit('seek', block.piece.startsAt + 0.01)"
      >
        <span class="block truncate font-display text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-white/95">
          <template v-if="block.piece.kind === 'clip'">{{ block.number }}</template>
          <template v-else>{{ block.piece.kind === 'intro' ? $t('reel.intro') : $t('reel.outro') }}</template>
        </span>
        <span class="mt-0.5 block truncate text-[0.625rem] leading-tight text-white/70">
          {{ block.label || clock(block.piece.outSeconds) }}
        </span>
      </button>

      <div
        data-testid="reel-playhead"
        class="pointer-events-none absolute inset-y-0 w-0.5 bg-ink shadow-[0_0_8px_var(--ui-ink)]"
        :style="{ left: pct(position) }"
      />

      <p
        v-if="!pieces.length"
        class="grid h-full place-items-center text-xs text-ink-subtle"
      >
        {{ $t('reel.ribbonEmpty') }}
      </p>
    </div>
  </div>
</template>
