<script setup lang="ts">
import type { DerivedMatch } from '~~/shared/badminton'
import { CalendarDays, Clapperboard, Clock, Eye, Film, MapPin, Smartphone, Sparkles, Swords, Trophy, Users } from '@lucide/vue'

const { t, bcp47 } = useI18n()

const props = defineProps<{
  matchId: string
  videoId: string | null
  sideNames: Record<number, string>
  derived: DerivedMatch | null
  typeLabel: string | null
  format: string
  playedOn: string | null
  venue: string | null
  durationSeconds: number | null
  revealed: boolean
  /** This video and the others cut from the same match, by kind. */
  versions?: { id: string, kind: string, current: boolean }[]
  /** The video's YouTube title: the heading when there is one. */
  title?: string | null
  /** `/matches` on the site, `/admin/matches` in the admin's view. */
  linkBase?: string
  /** The admin's view: the bar above already switches versions, so one tight row. */
  compact?: boolean
}>()

/** Raw · Match · Highlights · Shorts, always four: a missing version is a quiet tab. */
const KINDS = ['raw', 'match', 'highlights', 'shorts'] as const
const KIND_ICONS = { raw: Film, match: Clapperboard, highlights: Sparkles, shorts: Smartphone }
const tiles = computed(() => KINDS.map(kind => ({
  kind,
  icon: KIND_ICONS[kind],
  label: t(`card.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`),
  version: props.versions?.find(v => v.kind === kind && v.current) ?? props.versions?.find(v => v.kind === kind) ?? null,
})))

const emit = defineEmits<{ reveal: [] }>()

/**
 * The heading is the video's YouTube title, as on the channel (Tim's call: the
 * uploads are now named by the YouTube tool, no spoilers in them). The fixture
 * from the roster when a video has no title.
 */
const heading = computed(() => props.title?.trim() || `${props.sideNames[1]} vs ${props.sideNames[2]}`)

/**
 * Tags carry weight, not hue: the palette is two colours, so importance is
 * shown by fill and outline rather than by inventing a third.
 */
const facts = computed(() => {
  const out: { key: string, icon: unknown, text: string }[] = []
  if (props.playedOn) out.push({ key: 'date', icon: CalendarDays, text: formatDateLong(props.playedOn, bcp47.value, t('common.undated')) })
  out.push({ key: 'format', icon: Users, text: props.format === 'singles' ? 'Singles' : 'Doubles' })
  if (props.venue) out.push({ key: 'venue', icon: MapPin, text: props.venue })
  if (props.durationSeconds) out.push({ key: 'length', icon: Clock, text: formatDuration(props.durationSeconds) })
  return out
})

const result = computed(() => {
  const d = props.derived
  if (!d) return null
  if (!d.complete || !d.matchWinnerSide) {
    return d.rallyStates.length
      ? { spoiler: false, text: 'Tagging in progress' }
      : { spoiler: false, text: 'Not tagged yet' }
  }
  const won = d.matchWinnerSide === 1
  // Sets are always read our-side first, win or lose, so the number on the
  // left means the same thing in every match.
  return { spoiler: true, text: `${won ? 'Won' : 'Lost'} ${d.setsWon[0]}–${d.setsWon[1]}` }
})

const TAB = 'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition-colors duration-200'
const CHIP = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-[0.1em]'
</script>

<template>
  <header data-testid="match-header" class="relative overflow-hidden rounded-2xl glass" :class="compact ? 'px-5 py-4' : 'p-5 sm:p-6'">
    <div
      class="pointer-events-none absolute inset-y-[-60%] right-8 w-16 -skew-x-12 slash opacity-10 blur-lg"
      aria-hidden="true"
    />

    <!-- The type is a tag below, not the eyebrow: printing it twice reads as a
         mistake rather than as emphasis. -->
    <p v-if="!compact" class="eyebrow">
      <Swords :size="14" aria-hidden="true" />
      {{ $t('match.label') }}
    </p>

    <!-- The button rides with the title rather than with the tags below: it
         acts on the match as a whole, which is what the title names. -->
    <div class="relative flex flex-wrap justify-between gap-4 sm:flex-nowrap" :class="compact ? 'items-center' : 'mt-2.5 items-start'">
      <h1
        data-testid="match-heading"
        class="font-display text-[clamp(1.5rem,3.6vw,2.5rem)] font-bold uppercase leading-[1.02] tracking-tight"
      >
        {{ heading }}
      </h1>

      <div class="flex shrink-0 flex-col items-start gap-2 sm:items-end">
      <nav v-if="versions?.length" aria-label="Versions" class="flex gap-1 rounded-xl border border-line bg-bg-deep p-1">
        <template v-for="tile in tiles" :key="tile.kind">
          <span
            v-if="tile.version?.current"
            aria-current="page"
            :class="TAB"
            class="bg-brand text-on-brand"
          ><component :is="tile.icon" :size="13" aria-hidden="true" />{{ tile.label }}</span>
          <NuxtLink
            v-else-if="tile.version"
            :to="`${linkBase ?? '/matches'}/${tile.version.id}`"
            :class="TAB"
            class="text-ink-muted hover:text-ink"
          ><component :is="tile.icon" :size="13" aria-hidden="true" />{{ tile.label }}</NuxtLink>
          <span
            v-else
            :class="TAB"
            class="text-ink-subtle/50"
            :title="`${tile.label}: not out yet`"
          ><component :is="tile.icon" :size="13" aria-hidden="true" />{{ tile.label }}</span>
        </template>
      </nav>
      <div class="flex shrink-0 items-center gap-1">
        <UiShareButton
          :to="`/matches/${matchId}`"
          :label="$t('share.action')"
          class="btn btn-sm btn-ghost"
        />
        <a
          v-if="videoId"
          data-testid="match-youtube"
          :href="`https://www.youtube.com/watch?v=${videoId}`"
          target="_blank"
          rel="noopener"
          class="btn btn-sm btn-ghost"
        >
          <UiYouTubeGlyph :size="14" />
          YouTube
        </a>
      </div>
      </div>
    </div>

    <ul class="relative flex flex-wrap items-center gap-2" :class="compact ? 'mt-2' : 'mt-4'">
      <li v-if="typeLabel">
        <span :class="CHIP" class="border-accent/35 bg-accent-soft text-accent">
          {{ typeLabel }}
        </span>
      </li>
      <li v-for="fact in facts" :key="fact.key">
        <span :class="CHIP" class="border-line text-ink-muted">
          <component :is="fact.icon" :size="13" class="text-ink-subtle" aria-hidden="true" />
          {{ fact.text }}
        </span>
      </li>

      <li v-if="result">
        <!-- Known results stay behind a click; a match nobody has tagged has
             nothing to give away, so it is printed plainly. -->
        <button
          v-if="result.spoiler && !revealed"
          type="button"
          data-testid="result-reveal"
          :class="CHIP"
          class="border-line-strong text-ink-subtle transition-colors duration-200 hover:border-accent/50 hover:text-accent"
          @click="emit('reveal')"
        >
          <Eye :size="13" aria-hidden="true" />
          {{ $t('match.resultHidden') }}
        </button>
        <span
          v-else-if="result.spoiler"
          data-testid="match-result"
          :class="CHIP"
          class="border-transparent bg-brand text-on-brand"
          style="box-shadow: var(--ui-glow-strong)"
        >
          <Trophy :size="13" aria-hidden="true" />
          {{ result.text }}
        </span>
        <span v-else :class="CHIP" class="border-dashed border-line text-ink-subtle">
          {{ result.text }}
        </span>
      </li>
    </ul>
  </header>
</template>
