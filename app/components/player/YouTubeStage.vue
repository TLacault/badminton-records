<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    videoId: string | null
    /** Guests get a richer control bar of their own; the tagger uses this one. */
    showControls?: boolean
  }>(),
  { showControls: true },
)

const host = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')
const api = useYouTubePlayer(host, videoId)

defineExpose(api)

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <!--
      Capped by height, not width: in the full-width tagging layout an
      unconstrained 16:9 box on a wide screen grows tall enough to push the
      point list off-screen. Bounding the width to 60vh worth of height keeps
      the aspect ratio intact instead of letterboxing.
    -->
    <div class="relative mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded bg-black">
      <div ref="host" class="h-full w-full" />
      <!--
        This overlay is the whole reason keyboard tagging works. A focused
        YouTube iframe swallows every keystroke, so we cover it and take every
        pointer event ourselves; the iframe can then never take focus.

        It handles the click rather than discarding it: a div has no tabindex,
        so clicking here leaves focus on <body> and the window-level keydown
        handler keeps firing.
      -->
      <div
        data-testid="focus-shield"
        class="absolute inset-0 cursor-pointer"
        @click="api.toggle()"
      />
      <!--
        Sits above the shield so it stays readable, but must not intercept the
        click that toggles playback — hence pointer-events-none here, with any
        interactive child opting back in.
      -->
      <div class="pointer-events-none absolute inset-0">
        <slot name="overlay" />
      </div>
      <p v-if="!videoId" class="absolute inset-0 grid place-items-center text-slate-500">
        No YouTube video ID set for this match.
      </p>
    </div>

    <div v-if="showControls" class="mt-2 flex items-center gap-3 text-sm">
      <button data-testid="play-toggle" class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" @click="api.toggle()">
        {{ api.isPlaying.value ? 'Pause' : 'Play' }}
      </button>
      <button class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" @click="api.seekBy(-5)">
        −5s
      </button>
      <button class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" @click="api.seekBy(5)">
        +5s
      </button>
      <span data-testid="player-time" class="tabular-nums text-slate-400">
        {{ formatTime(api.currentTime.value) }} / {{ formatTime(api.duration.value) }}
      </span>
    </div>
  </div>
</template>
