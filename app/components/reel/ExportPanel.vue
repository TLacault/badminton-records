<script setup lang="ts">
import type { ReelCapabilities } from '~~/shared/reel'
import type { SourceMode } from '~/composables/useReelSource'
import { CloudDownload, Download, FileUp, FolderOpen, HardDrive, Save, Trash2 } from '@lucide/vue'

/**
 * Getting material in and the film out.
 *
 * Two halves that look alike and are not: the top is about the *source*, which
 * has to exist as a file before anything can be rendered from it, and the
 * bottom is the render itself. Both are honest about what this host can do —
 * a deployment with no ffmpeg says so here rather than at minute nine of an
 * export.
 */

defineProps<{
  caps: ReelCapabilities | null
  mode: SourceMode
  sourceDuration: number
  downloading: boolean
  downloadProgress: number | null
  sourceError: string | null
  rendering: boolean
  renderProgress: number | null
  renderError: string | null
  renderUrl: string | null
  renderSeconds: number
  canRender: boolean
  clipCount: number
}>()

const emit = defineEmits<{
  attach: [file: File]
  fetchSource: []
  forget: []
  render: []
  save: []
  open: [file: File]
}>()

function onVideo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('attach', file)
}

function onProject(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('open', file)
}

function mb(bytes: number) {
  return bytes > 1 << 30
    ? `${(bytes / (1 << 30)).toFixed(1)} GB`
    : `${Math.round(bytes / (1 << 20))} MB`
}

const MODE_TONE: Record<SourceMode, string> = {
  local: 'text-accent',
  cached: 'text-accent',
  youtube: 'text-ink-muted',
  none: 'text-ink-subtle',
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <section>
      <p class="label">
        {{ $t('reel.source') }}
      </p>

      <p class="mt-1.5 flex items-center gap-2 text-sm" :class="MODE_TONE[mode]">
        <HardDrive :size="15" aria-hidden="true" />
        {{ $t(`reel.sourceModes.${mode}`) }}
        <span v-if="sourceDuration" class="ml-auto font-mono text-xs tabular-nums text-ink-subtle">
          {{ Math.round(sourceDuration / 60) }} min
        </span>
      </p>

      <p class="mt-1 text-[0.6875rem] leading-relaxed text-ink-subtle">
        {{ $t(`reel.sourceHints.${mode}`) }}
      </p>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-if="caps?.download && mode !== 'local'"
          type="button"
          class="btn btn-sm btn-ghost"
          :disabled="downloading"
          @click="emit('fetchSource')"
        >
          <CloudDownload :size="15" aria-hidden="true" />
          {{ mode === 'cached' ? $t('reel.refetch') : $t('reel.fetch') }}
        </button>

        <label class="btn btn-sm btn-ghost cursor-pointer">
          <FileUp :size="15" aria-hidden="true" />
          {{ $t('reel.attach') }}
          <input type="file" accept="video/*" class="sr-only" @change="onVideo">
        </label>

        <button
          v-if="mode === 'cached'"
          type="button"
          class="btn btn-sm btn-ghost"
          @click="emit('forget')"
        >
          <Trash2 :size="15" aria-hidden="true" />
          {{ $t('reel.forget') }}
        </button>
      </div>

      <div v-if="downloading" class="mt-3">
        <div class="h-1 overflow-hidden rounded-full bg-bg-deep">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-300"
            :style="{ width: `${Math.round((downloadProgress ?? 0) * 100)}%` }"
          />
        </div>
        <p class="mt-1 text-[0.6875rem] text-ink-subtle">
          {{ $t('reel.downloading', { pct: Math.round((downloadProgress ?? 0) * 100) }) }}
        </p>
      </div>

      <p v-if="sourceError" class="mt-2 text-xs text-accent">
        {{ sourceError }}
      </p>

      <p v-if="caps?.cachedBytes" class="mt-2 text-[0.6875rem] text-ink-subtle">
        {{ $t('reel.cacheSize', { size: mb(caps.cachedBytes), n: caps.cachedSources.length }) }}
      </p>
    </section>

    <section class="border-t border-line pt-4">
      <p class="label">
        {{ $t('reel.export') }}
      </p>

      <button
        type="button"
        data-testid="reel-render"
        class="btn btn-primary mt-2.5 w-full"
        :disabled="!canRender || rendering || !clipCount || mode === 'youtube' || mode === 'none'"
        @click="emit('render')"
      >
        <Download :size="16" aria-hidden="true" />
        {{ rendering ? $t('reel.rendering') : $t('reel.renderMp4') }}
      </button>

      <p v-if="!canRender" class="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
        {{ $t('reel.noFfmpeg') }}
      </p>
      <p v-else-if="mode === 'youtube' || mode === 'none'" class="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
        {{ $t('reel.renderNeedsSource') }}
      </p>
      <p v-else-if="!rendering && !renderUrl" class="mt-2 text-[0.6875rem] text-ink-subtle">
        {{ $t('reel.renderEstimate', { s: Math.round(renderSeconds) }) }}
      </p>

      <div v-if="rendering" class="mt-3">
        <div class="h-1 overflow-hidden rounded-full bg-bg-deep">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-300"
            :style="{ width: `${Math.round((renderProgress ?? 0) * 100)}%` }"
          />
        </div>
        <p class="mt-1 text-[0.6875rem] text-ink-subtle">
          {{ $t('reel.renderingPct', { pct: Math.round((renderProgress ?? 0) * 100) }) }}
        </p>
      </div>

      <p v-if="renderError" class="mt-2 text-xs text-accent">
        {{ renderError }}
      </p>

      <a
        v-if="renderUrl && !rendering"
        :href="renderUrl"
        class="btn btn-ghost mt-3 w-full"
        download
      >
        <Download :size="15" aria-hidden="true" />
        {{ $t('reel.downloadMp4') }}
      </a>
    </section>

    <section class="border-t border-line pt-4">
      <p class="label">
        {{ $t('reel.project') }}
      </p>
      <div class="mt-2.5 flex gap-2">
        <button type="button" class="btn btn-sm btn-ghost flex-1" @click="emit('save')">
          <Save :size="15" aria-hidden="true" />
          {{ $t('reel.saveProject') }}
        </button>
        <label class="btn btn-sm btn-ghost flex-1 cursor-pointer">
          <FolderOpen :size="15" aria-hidden="true" />
          {{ $t('reel.openProject') }}
          <input type="file" accept=".reel,application/json" class="sr-only" @change="onProject">
        </label>
      </div>
      <p class="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
        {{ $t('reel.projectHint') }}
      </p>
    </section>
  </div>
</template>
