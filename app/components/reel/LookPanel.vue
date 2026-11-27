<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'
import type { ReelProject, TransitionId } from '~~/shared/reel'
import { TRANSITIONS } from '~~/shared/reel'

/**
 * How the reel is put together: how one clip gives way to the next, the
 * scoreboard, and what comes out the far end. Format and bookends sit in the
 * page header.
 *
 * The transition is four buttons rather than a menu because it is the one
 * choice here that changes the *feel* of the film, and it wants to be tried
 * rather than picked.
 */

const props = defineProps<{
  project: ReelProject
  /** Whether this match's intro / outro have been drawn for the current format. */
  drawn: boolean
  drawing?: boolean
}>()

const emit = defineEmits<{ patch: [patch: Partial<ReelProject>] }>()

const { t } = useI18n()

const height = computed({
  get: () => props.project.output.height,
  set: (value: 720 | 1080 | 1440 | 2160) =>
    emit('patch', { output: { ...props.project.output, height: value } }),
})

const fps = computed({
  get: () => props.project.output.fps,
  set: (value: 30 | 60) => emit('patch', { output: { ...props.project.output, fps: value } }),
})

const heightOptions: SelectOption<720 | 1080 | 1440 | 2160>[] = [
  { value: 720, label: '720p' },
  { value: 1080, label: '1080p' },
  { value: 1440, label: '1440p' },
  { value: 2160, label: '4K (2160p)' },
]

const fpsOptions: SelectOption<30 | 60>[] = [
  { value: 30, label: '30 fps' },
  { value: 60, label: '60 fps' },
]

const transitions = computed(() =>
  TRANSITIONS.map(id => ({ id, label: t(`reel.transitions.${id}`) })),
)

function pick(id: TransitionId) {
  emit('patch', { transition: id })
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div>
      <p class="label">
        {{ $t('reel.transition') }}
      </p>
      <div class="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-line bg-bg-deep p-1">
        <button
          v-for="option in transitions"
          :key="option.id"
          type="button"
          class="min-h-9 rounded-lg font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200"
          :class="project.transition === option.id
            ? 'bg-brand text-on-brand shadow-[var(--ui-glow-strong)]'
            : 'text-ink-muted hover:text-ink'"
          :aria-pressed="project.transition === option.id"
          @click="pick(option.id)"
        >
          {{ option.label }}
        </button>
      </div>

      <label v-if="project.transition !== 'cut'" class="mt-3 block">
        <span class="label">{{ $t('reel.transitionLength') }} · {{ project.transitionSeconds.toFixed(2) }}s</span>
        <input
          type="range" min="0.1" max="1.5" step="0.05"
          class="mt-2 w-full accent-[var(--ui-accent)]"
          :value="project.transitionSeconds"
          @input="emit('patch', { transitionSeconds: Number(($event.target as HTMLInputElement).value) })"
        >
      </label>
    </div>

    <div class="flex flex-col gap-2.5">
      <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-muted">
        <input
          type="checkbox" class="size-4 accent-[var(--ui-accent)]"
          :checked="project.scoreboard[project.orientation]"
          @change="emit('patch', { scoreboard: { ...project.scoreboard, [project.orientation]: ($event.target as HTMLInputElement).checked } })"
        >
        {{ $t('reel.captionsOn') }}
      </label>

      <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-muted">
        <input
          type="checkbox" class="size-4 accent-[var(--ui-accent)]"
          :checked="project.fadeEdges"
          @change="emit('patch', { fadeEdges: ($event.target as HTMLInputElement).checked })"
        >
        {{ $t('reel.fadeEdges') }}
      </label>

      <p v-if="!drawn" class="text-[0.6875rem] leading-relaxed text-ink-subtle">
        {{ drawing ? $t('reel.bookendDrawing') : $t('reel.bookendHint') }}
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <label class="block">
        <span class="label">{{ $t('reel.resolution') }}</span>
        <UiSelect v-model="height" class="mt-1.5" size="sm" :options="heightOptions" :label="$t('reel.resolution')" />
      </label>
      <label class="block">
        <span class="label">{{ $t('reel.frameRate') }}</span>
        <UiSelect v-model="fps" class="mt-1.5" size="sm" :options="fpsOptions" :label="$t('reel.frameRate')" />
      </label>
    </div>
  </div>
</template>
