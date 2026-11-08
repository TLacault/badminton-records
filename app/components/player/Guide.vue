<script setup lang="ts">
import { CircleHelp, X } from '@lucide/vue'

const props = defineProps<{
  /** The player frame: in fullscreen it is the only thing on screen. */
  frame: HTMLElement | null
  isFullscreen: boolean
}>()

const { t } = useI18n()
const { open, close } = usePlayerGuide()
const { chromeHeld, menuOpen } = usePlayerSettings()

/** Each step spotlights one thing, found by its test id. */
const ALL_STEPS = ['frame', 'scoreboard', 'timeline', 'quality', 'settings', 'guide'] as const
type StepId = typeof ALL_STEPS[number]
const TARGETS: Record<StepId, string> = {
  frame: 'stage-frame',
  scoreboard: 'scoreboard',
  timeline: 'match-timeline',
  quality: 'control-quality',
  settings: 'control-settings',
  guide: 'control-guide',
}

const scope = () => (props.isFullscreen && props.frame) || document

function targetOf(id: StepId) {
  const el = scope().querySelector<HTMLElement>(`[data-testid="${TARGETS[id]}"]`)
  return el && el.getClientRects().length ? el : null
}

/** Only the steps whose target is on screen: a hidden scoreboard is skipped. */
const steps = ref<StepId[]>([])
const index = ref(0)
const step = computed(() => steps.value[index.value] ?? null)

const PAD = 6
const GAP = 12
const rect = ref<{ top: number, left: number, width: number, height: number } | null>(null)
const card = ref<HTMLElement | null>(null)
const cardPos = ref({ top: 0, left: 0 })

function measure() {
  const el = step.value && targetOf(step.value)
  if (!el) {
    rect.value = null
    return
  }
  const r = el.getBoundingClientRect()
  rect.value = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }

  // Below the target if it fits, else above, else over its lower edge.
  const vw = window.innerWidth
  const vh = window.innerHeight
  const ch = card.value?.offsetHeight ?? 180
  const cw = card.value?.offsetWidth ?? 320
  const below = rect.value.top + rect.value.height + GAP
  const above = rect.value.top - GAP - ch
  const top = below + ch <= vh - GAP ? below : above >= GAP ? above : Math.max(GAP, vh - ch - GAP)
  const centre = rect.value.left + rect.value.width / 2 - cw / 2
  cardPos.value = { top, left: Math.min(Math.max(GAP, centre), vw - cw - GAP) }
}

async function show() {
  await nextTick()
  const el = step.value && targetOf(step.value)
  if (el && !props.isFullscreen) {
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  measure()
  // Once more after the card has rendered its new text at its new height.
  requestAnimationFrame(measure)
}

function start() {
  menuOpen.value = false
  chromeHeld.value = true
  index.value = 0
  // The bar has to be up for its buttons to be found.
  nextTick(() => {
    steps.value = ALL_STEPS.filter(id => targetOf(id))
    show()
  })
}

function finish() {
  chromeHeld.value = false
  close()
}

function go(delta: 1 | -1) {
  const next = index.value + delta
  if (next < 0) return
  if (next >= steps.value.length) return finish()
  index.value = next
  show()
}

watch(open, value => (value ? start() : (chromeHeld.value = false)))
watch(() => props.isFullscreen, () => open.value && start())

/** While the tour is up it owns the keyboard: no shortcut fires under it. */
function onKey(event: KeyboardEvent) {
  if (!open.value) return
  event.stopPropagation()
  if (event.type !== 'keydown') return
  if (event.key === 'Escape') finish()
  else if (event.key === 'ArrowRight' || event.key === 'Enter') go(1)
  else if (event.key === 'ArrowLeft') go(-1)
  else return
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('keyup', onKey, true)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  if (open.value) chromeHeld.value = false
})
</script>

<template>
  <Teleport :to="isFullscreen && frame ? frame : 'body'">
    <div v-if="open && step" data-testid="player-guide" class="fixed inset-0 z-[100]">
      <!-- Swallows every press outside the card: the tour is read, not clicked through. -->
      <div class="absolute inset-0" @pointerdown.stop.prevent />

      <!-- The spotlight: a hole in the dimming, ringed in the accent. -->
      <div
        v-if="rect"
        class="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-300 ease-brand"
        :style="{
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.68)',
        }"
        aria-hidden="true"
      />

      <div
        ref="card"
        role="dialog"
        aria-modal="true"
        :aria-label="t(`guide.${step}.title`)"
        class="absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-xl p-4 text-ink glass-menu transition-[top,left] duration-300 ease-brand"
        :style="{ top: `${cardPos.top}px`, left: `${cardPos.left}px` }"
      >
        <div class="flex items-start justify-between gap-3">
          <p class="eyebrow">
            <CircleHelp :size="13" aria-hidden="true" />
            {{ index + 1 }} / {{ steps.length }}
          </p>
          <button
            type="button"
            data-testid="guide-hide"
            class="-m-1 grid size-7 place-items-center rounded-md text-ink-subtle transition-colors duration-150 hover:text-accent"
            :aria-label="t('guide.hide')"
            :title="t('guide.hide')"
            @click="finish"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </div>

        <h2 class="mt-2 font-display text-base font-bold uppercase tracking-wide">
          {{ t(`guide.${step}.title`) }}
        </h2>
        <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {{ t(`guide.${step}.body`) }}
        </p>

        <div class="mt-4 flex items-center gap-2">
          <button
            type="button"
            class="btn btn-sm btn-ghost text-ink-subtle"
            @click="finish"
          >
            {{ t('guide.hide') }}
          </button>
          <button
            v-if="index > 0"
            type="button"
            class="btn btn-sm btn-ghost ml-auto"
            @click="go(-1)"
          >
            {{ t('guide.back') }}
          </button>
          <button
            type="button"
            data-testid="guide-next"
            class="btn btn-sm btn-primary"
            :class="index > 0 ? '' : 'ml-auto'"
            @click="go(1)"
          >
            {{ index === steps.length - 1 ? t('guide.done') : t('guide.next') }}
          </button>
        </div>

        <p class="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-xs text-ink-subtle">
          <CircleHelp :size="12" class="shrink-0" aria-hidden="true" />
          {{ t('guide.reopen') }}
        </p>
      </div>
    </div>
  </Teleport>
</template>
