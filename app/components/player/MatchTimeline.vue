<script setup lang="ts">
import type { BreakInput, DerivedMatch, RallyState } from "~~/shared/badminton";
import { Pause, Star } from "@lucide/vue";
import {
  breakAtTime,
  highlightSpans,
  rallyAtTime,
  resumeTimeAt,
} from "~~/shared/badminton";

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null;
    /** Video length. Falls back to the last rally end before the player reports. */
    duration: number;
    currentTime: number;
    breaks?: BreakInput[];
    /** Drawn over the video: translucent, so the play still reads through it. */
    overlay?: boolean;
    /** Enables the frame in the preview card. Without it the card is text only. */
    videoId?: string | null;
  }>(),
  { breaks: () => [], overlay: false, videoId: null },
);

const emit = defineEmits<{ seek: [seconds: number] }>();

const states = computed(() => props.derived?.rallyStates ?? []);

const total = computed(() => {
  if (props.duration > 0) return props.duration;
  return states.value.at(-1)?.endsAtSeconds || 1;
});

function pct(seconds: number) {
  return `${Math.min(100, Math.max(0, (seconds / total.value) * 100))}%`;
}

const track = ref<HTMLElement | null>(null);

/**
 * The track's width in pixels, watched rather than measured once. The preview
 * card is positioned and clamped in pixels, so it needs the real width.
 */
const trackWidth = ref(0);
let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!track.value) return;
  observer = new ResizeObserver(([entry]) => {
    trackWidth.value = entry?.contentRect.width ?? 0;
  });
  observer.observe(track.value);
});

onBeforeUnmount(() => observer?.disconnect());

const segments = computed(() =>
  states.value.map((s) => ({
    idx: s.idx,
    left: pct(s.startsAtSeconds),
    width: pct(s.endsAtSeconds - s.startsAtSeconds),
    start: s.startsAtSeconds,
    // Two colours, no third: crimson is ours, ink is theirs. Lets stay
    // colourless because no point was scored, so neither side "owns" them.
    class: s.isLet
      ? "bg-neutral"
      : s.scoreAfter[0] > s.scoreBefore[0]
      ? "bg-us"
      : "bg-them",
    title: `Point ${s.idx + 1} · ${s.scoreAfter[0]}–${s.scoreAfter[1]}`,
  })),
);

/**
 * Adjacent highlighted rallies merge into one band, so a great exchange tagged
 * across three points reads as a single passage rather than stripes. Breaks are
 * trimmed off — see `highlightSpans`: a rally's own span reaches back over any
 * pause before it, and a glowing band over dead time reads as tagged when it
 * never was.
 */
const highlightBands = computed(() =>
  highlightSpans(states.value, props.breaks).map((s) => ({
    left: pct(s.from),
    width: pct(s.to - s.from),
  })),
);

/**
 * Dead time, drawn over the rally lane. Rallies are contiguous, so the rally
 * following a break still spans it; painting the break on top is what makes
 * the gap visible. An unclosed break runs to the end of the video.
 */
const breakBands = computed(() =>
  props.breaks.map((b) => ({
    idx: b.idx,
    left: pct(b.startsAtSeconds),
    width: pct((b.endsAtSeconds ?? total.value) - b.startsAtSeconds),
    open: b.endsAtSeconds === null,
  })),
);

/** Start of every set after the first. */
const gameMarks = computed(() =>
  (props.derived?.sets ?? [])
    .filter((g) => g.number > 1 && g.firstRallyIdx !== null)
    .map((g) => {
      const first = states.value.find((s) => s.idx === g.firstRallyIdx);
      return { number: g.number, left: pct(first?.startsAtSeconds ?? 0) };
    }),
);

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${m}:${String(rest).padStart(2, "0")}`;
}

/** Where in the video a pointer event landed, as seconds. Null off-track. */
function timeFromPointer(event: PointerEvent | MouseEvent) {
  const rect = track.value?.getBoundingClientRect();
  if (!rect || !rect.width) return null;
  const ratio = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left) / rect.width),
  );
  return ratio * total.value;
}

/**
 * What the pointer is over: the point, the score it is being played for, and
 * whether the shuttle was even in play.
 *
 * `rallyAtTime` rather than `currentRallyAt`: past the final point is untagged
 * video, and inventing a score for it would be worse than saying nothing.
 */
const previewTime = ref<number | null>(null);

const preview = computed(() => {
  const t = previewTime.value;
  if (t === null) return null;
  const during = breakAtTime(props.breaks, t);
  const rally: RallyState | null = rallyAtTime(props.derived, t);
  return {
    time: t,
    onBreak: Boolean(during),
    // Mid-rally the board reads `scoreBefore`, the way a real scoreboard does
    // while a point is being played out. Preview the point, not its outcome.
    score: rally ? rally.scoreBefore : null,
    setNumber: rally?.setNumber ?? null,
    highlight: Boolean(rally?.isHighlight),
  };
});

/**
 * A frame from roughly where the pointer is.
 *
 * YouTube's real scrub storyboards live behind a signature that only its own
 * player response carries, and an embed never sees one. What every video does
 * expose is three still frames, at about a quarter, a half and three quarters
 * of the way through. Coarse, but it changes as you move and it is a picture of
 * this match rather than a placeholder — and the time and score beside it are
 * the parts that are exact.
 */
const previewFrame = computed(() => {
  const t = previewTime.value;
  if (!props.videoId || t === null || !total.value) return null;
  const nth = Math.min(3, Math.max(1, Math.ceil((t / total.value) * 3) || 1));
  return `https://i.ytimg.com/vi/${props.videoId}/${nth}.jpg`;
});

/** Preview card width, in px, so it can be kept inside the track. */
const PREVIEW_WIDTH = 148;

const previewLeft = computed(() => {
  const t = previewTime.value;
  if (t === null || !trackWidth.value) return "0px";
  const x = (t / total.value) * trackWidth.value;
  const margin = PREVIEW_WIDTH / 2 + 4;
  const clamped = Math.min(
    Math.max(x, margin),
    Math.max(margin, trackWidth.value - margin),
  );
  return `${clamped}px`;
});

/**
 * Press, drag, release — the way a phone scrubs a video.
 *
 * A touch screen has no hover, so the preview has to hang off the finger rather
 * than off a cursor that never arrives. Holding shows the card, dragging moves
 * it, and letting go is the seek. Nothing is committed until the finger lifts,
 * so a scrub that started by accident can be dragged back rather than jumping
 * the video the instant it was touched.
 *
 * The same handlers serve a mouse, which makes drag-scrubbing work there too.
 * `setPointerCapture` keeps the drag alive once the pointer leaves the track —
 * a finger wanders off a 32px bar constantly — and `touch-none` stops the page
 * scrolling out from under it.
 */
const dragging = ref(false);

function onPointerDown(event: PointerEvent) {
  const at = timeFromPointer(event);
  if (at === null) return;
  dragging.value = true;
  previewTime.value = at;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  // Off a drag, only a real cursor previews: on touch, a move with no finger
  // down is not a hover, it is nothing at all.
  if (!dragging.value && event.pointerType !== "mouse") return;
  previewTime.value = timeFromPointer(event);
}

/**
 * Release seeks. Where a point is under the pointer the target is that point's
 * START, not the exact spot — landing mid-rally is never what you want — and it
 * is then pushed past any break covering it, so releasing on the first point of
 * a set lands on play resuming rather than on the interval.
 */
function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  const at = timeFromPointer(event) ?? previewTime.value;
  // The card leaves with the finger. A mouse keeps it, since the cursor is
  // still over the track and hovering is what it was doing before the press.
  if (event.pointerType !== "mouse") previewTime.value = null;
  if (at === null) return;
  const hit = rallyAtTime(props.derived, at);
  emit("seek", resumeTimeAt(props.breaks, hit ? hit.startsAtSeconds : at));
}

function onPointerLeave() {
  if (!dragging.value) previewTime.value = null;
}

function onPointerCancel() {
  dragging.value = false;
  previewTime.value = null;
}
</script>

<template>
  <!--
    `relative` on a wrapper rather than on the track: the preview card hangs
    above the track and would be clipped by the track's own overflow-hidden,
    which is what keeps the segments inside its rounded corners.
  -->
  <div class="relative">
    <div
      ref="track"
      data-testid="match-timeline"
      class="relative w-full cursor-pointer touch-none select-none overflow-hidden rounded-lg border transition-[border-color] duration-200 sm:rounded-xl"
      :class="overlay
        ? 'h-9 border-white/20 bg-black/85 backdrop-blur-sm hover:border-white/40 sm:h-11'
        : 'h-8 border-line bg-bg-deep hover:border-line-strong sm:h-10'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
    >
      <!--
        border-r in the track colour separates consecutive points: a run of five
        won in a row would otherwise read as one long block. box-sizing keeps the
        border inside the segment, so positions stay exact.
      -->
      <div
        v-for="s in segments"
        :key="s.idx"
        class="absolute bottom-0 top-2.5 border-r opacity-85 transition-opacity duration-150 hover:opacity-100"
        :class="[s.class, overlay ? 'border-black/60' : 'border-bg-deep']"
        :style="{ left: s.left, width: s.width }"
        :title="s.title"
      />

      <!-- Dead time is drawn, not left blank: a gap would read as missing data
           rather than as the shuttle being off the court. -->
      <div
        v-for="b in breakBands"
        :key="`b${b.idx}`"
        data-testid="timeline-break"
        class="absolute bottom-0 top-2.5 border-x border-line-strong"
        :class="[b.open ? 'opacity-70' : '', overlay ? 'bg-black/70' : 'bg-bg-deep']"
        :style="{
          left: b.left,
          width: b.width,
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--ui-line) 0 2px, transparent 2px 6px)',
        }"
        :title="b.open ? $t('player.breakOpen') : $t('player.break')"
      />

      <!-- Highlights ride in their own lane above the points so they stay
           legible when a match is dense enough that segments are hairline. The
           glow is what separates them from a won rally of the same colour. -->
      <div
        v-for="(b, i) in highlightBands"
        :key="`h${i}`"
        data-testid="timeline-highlight"
        class="absolute left-0 top-0 h-2 rounded-b-sm bg-accent shadow-[0_0_10px_var(--ui-accent)]"
        :style="{ left: b.left, width: b.width }"
        :title="$t('player.highlight')"
      />

      <!--
        A notch, not a full-height line. Drawn the same way as the playhead it
        sat beside, a set mark was indistinguishable from it — every match past
        set one looked like it had two cursors, one of which would not move.
      -->
      <div
        v-for="g in gameMarks"
        :key="`g${g.number}`"
        data-testid="timeline-set-mark"
        class="absolute bottom-0 h-2 w-px bg-ink-muted"
        :style="{ left: g.left }"
        :title="`Set ${g.number}`"
      />

      <div
        data-testid="timeline-playhead"
        class="pointer-events-none absolute inset-y-0 w-0.5 bg-ink shadow-[0_0_8px_var(--ui-ink)]"
        :style="{ left: pct(currentTime) }"
      />
    </div>

    <!--
      The preview card. Above the track and clamped to it, so a point at either
      end previews without half the card hanging off the player.
    -->
    <Transition
      enter-active-class="transition duration-100"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="preview"
        data-testid="timeline-preview"
        class="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-panel-solid shadow-[var(--ui-shadow)]"
        :style="{ left: previewLeft, width: `${PREVIEW_WIDTH}px` }"
        role="tooltip"
      >
        <div v-if="previewFrame" class="relative aspect-video w-full bg-black">
          <img
            :src="previewFrame"
            alt=""
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          >
          <!-- The star rides the frame rather than the text row: it is about
               the passage on screen, and it has room to glow up here. -->
          <Star
            v-if="preview.highlight"
            class="absolute right-1 top-1 size-3.5 fill-accent text-accent drop-shadow-[0_0_5px_var(--ui-accent)]"
            aria-hidden="true"
          />
        </div>

        <div class="flex items-center gap-1.5 px-2 py-1.5">
          <template v-if="preview.onBreak">
            <Pause :size="11" class="shrink-0 text-ink-subtle" aria-hidden="true" />
            <span class="truncate text-[0.6875rem] text-ink-subtle">{{ $t('player.break') }}</span>
          </template>
          <template v-else-if="preview.score">
            <span class="shrink-0 font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
              S{{ preview.setNumber }}
            </span>
            <span
              data-testid="preview-score"
              class="font-display text-sm font-bold tabular-nums leading-none text-ink"
            >{{ preview.score[0] }}–{{ preview.score[1] }}</span>
          </template>
          <span v-else class="truncate text-[0.6875rem] text-ink-subtle">{{ $t('player.untagged') }}</span>

          <span
            data-testid="preview-time"
            class="ml-auto shrink-0 font-mono text-[0.6875rem] tabular-nums text-ink-muted"
          >{{ clock(preview.time) }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>
