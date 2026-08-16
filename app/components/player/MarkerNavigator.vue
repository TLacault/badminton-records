<script setup lang="ts">
import type { BreakInput, DerivedMatch } from "~~/shared/badminton";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Star,
} from "@lucide/vue";
import { resumeTimeAt } from "~~/shared/badminton";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    derived: DerivedMatch | null;
    currentTime: number;
    breaks?: BreakInput[];
  }>(),
  { breaks: () => [] },
);

const emit = defineEmits<{ seek: [seconds: number] }>();

type Mode = "points" | "sets" | "highlights";
const mode = ref<Mode>("points");

const modes = computed<Array<{ id: Mode; label: string }>>(() => [
  { id: "points", label: t("player.points") },
  { id: "sets", label: t("player.sets") },
  { id: "highlights", label: t("player.highlights") },
]);

type Tone = "win" | "loss" | "let" | "neutral";
interface Marker {
  key: string;
  label: string;
  sub: string;
  time: number;
  tone: Tone;
}

/** Same colour language as the timeline: crimson we won it, ink they did. */
const TONE_CLASS: Record<Tone, string> = {
  win: "border-accent/40 bg-accent-soft text-accent hover:border-accent",
  loss: "border-line-strong text-ink hover:border-ink-subtle",
  let: "border-line text-ink-subtle hover:border-line-strong",
  neutral: "border-line text-ink-muted hover:border-line-strong hover:text-ink",
};

const open = ref(true);

/** What the prev/next buttons and the list step through, per mode. */
const markers = computed<Marker[]>(() => {
  const states = props.derived?.rallyStates ?? [];
  if (mode.value === "sets") {
    return (props.derived?.sets ?? [])
      .filter((g) => g.firstRallyIdx !== null)
      .map((g) => {
        const first = states.find((s) => s.idx === g.firstRallyIdx);
        return {
          key: `g${g.number}`,
          label: `Set ${g.number}`,
          sub: `${g.score[0]}–${g.score[1]}`,
          time: first?.startsAtSeconds ?? 0,
          tone: (g.winnerSide === 1
            ? "win"
            : g.winnerSide === 2
            ? "loss"
            : "neutral") as Tone,
        };
      });
  }
  const source =
    mode.value === "highlights" ? states.filter((s) => s.isHighlight) : states;
  return source.map((s) => ({
    key: `r${s.idx}`,
    label: `${s.scoreAfter[0]}–${s.scoreAfter[1]}`,
    sub: formatClock(s.startsAtSeconds),
    time: s.startsAtSeconds,
    tone: (s.isLet
      ? "let"
      : s.scoreAfter[0] > s.scoreBefore[0]
      ? "win"
      : "loss") as Tone,
  }));
});

/** Index of the marker currently playing — the last one already started. */
const activeMarker = computed(() => {
  let found = -1;
  markers.value.forEach((m, i) => {
    if (m.time <= props.currentTime + 0.25) found = i;
  });
  return found;
});

function jumpTo(index: number) {
  const marker = markers.value[index];
  // Past any break covering the target: a set's first rally "starts" the
  // instant the previous set ended, which is the start of the interval.
  if (marker) emit("seek", resumeTimeAt(props.breaks, marker.time));
}
function previous() {
  jumpTo(Math.max(0, activeMarker.value - 1));
}
function next() {
  jumpTo(Math.min(markers.value.length - 1, activeMarker.value + 1));
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <div
        data-testid="mode-switch"
        class="inline-flex rounded-xl border border-line p-1"
      >
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="min-h-8 rounded-lg px-2.5 font-display text-xs font-semibold uppercase tracking-[0.1em] transition-[color,background-color] duration-200 ease-brand sm:min-h-9 sm:px-3.5 sm:text-sm"
          :class="
            mode === m.id
              ? 'bg-accent-soft text-accent'
              : 'text-ink-muted hover:text-ink'
          "
          :aria-pressed="mode === m.id"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          data-testid="marker-prev"
          type="button"
          class="grid size-8 place-items-center rounded-lg border border-line text-ink-muted transition-[color,border-color] duration-200 hover:border-accent/50 hover:text-accent disabled:pointer-events-none disabled:opacity-40 sm:size-9"
          :disabled="activeMarker <= 0"
          :title="$t('player.previous')"
          :aria-label="$t('player.previousMarker')"
          @click="previous"
        >
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>
        <button
          data-testid="marker-next"
          type="button"
          class="grid size-8 place-items-center rounded-lg border border-line text-ink-muted transition-[color,border-color] duration-200 hover:border-accent/50 hover:text-accent disabled:pointer-events-none disabled:opacity-40 sm:size-9"
          :disabled="activeMarker >= markers.length - 1"
          :title="$t('player.next')"
          :aria-label="$t('player.nextMarker')"
          @click="next"
        >
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>

      <span
        class="font-display text-xs uppercase tracking-[0.12em] text-ink-subtle sm:text-sm"
      >
        <span class="tabular-nums text-ink-muted">{{ markers.length }}</span>
        {{ mode }}
      </span>

      <button
        data-testid="marker-collapse"
        type="button"
        class="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted transition-colors duration-200 hover:text-accent"
        :aria-expanded="open"
        @click="open = !open"
      >
        <component
          :is="open ? ChevronUp : ChevronDown"
          :size="14"
          aria-hidden="true"
        />
        {{ open ? "Hide History" : "Show History" }}
      </button>
    </div>

    <template v-if="open">
      <ul
        v-if="markers.length"
        data-testid="marker-list"
        class="mt-3 flex flex-wrap gap-1 sm:gap-1.5"
      >
        <li v-for="(m, i) in markers" :key="m.key">
          <button
            type="button"
            class="flex min-h-7 items-center gap-1 rounded-lg border px-1.5 text-[0.6875rem] tabular-nums transition-[border-color,color,background-color] duration-200 sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs"
            :class="
              i === activeMarker
                ? 'border-accent bg-accent text-on-brand font-semibold shadow-[var(--ui-glow-strong)]'
                : TONE_CLASS[m.tone]
            "
            :aria-current="i === activeMarker ? 'true' : undefined"
            @click="jumpTo(i)"
          >
            <Star
              v-if="mode === 'highlights'"
              :size="11"
              class="fill-current"
              :class="i === activeMarker ? '' : 'text-accent'"
              aria-hidden="true"
            />
            <span class="font-medium">{{ m.label }}</span>
            <span class="opacity-70">{{ m.sub }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-ink-subtle">
        No {{ mode }} tagged for this match yet.
      </p>
    </template>
  </div>
</template>
