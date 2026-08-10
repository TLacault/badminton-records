<script setup lang="ts">
import type { BreakInput, DerivedMatch } from "~~/shared/badminton";
import { rallyAtTime, resumeTimeAt } from "~~/shared/badminton";

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null;
    /** Video length. Falls back to the last rally end before the player reports. */
    duration: number;
    currentTime: number;
    breaks?: BreakInput[];
    /** Drawn over the video: translucent, so the play still reads through it. */
    overlay?: boolean;
  }>(),
  { breaks: () => [], overlay: false },
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

/** Adjacent highlighted rallies merge into one band, so a great exchange
 *  tagged across three points reads as a single passage rather than stripes. */
const highlightBands = computed(() => {
  const bands: Array<{ left: string; width: string; start: number }> = [];
  let run: { from: number; to: number } | null = null;
  for (const s of states.value) {
    if (s.isHighlight) {
      if (run && run.to === s.startsAtSeconds) run.to = s.endsAtSeconds;
      else {
        if (run)
          bands.push({
            left: pct(run.from),
            width: pct(run.to - run.from),
            start: run.from,
          });
        run = { from: s.startsAtSeconds, to: s.endsAtSeconds };
      }
    }
  }
  if (run)
    bands.push({
      left: pct(run.from),
      width: pct(run.to - run.from),
      start: run.from,
    });
  return bands;
});

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

const track = ref<HTMLElement | null>(null);

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
  const rect = track.value?.getBoundingClientRect();
  if (!rect || !rect.width) return;
  const ratio = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left) / rect.width),
  );
  const time = ratio * total.value;
  const hit = rallyAtTime(props.derived, time);
  emit("seek", resumeTimeAt(props.breaks, hit ? hit.startsAtSeconds : time));
}
</script>

<template>
  <div
    ref="track"
    data-testid="match-timeline"
    class="relative w-full cursor-pointer overflow-hidden rounded-xl border transition-[border-color] duration-200"
    :class="overlay
      ? 'h-8 border-white/20 bg-black/45 backdrop-blur-sm hover:border-white/40'
      : 'h-10 border-line bg-bg-deep hover:border-line-strong'"
    @click="seekFromPointer"
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
</template>
