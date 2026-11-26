<script setup lang="ts">
import { Download, Save } from '@lucide/vue'
import { drawThumbnail, drawVerticalThumbnail, exportThumbnail, loadImage, loadThumbnailFont, loadWordmarkFont, THUMB_H, THUMB_W, VTHUMB_H, VTHUMB_W } from '~/utils/thumbnail'

/**
 * Live thumbnail: Tim's template + the two bands, redrawn on every keystroke.
 * What is on screen is exactly what is downloaded or saved into the kit.
 */
const props = withDefaults(defineProps<{
  template: string
  lines: string[]
  colour: string
  matchId: string
  fileStem: string
  /** A clip's word under the tag ("HIGHLIGHTS"); empty for the full match. */
  highlights?: string
  /** The upload kit is the full match's; a clip's thumbnail is only downloaded. */
  saveable?: boolean
  /** 9:16 cover for a Short / Reel, composed in code (there is no vertical template). */
  vertical?: boolean
  /** The family tag the vertical cover draws (the 16:9 templates carry their own). */
  tag?: string
}>(), { highlights: '', saveable: true, vertical: false, tag: '' })

const width = computed(() => (props.vertical ? VTHUMB_W : THUMB_W))
const height = computed(() => (props.vertical ? VTHUMB_H : THUMB_H))
/** Export sizes: YouTube's 1280×720 + the 2560 master, or the 1080×1920 cover. */
const sizes = computed(() => (props.vertical ? [VTHUMB_W] : [1280, THUMB_W]))

const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref<string | null>(null)
const saved = ref<string | null>(null)
let image: HTMLImageElement | null = null
let portrait: Promise<[HTMLImageElement, HTMLImageElement]> | null = null

async function redraw() {
  if (!canvas.value) return
  try {
    await loadThumbnailFont('/api/publish/brand/fonts/Poppins-BoldItalic.ttf')
    await nextTick() // the canvas resizes when `vertical` flips, which clears it
    const ctx = canvas.value.getContext('2d')!
    if (props.vertical) {
      await loadWordmarkFont('/api/publish/brand/fonts/BarlowCondensed-BlackItalic.ttf')
      portrait ??= Promise.all([loadImage('/api/publish/brand/video/assets/portrait-bg.jpg'), loadImage('/api/publish/brand/video/assets/logo.png')])
      const [bg, logo] = await portrait
      drawVerticalThumbnail(ctx, bg, logo, props.tag, props.lines, props.colour, props.highlights)
    }
    else {
      if (!image || !image.src.endsWith(`/${props.template}`)) image = await loadImage(`/api/publish/brand/thumbnail/${props.template}`)
      drawThumbnail(ctx, image, props.lines, props.colour, props.highlights)
    }
    error.value = null
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(redraw)
watch(() => [props.template, props.colour, props.highlights, props.vertical, props.tag, ...props.lines], redraw)

async function download(size: number) {
  if (!canvas.value) return
  const blob = await exportThumbnail(canvas.value, size)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.fileStem}${props.vertical ? '-vertical' : size === THUMB_W ? '@2x' : ''}.png`
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
      :width="width"
      :height="height"
      class="block w-full rounded-lg border border-line bg-bg-deep"
      :class="vertical ? 'mx-auto aspect-[9/16] max-w-72' : 'aspect-video'"
      aria-label="Thumbnail preview"
    />
    <p v-if="error" class="mt-2 text-xs text-accent">
      {{ error }}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button v-if="saveable && !vertical" type="button" class="btn btn-sm btn-primary" @click="save">
        <Save :size="15" aria-hidden="true" />
        Save to upload kit
      </button>
      <button v-for="size in sizes" :key="size" type="button" class="btn btn-sm btn-ghost" @click="download(size)">
        <Download :size="15" aria-hidden="true" />
        {{ size }}×{{ Math.round(size * height / width) }}
      </button>
    </div>
    <p v-if="saved" class="mt-2 break-all font-mono text-[0.6875rem] text-ink-subtle">
      Saved: {{ saved }}
    </p>
  </div>
</template>
