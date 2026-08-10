<script setup lang="ts">
import { Keyboard } from '@lucide/vue'
import { bindingLabel, KEYBIND_ACTIONS, PLAYER_ACTIONS } from '~/composables/useKeybinds'

const props = withDefaults(
  defineProps<{
    videoId: string | null
    /**
     * Pull keystrokes back out of the iframe after a click into the player.
     * Both players want this now that shortcuts drive them; it stays a prop so
     * a future embed with no keyboard of its own can opt out.
     */
    restoreFocus?: boolean
  }>(),
  { restoreFocus: true },
)

const host = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')
const api = useYouTubePlayer(host, videoId, {
  restoreFocus: toRef(props, 'restoreFocus').value,
})
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(frame)

/**
 * Chrome appears with the cursor and leaves two seconds later, the way video
 * chrome should: there when you reach for it, gone while you watch.
 *
 * A cross-origin iframe swallows every pointer event inside it, so "the cursor
 * stopped moving" would not be observable — except that the shield below now
 * covers the iframe, so movement over the video reaches us after all. A paused
 * player keeps the chrome, and any shortcut counts as activity, so a keypress
 * never lands on a hidden overlay.
 */
const IDLE_MS = 2000
const cursorActive = ref(false)
const focused = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | null = null

function wake() {
  cursorActive.value = true
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    cursorActive.value = false
  }, IDLE_MS)
}

function sleep() {
  if (idleTimer) clearTimeout(idleTimer)
  cursorActive.value = false
}

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
})

const chromeVisible = computed(() =>
  cursorActive.value || focused.value || !api.isPlaying.value,
)

/** The sheet, built from the live bindings so a rebind shows up here too. */
const { bindings } = useKeybinds()

/**
 * Hover peeks at the sheet, a click pins it open, `?` does the same from the
 * keyboard. Kept as two flags because one was not enough: with a single
 * `open`, hovering the chip opened it and the click that followed closed it
 * again, so the button appeared to do nothing.
 */
const hovering = ref(false)
const pinned = ref(false)
const sheetOpen = computed(() => hovering.value || pinned.value)

const shortcutGroups = computed(() => {
  const groups = new Map<string, { label: string, keys: string }[]>()
  for (const id of PLAYER_ACTIONS) {
    const action = KEYBIND_ACTIONS.find(a => a.id === id)
    const keys = (bindings.value[id] ?? []).map(bindingLabel).join(' / ')
    if (!action || !keys) continue
    const list = groups.get(action.group) ?? []
    list.push({ label: action.label, keys })
    groups.set(action.group, list)
  }
  return [...groups].map(([name, items]) => ({ name, items }))
})

/** `?` opens the sheet from anywhere; Escape closes it. */
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
  if (event.key === '?') {
    pinned.value = !pinned.value
    wake()
    event.preventDefault()
  }
  else if (event.key === 'Escape' && sheetOpen.value) {
    pinned.value = false
    hovering.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ ...api, isFullscreen, toggleFullscreen, wake })
</script>

<template>
  <!--
    Full width of whatever column it is given, so the player lines up with the
    header, the timeline and the panels below it rather than sitting in a
    narrower box of its own.

    Fullscreen drops the frame, since there is nothing left to sit beside —
    the wrapper is the screen.
  -->
  <div
    ref="frame"
    class="group relative aspect-video w-full overflow-hidden bg-black"
    :class="isFullscreen ? 'rounded-none border-0' : 'rounded-2xl border border-line'"
    :style="isFullscreen ? undefined : 'box-shadow: var(--ui-glow-soft), var(--ui-shadow)'"
    @pointerenter="wake"
    @pointermove="wake"
    @pointerleave="sleep"
  >
    <div ref="host" class="h-full w-full" />

    <!--
      The shield. YouTube's own chrome is off, but the title and "Watch on
      YouTube" overlay cannot be turned off by any parameter, and a click on
      either opened a new tab — including clicks meant for our scoreboard,
      which sits over exactly that corner. Covering the iframe ends that, and
      hands us the click to use as play/pause instead.

      It also gives back pointer movement over the video, which a cross-origin
      iframe would otherwise swallow, so the chrome can idle out properly.
    -->
    <button
      v-if="videoId"
      type="button"
      data-testid="stage-shield"
      class="absolute inset-0 h-full w-full cursor-default"
      aria-label="Play or pause"
      tabindex="-1"
      @click="api.toggle()"
      @pointermove="wake"
    />

    <!--
      Overlay content sits above the shield. Anything interactive in here opts
      back in with pointer-events-auto.
    -->
    <div class="pointer-events-none absolute inset-0">
      <slot name="overlay" :is-fullscreen="isFullscreen" :chrome-visible="chromeVisible" />
    </div>

    <!--
      The shortcuts, as a corner mark rather than a panel: a permanent list
      over the match was more of the video covered than it was worth. It opens
      on hover, on click, or on `?`.
    -->
    <div
      v-if="videoId"
      class="pointer-events-none absolute right-3 flex flex-col items-end gap-2"
      :class="[
        chromeVisible || sheetOpen ? 'opacity-100' : 'opacity-0',
        // Clear of the scrub bar, which only rides over the video in fullscreen.
        isFullscreen ? 'bottom-28' : 'bottom-14',
      ]"
      style="transition: opacity 200ms"
      @pointerleave="hovering = false"
    >
      <div
        v-if="sheetOpen"
        data-testid="stage-shortcuts"
        class="pointer-events-auto max-h-[60vh] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-3 glass-menu"
        style="box-shadow: var(--ui-glow-soft), var(--ui-shadow)"
      >
        <div v-for="group in shortcutGroups" :key="group.name" class="mt-3 first:mt-0">
          <p class="font-display text-[0.625rem] uppercase tracking-[0.16em] text-ink-subtle">
            {{ group.name }}
          </p>
          <ul class="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <li
              v-for="item in group.items"
              :key="item.label"
              class="flex items-baseline justify-between gap-3 whitespace-nowrap text-xs leading-6 text-ink-muted"
            >
              <span>{{ item.label }}</span>
              <kbd class="rounded border border-line bg-panel px-1.5 font-mono text-[0.625rem] text-ink">{{ item.keys }}</kbd>
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        data-testid="stage-shortcuts-toggle"
        class="pointer-events-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/20 bg-black/50 px-2 text-[0.6875rem] text-white/70 backdrop-blur-sm transition-colors duration-150 hover:border-accent/60 hover:text-white"
        :aria-expanded="sheetOpen"
        aria-label="Keyboard shortcuts"
        @click="pinned = !pinned"
        @pointerenter="hovering = true"
        @focus="focused = true"
        @blur="focused = false"
      >
        <Keyboard :size="14" aria-hidden="true" />
        ?
      </button>
    </div>

    <p v-if="!videoId" class="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-subtle">
      {{ $t('player.noVideo') }}
    </p>
  </div>
</template>
