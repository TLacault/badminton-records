<script setup lang="ts">
const props = defineProps<{ videoId: string | null }>()

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
    <div class="relative aspect-video w-full overflow-hidden rounded bg-black">
      <div ref="host" class="h-full w-full" />
      <!--
        This overlay is the whole reason keyboard tagging works. A focused
        YouTube iframe swallows every keystroke, so we cover it and absorb all
        pointer events; the iframe can then never take focus.
      -->
      <div data-testid="focus-shield" class="absolute inset-0 cursor-default" @click.prevent />
      <p v-if="!videoId" class="absolute inset-0 grid place-items-center text-slate-500">
        No YouTube video ID set for this match.
      </p>
    </div>

    <div class="mt-2 flex items-center gap-3 text-sm">
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
