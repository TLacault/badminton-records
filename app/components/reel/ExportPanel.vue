<script setup lang="ts">
import type { SourceMode, useReelSource } from '~/composables/useReelSource'
import type { ReelCapabilities, ReelOutput } from '~~/shared/reel'
import { Download, FolderOpen, Save } from '@lucide/vue'

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
  source: ReturnType<typeof useReelSource>
  /** Render size and frame rate, shown where the render is started. */
  output: ReelOutput
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
  output: [change: Partial<ReelOutput>]
}>()

function onProject(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('open', file)
}

</script>

<template>
  <div class="flex flex-col gap-5">
    <ReelSourcePanel :source="source" :duration="sourceDuration" />

    <section class="border-t border-line pt-4">
      <p class="label">
        {{ $t('reel.export') }}
      </p>

      <div class="mt-2.5 grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[0.6875rem] text-ink-subtle">Quality</span>
          <select class="field mt-1" :value="output.height" @change="emit('output', { height: Number(($event.target as HTMLSelectElement).value) as ReelOutput['height'] })">
            <option v-for="h in [2160, 1440, 1080, 720]" :key="h" :value="h">{{ h === 2160 ? '4K (2160p)' : `${h}p` }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[0.6875rem] text-ink-subtle">Frame rate</span>
          <select class="field mt-1" :value="output.fps" @change="emit('output', { fps: Number(($event.target as HTMLSelectElement).value) as ReelOutput['fps'] })">
            <option v-for="f in [60, 30]" :key="f" :value="f">{{ f }} fps</option>
          </select>
        </label>
      </div>

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

      <UiProgress v-if="rendering" class="mt-3" :value="renderProgress" :label="$t('reel.rendering')" />

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
          <input type="file" accept=".clip,.reel,application/json" class="sr-only" @change="onProject">
        </label>
      </div>
      <p class="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
        {{ $t('reel.projectHint') }}
      </p>
    </section>
  </div>
</template>
