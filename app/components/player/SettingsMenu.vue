<script setup lang="ts">
import { Check, EyeOff, Gauge, Keyboard, MonitorCog, SlidersHorizontal } from '@lucide/vue'
import { AUTO_HIDE_STOPS } from '~/composables/usePlayerSettings'

const props = defineProps<{
  rate: number
  rates: number[]
  /** YouTube's raw level name, already turned into `720p` and friends. */
  qualityLabel: string | null
  /** `player` hides the tagger's scoring and session keys. */
  keybindScope: 'all' | 'player'
}>()

const emit = defineEmits<{
  setRate: [rate: number]
  /** Stand our layer down so YouTube's own settings menu can be reached. */
  nativeControls: []
  close: []
}>()

const {
  autoHideSeconds,
  autoHide,
  chromeHeld,
  setAutoHideSeconds,
  setAutoHide,
} = usePlayerSettings()

// The chrome's idle timer counts pointer movement, and reading a list of
// shortcuts involves none. Held for as long as the menu is mounted, released
// however it closes — Escape, the gear, or the handover to YouTube.
onMounted(() => {
  chromeHeld.value = true
})
onBeforeUnmount(() => {
  chromeHeld.value = false
})

type SectionId = 'options' | 'keyboard'
const section = ref<SectionId>('options')

const { t } = useI18n()

const sections = computed(() => [
  { id: 'options' as const, label: t('player.settingsPlayer'), icon: SlidersHorizontal },
  { id: 'keyboard' as const, label: t('player.settingsKeyboard'), icon: Keyboard },
])

/** `1×` reads better than `1x`, and `0.5×` needs no trailing zero. */
function rateLabel(value: number) {
  return `${value}×`
}

/**
 * `0.5` → `0.5s`, `2` → `2s`. The half-steps need their decimal and the whole
 * ones must not carry a `.0`, or the scale reads as twice as many values.
 */
function secondsLabel(value: number) {
  return `${value}s`
}

const rateOpen = ref(false)
function pickRate(value: number) {
  emit('setRate', value)
  rateOpen.value = false
}

/**
 * Escape closes the menu before anything else can have the key.
 *
 * Capture phase, and stopped: the stage listens for Escape to leave the
 * YouTube handover, and the pages listen for every bound shortcut. A menu that
 * is open owns the key that closes it.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <!--
    Anchored to the bar it opened from, and sized to the frame rather than to
    its contents: the keyboard section is thirty rows long and would otherwise
    run off the top of a windowed player.
  -->
  <div
    data-testid="settings-menu"
    class="pointer-events-auto absolute bottom-full right-2 z-30 mb-1 flex sm:right-3 max-h-[min(17rem,45vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl glass-menu"
    role="dialog"
    :aria-label="$t('player.settings')"
  >
    <div class="flex shrink-0 items-center gap-1 border-b border-line p-1">
      <button
        v-for="s in sections"
        :key="s.id"
        type="button"
        :data-testid="`settings-tab-${s.id}`"
        class="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em] transition-colors duration-150"
        :class="section === s.id ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink'"
        :aria-pressed="section === s.id"
        @click="section = s.id"
      >
        <component :is="s.icon" :size="13" aria-hidden="true" />
        {{ s.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <template v-if="section === 'options'">
        <!--
          Auto-hide. A range rather than a set of chips: ten stops is too many
          to click through, and the thing being chosen is a duration, which is
          what a slider is for. Off sits beside it rather than at the bottom of
          the scale — "never" is not a shorter wait, it is a different answer.
        -->
        <div>
          <div class="flex items-baseline justify-between gap-2">
            <p class="label text-[0.6875rem]">
              {{ $t('player.hideAfter') }}
            </p>
            <span
              data-testid="autohide-value"
              class="font-mono text-xs tabular-nums"
              :class="autoHide ? 'text-accent' : 'text-ink-subtle'"
            >{{ autoHide ? secondsLabel(autoHideSeconds) : $t('player.never') }}</span>
          </div>

          <input
            data-testid="autohide-range"
            type="range"
            class="player-range mt-2 w-full"
            :min="AUTO_HIDE_STOPS[0]"
            :max="AUTO_HIDE_STOPS[AUTO_HIDE_STOPS.length - 1]"
            :step="0.5"
            :value="autoHide ? autoHideSeconds : AUTO_HIDE_STOPS[0]"
            :disabled="!autoHide"
            aria-label="Seconds before the controls hide"
            @input="setAutoHideSeconds(Number(($event.target as HTMLInputElement).value))"
          >

          <!-- The stops, drawn under the track so the steps are visible rather
               than merely felt. Only the ends are labelled: ten numbers under a
               slider this wide is a ruler, not a control. -->
          <div class="mt-1 flex items-center justify-between" :class="autoHide ? '' : 'opacity-40'">
            <span
              v-for="stop in AUTO_HIDE_STOPS"
              :key="stop"
              class="h-1 w-px"
              :class="stop <= autoHideSeconds && autoHide ? 'bg-accent/70' : 'bg-line-strong'"
              aria-hidden="true"
            />
          </div>
          <div class="flex items-center justify-between font-mono text-[0.625rem] text-ink-subtle">
            <span>{{ secondsLabel(AUTO_HIDE_STOPS[0]!) }}</span>
            <span>{{ secondsLabel(AUTO_HIDE_STOPS[AUTO_HIDE_STOPS.length - 1]!) }}</span>
          </div>

          <button
            type="button"
            data-testid="autohide-off"
            class="mt-2 inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors duration-150"
            :class="autoHide
              ? 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
              : 'border-accent/50 bg-accent-soft text-accent'"
            :aria-pressed="!autoHide"
            @click="setAutoHide(!autoHide)"
          >
            <EyeOff :size="13" aria-hidden="true" />
            {{ $t('player.neverHide') }}
            <Check v-if="!autoHide" :size="13" aria-hidden="true" />
          </button>
        </div>

        <div class="mt-4 border-t border-line pt-3">
          <p class="label text-[0.6875rem]">
            {{ $t('player.picture') }}
          </p>

          <!--
            The same handover the bar's chip performs. Quality cannot be set
            through the API — every level passed to it is ignored — so the only
            way in is YouTube's own menu, and the only way there is to stop
            covering the player.
          -->
          <button
            type="button"
            data-testid="settings-quality"
            class="mt-2 flex w-full min-h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-accent/50 hover:text-ink"
            :title="$t('player.qualityHint')"
            @click="emit('nativeControls')"
          >
            <MonitorCog :size="14" aria-hidden="true" />
            {{ $t('player.quality') }}
            <span class="ml-auto font-mono tabular-nums text-accent">{{ qualityLabel ?? $t('player.qualityAuto') }}</span>
          </button>

          <div class="relative mt-1.5">
            <button
              type="button"
              data-testid="settings-rate"
              class="flex w-full min-h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-accent/50 hover:text-ink"
              :aria-expanded="rateOpen"
              @click="rateOpen = !rateOpen"
            >
              <Gauge :size="14" aria-hidden="true" />
              {{ $t('player.speed') }}
              <span class="ml-auto font-mono tabular-nums text-accent">{{ rateLabel(rate) }}</span>
            </button>

            <!-- Inline rather than floating: a menu inside a menu that escapes
                 its scroll container is a menu that lands off the frame. -->
            <ul v-if="rateOpen" class="mt-1 grid grid-cols-4 gap-1" role="listbox">
              <li v-for="value in rates" :key="value">
                <button
                  type="button"
                  role="option"
                  :aria-selected="value === rate"
                  class="w-full rounded-md border px-1 py-1.5 text-center font-mono text-xs tabular-nums transition-colors duration-100"
                  :class="value === rate
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-line text-ink-muted hover:border-accent/40 hover:text-ink'"
                  @click="pickRate(value)"
                >
                  {{ rateLabel(value) }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </template>

      <PlayerKeyHelp v-else embedded :scope="props.keybindScope" />
    </div>
  </div>
</template>

<style scoped>
/*
 * A range that matches the rest of the chrome rather than the operating
 * system's. Written out per engine because a range input has no single
 * cross-browser hook for its track and thumb.
 */
.player-range {
  -webkit-appearance: none;
  appearance: none;
  height: 1.25rem;
  background: transparent;
  cursor: pointer;
}

.player-range:disabled {
  cursor: default;
  opacity: 0.4;
}

.player-range::-webkit-slider-runnable-track {
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-line-strong);
}

.player-range::-moz-range-track {
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-line-strong);
}

.player-range::-moz-range-progress {
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-accent);
}

.player-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0.875rem;
  height: 0.875rem;
  margin-top: -0.3125rem;
  border-radius: 999px;
  background: var(--ui-accent);
  box-shadow: var(--ui-glow-soft);
}

.player-range::-moz-range-thumb {
  width: 0.875rem;
  height: 0.875rem;
  border: 0;
  border-radius: 999px;
  background: var(--ui-accent);
  box-shadow: var(--ui-glow-soft);
}
</style>
