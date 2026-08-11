<script setup lang="ts">
import type { ListRow, MatchEntry } from '~/utils/videoFilters'
import { CalendarDays, CircleDashed, Flame, Play, Scissors, Trophy } from '@lucide/vue'

const { t, bcp47 } = useI18n()

const props = withDefaults(
  defineProps<{
    entry: MatchEntry<ListRow>
    /** The lead card of a session: bigger type, eager thumbnail. */
    featured?: boolean
  }>(),
  { featured: false },
)

const match = computed(() => props.entry.row)
const tagged = computed(() => match.value.tagging_status === 'tagged')
const editing = computed(() => match.value.tagging_status === 'in_progress')
const badgeLabel = computed(() => (editing.value ? t('card.editing') : t('card.edited')))

/*
 * Same chip, two weights. The finished cut is solid crimson; a match still
 * being edited keeps the hue but lets the still show through it, so the corner
 * reads at a glance as "nearly" rather than competing with the real thing.
 */
const badgeClass = computed(() =>
  editing.value
    ? 'border border-white/25 bg-accent/35 text-white backdrop-blur-md'
    : 'bg-accent text-on-brand',
)
const badgeGlow = computed(() =>
  editing.value ? 'var(--ui-glow-soft)' : 'var(--ui-glow-strong)',
)
// Scissors are drawn as line work — filling them the way the flame is filled
// collapses the blades into a blob at 14px.
const badgeIcon = computed(() => (editing.value ? Scissors : Flame))
const discipline = computed(() => disciplineCode(match.value.format))

// The format has moved up into its own chip as DH/SH, so it would read twice
// here — the date and the hall are what is left.
const meta = computed(() =>
  [formatDateShort(match.value.played_on, bcp47.value, t('common.undated')), match.value.venue]
    .filter(Boolean)
    .join(' · '),
)

const CHIP = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.1em]'

/*
 * The result chip carries a score, nothing else. A match tagged up to the
 * middle of the first set has no set to show and falls back to the words "In
 * progress" — which the crimson "Editing" badge on the thumbnail already says,
 * louder and in the right place. Once a set is decided the chip has a real
 * score to carry and comes back.
 */
const showResult = computed(() => {
  const outcome = props.entry.outcome
  return !!outcome && outcome.scoreLabel !== outcome.label
})

/** Weight, not hue: a win is the filled chip, a loss the plain outline. */
const resultClass = computed(() => {
  switch (props.entry.outcome?.state) {
    case 'won': return 'border-transparent bg-brand text-on-brand'
    case 'lost': return 'border-line-strong text-ink-muted'
    default: return 'border-dashed border-line text-ink-subtle'
  }
})
</script>

<template>
  <article
    class="group relative overflow-hidden rounded-2xl glass transition-[transform,box-shadow,border-color] duration-300 ease-brand hover:-translate-y-1 hover:border-accent/40 has-[a:focus-visible]:-translate-y-1"
    :class="featured ? 'sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:items-center sm:rounded-3xl' : ''"
  >
    <!--
      The whole card opens the match. A stretched link rather than a card
      wrapped in one, because the card now also holds the share button, and a
      link cannot contain a button.
    -->
    <NuxtLink
      :to="`/matches/${match.id}`"
      class="absolute inset-0 z-10 rounded-2xl"
      :aria-label="entry.title"
    />
    <!-- The lead card splits sideways rather than stacking: a full-width 16:9
         still is over 700px tall on a laptop, which buries everything after
         it under one thumbnail. -->
    <div class="relative overflow-hidden bg-bg-deep">
      <img
        v-if="match.youtube_thumbnail_url"
        :src="match.youtube_thumbnail_url"
        alt=""
        width="1280"
        height="720"
        :loading="featured ? 'eager' : 'lazy'"
        decoding="async"
        class="aspect-video w-full object-cover transition-transform duration-500 ease-brand group-hover:scale-[1.04]"
      >
      <div v-else class="grid aspect-video w-full place-items-center text-ink-subtle">
        <CircleDashed :size="28" aria-hidden="true" />
      </div>

      <!-- Bottom scrim. The chips sit on video stills whose brightness we do
           not control, so contrast has to be manufactured, not hoped for. -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent"
        aria-hidden="true"
      />

      <!-- Play affordance. Scales up from the centre on hover rather than
           fading in, so it reads as the card offering itself. -->
      <span
        class="pointer-events-none absolute inset-0 grid place-items-center"
        aria-hidden="true"
      >
        <span
          class="grid size-14 place-items-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 backdrop-blur-md transition-[opacity,transform] duration-300 ease-brand group-hover:scale-100 group-hover:opacity-100 group-has-[a:focus-visible]:scale-100 group-has-[a:focus-visible]:opacity-100"
          :class="featured ? 'scale-90' : 'scale-75'"
          style="box-shadow: var(--ui-glow-strong)"
        >
          <Play :size="20" class="ml-0.5 fill-current" />
        </span>
      </span>

      <span
        v-if="match.youtube_duration_seconds"
        class="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-xs tabular-nums text-white backdrop-blur-sm"
      >{{ formatDuration(match.youtube_duration_seconds) }}</span>

      <!-- "Edited", not "tagged": from the outside the promise is the live
           score, the timeline and the stats, not the work that produced them.

           Filled crimson rather than outlined over black — it is the one thing
           on the card worth crossing the wall for, and an outline chip beside
           the duration read as another piece of metadata.

           A match under way wears the same chip reading "Editing", in the same
           crimson but translucent — the work is worth announcing before it
           lands, without pulling the eye off the ones that are done. -->
      <span
        v-if="tagged || editing"
        class="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-display text-xs font-bold uppercase tracking-[0.14em]"
        :class="badgeClass"
        :style="{ boxShadow: badgeGlow }"
      >
        <component
          :is="badgeIcon"
          :size="14"
          :fill="editing ? 'none' : 'currentColor'"
          aria-hidden="true"
        />
        {{ badgeLabel }}
      </span>

      <!-- The opposite corner from the badge, and the same corner YouTube puts
           its own quality mark in. The share button joins them rather than
           taking a corner of its own: three occupied corners and a play glyph
           is as much as a still can carry. -->
      <!--
        Above the stretched link, or the link would swallow the click — but
        only the button takes clicks back. A chip that reads as a label should
        not be a hole in a card you can otherwise click anywhere.
      -->
      <div class="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1.5">
        <UiShareButton
          :to="`/matches/${match.id}`"
          class="pointer-events-auto grid size-6 place-items-center rounded-md border border-white/25 bg-black/70 text-white backdrop-blur-sm transition-colors duration-200 hover:border-accent hover:text-accent"
        />
        <span
          v-if="match.is_4k"
          data-testid="card-4k"
          class="rounded-md border border-white/25 bg-black/70 px-1.5 py-0.5 font-display text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-white backdrop-blur-sm"
          :title="$t('card.fourKTitle')"
        >{{ $t('card.fourK') }}</span>
      </div>
    </div>

    <div class="p-4" :class="featured ? 'sm:p-7' : ''">
      <p
        v-if="featured"
        class="mb-2 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-accent"
      >
        {{ $t('card.latest') }}
      </p>

      <!-- The fixture, built from the roster. The YouTube upload name is not
           shown anywhere on the site. -->
      <h3
        class="font-display font-semibold uppercase leading-tight tracking-wide text-ink transition-colors duration-200 group-hover:text-accent"
        :class="featured ? 'text-xl sm:text-3xl' : 'text-base'"
      >
        {{ entry.title }}
      </h3>

      <!-- What the match was and how it ended, in that order. The set-by-set
           scores are the match page's job; a card that listed them made the
           row it belongs to unreadable at a glance. -->
      <ul class="mt-2 flex flex-wrap items-center gap-1.5">
        <li v-if="entry.typeLabel">
          <span :class="CHIP" class="border-line text-ink-muted">{{ entry.typeLabel }}</span>
        </li>
        <li>
          <span :class="CHIP" class="border-line text-ink-muted">{{ discipline }}</span>
        </li>
        <li v-if="showResult && entry.outcome">
          <span :class="[CHIP, resultClass]" :data-result="entry.outcome.state">
            <Trophy v-if="entry.outcome.state === 'won'" :size="10" aria-hidden="true" />
            <span class="tabular-nums">{{ entry.outcome.scoreLabel }}</span>
          </span>
        </li>
      </ul>

      <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <CalendarDays :size="13" class="shrink-0" aria-hidden="true" />
        {{ meta }}
      </p>
    </div>
  </article>
</template>
