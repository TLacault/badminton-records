<script setup lang="ts">
import type { useReelSource } from '~/composables/useReelSource'
import { CloudDownload, FileUp, HardDrive, Info, Trash2 } from '@lucide/vue'

/**
 * The source video every Create tool renders from: attach the file, or have
 * this machine pull it from YouTube with yt-dlp (unlisted videos included, by
 * their link). 4K by default: the channel is filmed in 4K.
 */
const props = defineProps<{ source: ReturnType<typeof useReelSource>, duration?: number }>()

const QUALITIES = [
  { height: 2160, label: '4K (2160p)' },
  { height: 1440, label: '1440p' },
  { height: 1080, label: '1080p' },
  { height: 720, label: '720p' },
]
const quality = ref(2160)

const MODES = {
  local: 'Attached file: renders at full quality.',
  cached: 'Downloaded on this machine: ready to render.',
  youtube: 'Playing from YouTube: preview only, download or attach the file to render.',
  none: 'No video yet.',
} as const

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) props.source.attach(file)
}
</script>

<template>
  <section>
    <p class="label">
      Source video
    </p>
    <p class="mt-1.5 flex items-center gap-2 text-sm" :class="source.precise.value ? 'text-accent' : 'text-ink-muted'">
      <HardDrive :size="15" aria-hidden="true" />
      {{ MODES[source.mode.value] }}
      <span v-if="duration" class="ml-auto font-mono text-xs tabular-nums text-ink-subtle">{{ Math.round(duration / 60) }} min</span>
    </p>

    <div class="mt-3 rounded-xl border border-line bg-bg-deep/60 p-3">
      <p class="flex items-center gap-2 text-sm font-medium text-ink">
        <CloudDownload :size="15" class="text-accent" aria-hidden="true" />
        Download from YouTube
      </p>
      <p class="mt-1 flex gap-1.5 text-[0.6875rem] leading-relaxed text-ink-subtle">
        <Info :size="12" class="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Runs <code class="text-ink-muted">yt-dlp</code> on this machine (installed here, not on the hosted site),
          from the video's link, so unlisted videos work too. 4K is a few GB: allow several minutes.
        </span>
      </p>

      <div v-if="source.caps.value?.download" class="mt-3 flex flex-wrap items-center gap-2">
        <select v-model.number="quality" class="field !w-auto !py-1.5 text-sm" aria-label="Download quality" :disabled="source.downloading.value">
          <option v-for="q in QUALITIES" :key="q.height" :value="q.height">{{ q.label }}</option>
        </select>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="source.downloading.value"
          @click="source.fetchSource(quality, source.cached.value)"
        >
          <CloudDownload :size="15" aria-hidden="true" />
          {{ source.cached.value ? 'Download again' : 'Download' }}
        </button>
      </div>
      <p v-else class="mt-2 text-[0.6875rem] text-ink-subtle">
        This host has no yt-dlp/ffmpeg: run the app locally to download.
      </p>

      <UiProgress v-if="source.downloading.value" class="mt-3" :value="source.progress.value" :label="source.message.value || 'Starting download'" />
      <p v-if="source.error.value" class="mt-2 text-xs text-accent">{{ source.error.value }}</p>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <label class="btn btn-sm btn-ghost cursor-pointer">
        <FileUp :size="15" aria-hidden="true" />
        Attach a file
        <input type="file" accept="video/*" class="sr-only" @change="onFile">
      </label>
      <button v-if="source.cached.value" type="button" class="btn btn-sm btn-ghost" @click="source.forget()">
        <Trash2 :size="15" aria-hidden="true" />
        Delete the download
      </button>
    </div>
  </section>
</template>
