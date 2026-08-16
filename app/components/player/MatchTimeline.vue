<script setup lang="ts">
import type { BreakInput, DerivedMatch, RallyState } from "~~/shared/badminton";
import { Pause, Star } from "@lucide/vue";
import { breakAtTime, rallyAtTime, resumeTimeAt } from "~~/shared/badminton";

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null;
    /** Video length. Falls back to the last rally end before the player reports. */
    duration: number;
    currentTime: number;
    breaks?: BreakInput[];
    /** Drawn over the video: translucent, so the play still reads through it. */
    overlay?: boolean;
    /** Enables the frame in the hover preview. Without it the card is text only. */
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
 * The track's width in pixels, watched rather than measured once.
 *
 * Needed because a decision that only a percentage can express — is this point
 * wide enough to hold a star? — has to be answered in the unit the star is
 * drawn in. A match of three hundred points at 360px gives each one a pixel.
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

/** The narrowest a point can be and still read as a shape rather than a line. */
const STAR_MIN_PX = 13;

const segments = computed(() =>
  states.value.map((s) => {
    const span = s.endsAtSeconds - s.startsAtSeconds;
    return {
      idx: s.idx,
      left: pct(s.startsAtSeconds),
      width: pct(span),
      start: s.startsAtSeconds,
      highlight: s.isHighlight,
      // Two colours, no third: crimson is ours, ink is theirs. Lets stay
      // colourless because no point was scored, so neither side "owns" them.
      class: s.isLet
        ? "bg-neutral"
        : s.scoreAfter[0] > s.scoreBefore[0]
        ? "bg-us"
        : "bg-them",
      // Only where the point is wide enough to hold one. A star crammed into a
      // two-pixel sliver is a smudge, and the glow marks the passage anyway.
      star:
        s.isHighlight &&
        (span / total.value) * trackWidth.value >= STAR_MIN_PX,
      title: `Point ${s.idx + 1} · ${s.scoreAfter[0]}–${s.scoreAfter[1]}`,
    };
  }),
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
 * What the cursor is over: the point, the score it ends on, and whether the
 * shuttle was even in play.
 *
 * `rallyAtTime` rather than `currentRallyAt`: hovering past the final point is
 * hovering over untagged video, and inventing a score for it would be worse
 * than saying nothing.
 */
const hoverTime = ref<number | null>(null);

const hovered = computed(() => {
  const t = hoverTime.value;
  if (t === null) return null;
  const during = breakAtTime(props.breaks, t);
  const rally: RallyState | null = rallyAtTime(props.derived, t);
  return {
    time: t,
    rally,
    onBreak: Boolean(during),
    // Mid-rally the board reads `scoreBefore`, the way a real scoreboard does
    // while a point is being played out. Preview the point, not its outcome.
    score: rally ? rally.scoreBefore : null,
    setNumber: rally?.setNumber ?? null,
    highlight: Boolean(rally?.isHighlight),
  };
});

/**
 * A frame from roughly where the cursor is.
 *
 * YouTube's real scrub storyboards live behind a signature that only its own
 * player response carries, and an embed never sees one. What every video does
 * expose is three still frames, at about a quarter, a half and three quarters
 * of the way through. Coarse, but it changes as you move and it is a picture of
 * this match rather than a placeholder — and the time and score beside it are
 * the parts that are exact.
 */
const previewFrame = computed(() => {
  const t = hoverTime.value;
  if (!props.videoId || t === null || !total.value) return null;
  const nth = Math.min(3, Math.max(1, Math.ceil((t / total.value) * 3) || 1));
  return `https://i.ytimg.com/vi/${props.videoId}/${nth}.jpg`;
});

/** Preview card width, in px, so it can be kept inside the track. */
const PREVIEW_WIDTH = 148;

const previewLeft = computed(() => {
  const t = hoverTime.value;
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
 * Hover is a mouse idea. On a touch screen a "hover" is the first half of a
 * tap, and a card that flashes up under the thumb and then seeks is worse than
 * no card at all.
 */
function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  hoverTime.value = timeFromPointer(event);
}

function onPointerLeave() {
  hoverTime.value = null;
}

/**
 * Clicking inside a point jumps to where that point STARTS, not to the exact
 * spot clicked — landing mid-rally is never what you want. Clicks outside any
 * tagged rally fall back to the raw position.
 *
 * The target is then pushed past any break covering it, so clicking the first
 * point of a match or of a set lands on play resuming rather than on dead
 * time.
 */
function seekFromPointer(event: MouseEvent) {
  const time = timeFromPointer(event);
  if (time === null) return;
  const hit = rallyAtTime(props.derived, time);
  emit("seek", resumeTimeAt(props.breaks, hit ? hit.startsAtSeconds : time));
}
</script>

<template>
  <!--
    `relative` on a wrapper rather than on the track: the hover card hangs above
    the track and would be clipped by the track's own overflow-hidden, which is
    what keeps the segments inside its rounded corners.
  -->
  <div class="relative">
    <div
      ref="track"
      data-testid="match-timeline"
      class="relative w-full cursor-pointer overflow-hidden rounded-lg border transition-[border-color] duration-200 sm:rounded-xl"
      :class="[
        overlay
          ? 'h-9 border-white/20 bg-black/85 backdrop-blur-sm hover:border-white/40 sm:h-11'
          : 'h-8 border-line bg-bg-deep hover:border-line-strong sm:h-10',
      ]"
      @click="seekFromPointer"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    >
      <!--
        border-r in the track colour separates consecutive points: a run of five
        won in a row would otherwise read as one long block. box-sizing keeps the
        border inside the segment, so positions stay exact.

        Full height now that the highlight lane is gone. That lane was a second
        row saying the same thing as the points below it, in a stripe too thin
        to be read as anything but decoration — and it stole the height that
        makes a dense match legible.
      -->
      <div
        v-for="s in segments"
        :key="s.idx"
        class="absolute inset-y-0 border-r transition-opacity duration-150 hover:opacity-100"
        :class="[
          s.class,
          overlay ? 'border-black/60' : 'border-bg-deep',
          s.highlight ? 'timeline-highlight opacity-100' : 'opacity-85',
        ]"
        :data-testid="s.highlight ? 'timeline-highlight' : undefined"
        :style="{ left: s.left, width: s.width }"
        :title="s.highlight ? `${s.title} · ${$t('player.highlight')}` : s.title"
      >
        <!--
          The star sits in the point rather than above it, which is the whole
          point of dropping the lane: a highlight is a point with something
          extra, not a separate kind of mark that happens to line up.
        -->
        <Star
          v-if="s.star"
          class="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.9)] sm:size-3"
          aria-hidden="true"
        />
      </div>

      <!-- Dead time is drawn, not left blank: a gap would read as missing data
           rather than as the shuttle being off the court. -->
      <div
        v-for="b in breakBands"
        :key="`b${b.idx}`"
        data-testid="timeline-break"
        class="absolute inset-y-0 z-10 border-x border-line-strong"
        :class="[b.open ? 'opacity-70' : '', overlay ? 'bg-black/70' : 'bg-bg-deep']"
        :style="{
          left: b.left,
          width: b.width,
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--ui-line) 0 2px, transparent 2px 6px)',
        }"
        :title="b.open ? $t('player.breakOpen') : $t('player.break')"
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
        class="absolute bottom-0 z-10 h-2 w-px bg-ink-muted"
        :style="{ left: g.left }"
        :title="`Set ${g.number}`"
      />

      <!--
        The playhead. A gradient rather than a bar: a hard line over a dense
        match is one more stripe among three hundred, and the eye loses it. The
        falloff is symmetrical and tight, so the exact frame is still the most
        saturated column in it — precision by intensity rather than by edge.
      -->
      <div
        class="pointer-events-none absolute inset-y-0 z-20 w-8 -translate-x-1/2 opacity-30 blur-[3px]"
        :style="{
          left: pct(currentTime),
          background:
            'linear-gradient(90deg, transparent, var(--ui-accent) 50%, transparent)',
        }"
        aria-hidden="true"
      />
      <div
        data-testid="timeline-playhead"
        class="pointer-events-none absolute inset-y-0 z-20 w-2.5 -translate-x-1/2"
        :style="{
          left: pct(currentTime),
          background:
            'linear-gradient(90deg, transparent, var(--ui-accent) 50%, transparent)',
        }"
      />
    </div>

    <!--
      The hover card. Above the track and clamped to it, so a point at either
      end previews without half the card hanging off the player.
    -->
    <Transition
      enter-active-class="transition duration-100"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="hovered"
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
            v-if="hovered.highlight"
            class="absolute right-1 top-1 size-3.5 fill-accent text-accent drop-shadow-[0_0_5px_var(--ui-accent)]"
            aria-hidden="true"
          />
        </div>

        <div class="flex items-center gap-1.5 px-2 py-1.5">
          <template v-if="hovered.onBreak">
            <Pause :size="11" class="shrink-0 text-ink-subtle" aria-hidden="true" />
            <span class="truncate text-[0.6875rem] text-ink-subtle">{{ $t('player.break') }}</span>
          </template>
          <template v-else-if="hovered.score">
            <span class="shrink-0 font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
              S{{ hovered.setNumber }}
            </span>
            <span
              data-testid="preview-score"
              class="font-display text-sm font-bold tabular-nums leading-none text-ink"
            >{{ hovered.score[0] }}–{{ hovered.score[1] }}</span>
          </template>
          <span v-else class="truncate text-[0.6875rem] text-ink-subtle">{{ $t('player.untagged') }}</span>

          <span
            data-testid="preview-time"
            class="ml-auto shrink-0 font-mono text-[0.6875rem] tabular-nums text-ink-muted"
          >{{ clock(hovered.time) }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/*
 * A highlighted point, without a lane of its own. The inset ring lifts it off
 * its neighbours and the glow carries it at widths where the star cannot fit,
 * so the same mark works for a five-second rally and for a dense match where
 * every point is a hairline.
 */
.timeline-highlight {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent) 85%, transparent),
    0 0 10px -1px var(--ui-accent);
  filter: saturate(1.35) brightness(1.12);
  /*
   * Lifted one layer so the glow is not painted over by the point that follows
   * it — a box-shadow spills outside the element, and a later sibling would
   * clip the right-hand half of it. One layer only: breaks and the playhead sit
   * above, because dead time inside a highlight is still dead time, and a
   * playhead the eye cannot find is not a playhead.
   */
  z-index: 1;
}
</style>
