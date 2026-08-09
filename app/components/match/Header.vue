<script setup lang="ts">
import type { DerivedMatch } from '~~/shared/badminton'
import { CalendarDays, Clock, Eye, MapPin, Swords, Trophy, Users } from '@lucide/vue'

const props = defineProps<{
  sideNames: Record<number, string>
  derived: DerivedMatch | null
  typeLabel: string | null
  format: string
  playedOn: string | null
  venue: string | null
  durationSeconds: number | null
  revealed: boolean
}>()

const emit = defineEmits<{ reveal: [] }>()

/**
 * The heading is the fixture, built from the roster. The stored title is a
 * YouTube upload name — "JEUX LIBRE - THOMAS X BLUD #1 - WIN" — and putting a
 * spoiler in 48px type above the video defeats the point of hiding the result
 * six inches below it.
 */
const heading = computed(() => `${props.sideNames[1]} vs ${props.sideNames[2]}`)

/**
 * Tags carry weight, not hue: the palette is two colours, so importance is
 * shown by fill and outline rather than by inventing a third.
 */
const facts = computed(() => {
  const out: { key: string, icon: unknown, text: string }[] = []
  if (props.playedOn) out.push({ key: 'date', icon: CalendarDays, text: formatDateLong(props.playedOn) })
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

const CHIP = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-[0.1em]'
</script>

<template>
  <header data-testid="match-header" class="relative overflow-hidden rounded-2xl p-5 glass sm:p-6">
    <div
      class="pointer-events-none absolute inset-y-[-60%] right-8 w-16 -skew-x-12 slash opacity-10 blur-lg"
      aria-hidden="true"
    />

    <!-- The type is a tag below, not the eyebrow: printing it twice reads as a
         mistake rather than as emphasis. -->
    <p class="eyebrow">
      <Swords :size="14" aria-hidden="true" />
      Match
    </p>

    <h1
      data-testid="match-heading"
      class="relative mt-2.5 font-display text-[clamp(1.5rem,3.6vw,2.5rem)] font-bold uppercase leading-[1.02] tracking-tight"
    >
      {{ heading }}
    </h1>

    <ul class="relative mt-4 flex flex-wrap items-center gap-2">
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
          Result hidden — reveal
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
