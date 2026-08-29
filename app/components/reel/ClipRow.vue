<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'
import type { GradeId, ReelClip } from '~~/shared/reel'
import { ChevronDown, ChevronUp, Eye, EyeOff, Play, Trash2 } from '@lucide/vue'
import { GRADES, MIN_CLIP_SECONDS, outSeconds, SPEEDS } from '~~/shared/reel'

/**
 * One clip, and everything that can be done to it.
 *
 * Collapsed it is a line: number, caption, length. Open it is the edit — trim,
 * speed, punch-in, grade, caption. A reel is twelve of these and a list of
 * twelve open panels is unreadable, so only the selected clip unfolds, and
 * selecting is the same gesture as clicking it on the ribbon.
 */

const props = defineProps<{
  clip: ReelClip
  index: number
  selected: boolean
  /** Length of the source video, so a trim cannot run off the end. */
  sourceDuration: number
  isFirst: boolean
  isLast: boolean
}>()

const emit = defineEmits<{
  select: []
  patch: [patch: Partial<ReelClip>]
  remove: []
  move: [delta: number]
  play: []
}>()

const { t } = useI18n()

const length = computed(() => outSeconds(props.clip))

function clock(seconds: number) {
  const whole = Math.max(0, seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole - minutes * 60
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`
}

/** Nudging an edge. The other edge holds, so a nudge never inverts the clip. */
function nudge(edge: 'from' | 'to', delta: number) {
  if (edge === 'from') {
    const from = Math.min(
      Math.max(0, props.clip.from + delta),
      props.clip.to - MIN_CLIP_SECONDS,
    )
    emit('patch', { from: Math.round(from * 100) / 100 })
    return
  }
  const ceiling = props.sourceDuration || Number.POSITIVE_INFINITY
  const to = Math.max(
    Math.min(ceiling, props.clip.to + delta),
    props.clip.from + MIN_CLIP_SECONDS,
  )
  emit('patch', { to: Math.round(to * 100) / 100 })
}

const speedOptions = computed<SelectOption<number>[]>(() =>
  SPEEDS.map(speed => ({
    value: speed,
    label: speed === 1 ? t('reel.realtime') : `${speed}×`,
  })),
)

const gradeOptions = computed<SelectOption<GradeId>[]>(() =>
  GRADES.map(grade => ({ value: grade, label: t(`reel.grades.${grade}`) })),
)

const speed = computed({
  get: () => props.clip.speed,
  set: (value: number) => emit('patch', { speed: value }),
})

const grade = computed({
  get: () => props.clip.grade,
  set: (value: GradeId) => emit('patch', { grade: value }),
})

const NUDGES = [-1, -0.25, 0.25, 1]
</script>

<template>
  <li
    data-testid="reel-clip"
    class="rounded-xl border transition-colors duration-200"
    :class="[
      selected ? 'border-accent/60 bg-accent-soft' : 'border-line bg-panel',
      clip.enabled ? '' : 'opacity-55',
    ]"
  >
    <div class="flex items-center gap-2 p-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        :aria-expanded="selected"
        @click="emit('select')"
      >
        <span
          class="grid size-7 shrink-0 place-items-center rounded-lg font-display text-xs font-bold tabular-nums"
          :class="selected ? 'bg-brand text-on-brand' : 'bg-bg-deep text-ink-muted'"
        >{{ index + 1 }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-display text-sm font-semibold text-ink">
            {{ clip.label || (clip.score ? `${clip.setNumber ? `Set ${clip.setNumber} · ` : ''}${clip.score}` : $t('reel.clipN', { n: index + 1 })) }}
          </span>
          <span class="block truncate font-mono text-[0.6875rem] tabular-nums text-ink-subtle">
            {{ clock(clip.from) }} → {{ clock(clip.to) }} · {{ length.toFixed(1) }}s
            <template v-if="clip.speed !== 1"> · {{ clip.speed }}×</template>
            <template v-if="clip.grade !== 'none'"> · {{ $t(`reel.grades.${clip.grade}`) }}</template>
          </span>
        </span>
      </button>

      <button
        type="button"
        class="grid size-9 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:text-accent"
        :aria-label="$t('reel.playClip')"
        @click="emit('play')"
      >
        <Play :size="15" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
        :class="clip.enabled ? 'text-accent' : 'text-ink-subtle hover:text-ink'"
        :aria-label="clip.enabled ? $t('reel.dropClip') : $t('reel.keepClip')"
        :aria-pressed="clip.enabled"
        @click="emit('patch', { enabled: !clip.enabled })"
      >
        <component :is="clip.enabled ? Eye : EyeOff" :size="15" aria-hidden="true" />
      </button>
    </div>

    <!-- The edit. Only the selected clip carries it, so a twelve-clip reel is
         still a list you can read. -->
    <div v-if="selected" class="border-t border-line/70 p-3 pt-3.5">
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <p class="label">
            {{ $t('reel.trimIn') }}
          </p>
          <div class="mt-1.5 flex items-center gap-1">
            <button
              v-for="delta in NUDGES"
              :key="`in${delta}`"
              type="button"
              class="btn btn-sm btn-ghost !min-h-8 !px-2 font-mono !text-[0.6875rem] !tracking-normal"
              @click="nudge('from', delta)"
            >
              {{ delta > 0 ? '+' : '' }}{{ delta }}
            </button>
          </div>
        </div>

        <div>
          <p class="label">
            {{ $t('reel.trimOut') }}
          </p>
          <div class="mt-1.5 flex items-center gap-1">
            <button
              v-for="delta in NUDGES"
              :key="`out${delta}`"
              type="button"
              class="btn btn-sm btn-ghost !min-h-8 !px-2 font-mono !text-[0.6875rem] !tracking-normal"
              @click="nudge('to', delta)"
            >
              {{ delta > 0 ? '+' : '' }}{{ delta }}
            </button>
          </div>
        </div>

        <label class="block">
          <span class="label">{{ $t('reel.speed') }}</span>
          <UiSelect v-model="speed" class="mt-1.5" size="sm" :options="speedOptions" :label="$t('reel.speed')" />
        </label>

        <label class="block">
          <span class="label">{{ $t('reel.grade') }}</span>
          <UiSelect v-model="grade" class="mt-1.5" size="sm" :options="gradeOptions" :label="$t('reel.grade')" />
        </label>

        <label class="block sm:col-span-2">
          <span class="label">{{ $t('reel.zoom') }} · {{ clip.zoom.toFixed(2) }}×</span>
          <input
            type="range"
            min="1"
            max="2"
            step="0.05"
            class="mt-2 w-full accent-[var(--ui-accent)]"
            :value="clip.zoom"
            @input="emit('patch', { zoom: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>

        <label class="block sm:col-span-2">
          <span class="label">{{ $t('reel.caption') }}</span>
          <input
            :value="clip.label"
            type="text"
            class="field mt-1.5 !min-h-10 !text-sm"
            :placeholder="clip.score ?? $t('reel.captionPlaceholder')"
            maxlength="120"
            @input="emit('patch', { label: ($event.target as HTMLInputElement).value })"
          >
        </label>
      </div>

      <div class="mt-3 flex items-center gap-2">
        <label class="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            class="size-4 accent-[var(--ui-accent)]"
            :checked="clip.showLabel"
            @change="emit('patch', { showLabel: ($event.target as HTMLInputElement).checked })"
          >
          {{ $t('reel.showCaption') }}
        </label>

        <div class="ml-auto flex items-center gap-1">
          <button
            type="button"
            class="grid size-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:text-accent disabled:opacity-40"
            :disabled="isFirst"
            :aria-label="$t('reel.moveUp')"
            @click="emit('move', -1)"
          >
            <ChevronUp :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:text-accent disabled:opacity-40"
            :disabled="isLast"
            :aria-label="$t('reel.moveDown')"
            @click="emit('move', 1)"
          >
            <ChevronDown :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:text-accent"
            :aria-label="$t('reel.removeClip')"
            @click="emit('remove')"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </li>
</template>
