<script setup lang="ts">
import { Download, Save } from '@lucide/vue'
import { drawThumbnail, exportThumbnail, loadImage, loadThumbnailFont, THUMB_H, THUMB_W } from '~/utils/thumbnail'

/**
 * Live thumbnail: Tim's template + the two bands, redrawn on every keystroke.
 * What is on screen is exactly what is downloaded or saved into the kit.
 */
const props = defineProps<{
  template: string
  lines: string[]
  colour: string
  matchId: string
  fileStem: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref<string | null>(null)
const saved = ref<string | null>(null)
let image: HTMLImageElement | null = null

async function redraw() {
  if (!canvas.value) return
  try {
    await loadThumbnailFont('/api/publish/brand/fonts/Poppins-BoldItalic.ttf')
    if (!image || !image.src.endsWith(`/${props.template}`)) image = await loadImage(`/api/publish/brand/thumbnail/${props.template}`)
    drawThumbnail(canvas.value.getContext('2d')!, image, props.lines, props.colour)
    error.value = null
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(redraw)
watch(() => [props.template, props.colour, ...props.lines], redraw)

async function download(width: number) {
  if (!canvas.value) return
  const blob = await exportThumbnail(canvas.value, width)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.fileStem}${width === THUMB_W ? '@2x' : ''}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

async function save() {
  if (!canvas.value) return
  saved.value = null
  for (const width of [1280, THUMB_W]) {
    const blob = await exportThumbnail(canvas.value, width)
    const res = await $fetch<{ path: string }>(`/api/publish/${props.matchId}/thumbnail?size=${width}`, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/png' } })
    if (width === 1280) saved.value = res.path
  }
}
</script>

<template>
  <div>
    <canvas
      ref="canvas"
      :width="THUMB_W"
      :height="THUMB_H"
      class="block aspect-video w-full rounded-lg border border-line bg-bg-deep"
      aria-label="Thumbnail preview"
    />
    <p v-if="error" class="mt-2 text-xs text-accent">
      {{ error }}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm btn-primary" @click="save">
        <Save :size="15" aria-hidden="true" />
        Save to upload kit
      </button>
      <button type="button" class="btn btn-sm btn-ghost" @click="download(1280)">
        <Download :size="15" aria-hidden="true" />
        1280×720
      </button>
      <button type="button" class="btn btn-sm btn-ghost" @click="download(THUMB_W)">
        <Download :size="15" aria-hidden="true" />
        2560×1440
      </button>
    </div>
    <p v-if="saved" class="mt-2 break-all font-mono text-[0.6875rem] text-ink-subtle">
      Saved: {{ saved }}
    </p>
  </div>
</template>
