<script setup lang="ts">
import type { MyffbadPlayer } from '~~/server/utils/myffbad'
import type { Database } from '~/types/database.types'
import { CircleDashed, Globe, Loader, Search, UserPlus, UserSearch, X } from '@lucide/vue'
// Named explicitly rather than auto-imported: the template reads them, and a
// bare identifier there resolves against the setup bindings, not unimport.
import { STAGE_ACTION, STAGE_LABEL, useMyffbadSearch } from '~/composables/useMyffbadSearch'
import { findPlaceholder } from '~/utils/players'

type PlayerRow = Database['public']['Tables']['players']['Row']

const props = defineProps<{
  modelValue: string | null
  players: PlayerRow[]
  label: string
  testid?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [playerId: string | null]
  /** A licensee was added to the roster, so the caller can reload it. */
  'created': []
}>()

const client = useSupabaseClient<Database>()

const term = ref('')
const open = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)

const selected = computed(() =>
  props.players.find(p => p.id === props.modelValue) ?? null,
)

function name(player: PlayerRow) {
  return `${player.first_name} ${player.last_name}`.trim()
}

/**
 * The stand-in, offered on every leg of the search. It is the answer to "I
 * cannot name this person", which is a thing you know before you start typing
 * and still know once France has been searched — so it sits in the header
 * beside the button that widens the search, not down among the results.
 */
const placeholder = computed(() => findPlaceholder(props.players))

/**
 * The roster, filtered on every keystroke. No request, so no debounce.
 *
 * Without the stand-in, which sits above: listing it twice is noise, and
 * counting it as a hit would mean the MyFFBaD legs below never run.
 */
const matches = computed(() => {
  const roster = props.players.filter(p => p.id !== placeholder.value?.id)
  const needle = term.value.trim().toLocaleLowerCase('fr')
  if (!needle) return roster
  return roster.filter(p =>
    `${p.first_name} ${p.last_name} ${p.club ?? ''}`
      .toLocaleLowerCase('fr')
      .includes(needle),
  )
})

const {
  stage,
  next,
  results: remote,
  truncated,
  busy,
  error: searchError,
  answered,
  searchable,
  run,
  reset,
} = useMyffbadSearch({ term, localCount: () => matches.value.length })

const error = computed(() => saveError.value ?? searchError.value)
const working = computed(() => busy.value || saving.value)

function choose(playerId: string | null) {
  emit('update:modelValue', playerId)
  term.value = ''
  reset()
  open.value = false
}

/**
 * Adds a licensee to the roster and fills the slot with them.
 *
 * A licence already on the roster selects that player instead of inserting a
 * second one — the unique index would refuse it anyway, and the person you
 * meant is the one already there.
 */
async function addAndChoose(licensee: MyffbadPlayer) {
  const existing = props.players.find(p => p.ffbad_license === licensee.licence)
  if (existing) {
    choose(existing.id)
    return
  }

  saving.value = true
  saveError.value = null
  try {
    const { data: club } = await client
      .from('clubs')
      .select('id')
      .eq('myffbad_club_id', licensee.clubId ?? '')
      .maybeSingle()

    const { data: created, error: dbError } = await client
      .from('players')
      .insert({
        first_name: licensee.firstName,
        last_name: licensee.lastName,
        club: licensee.club,
        club_id: club?.id ?? null,
        rank_singles: licensee.rankSingles,
        rank_doubles: licensee.rankDoubles,
        rank_mixed: licensee.rankMixed,
        ffbad_license: licensee.licence,
        category: licensee.category,
        cpph: licensee.cpph,
        myffbad_person_id: licensee.personId,
      })
      .select('id')
      .single()

    if (dbError) {
      saveError.value = dbError.message
      return
    }
    emit('created')
    choose(created.id)
  }
  finally {
    saving.value = false
  }
}

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))

function ranks(p: MyffbadPlayer) {
  return [p.rankSingles, p.rankDoubles, p.rankMixed].map(r => r || '—').join(' / ')
}

/** What the list says when it has nothing to show on the current leg. */
const emptyNote = computed(() => {
  if (working.value) return null
  if (stage.value === 'local') {
    if (matches.value.length) return null
    return searchable.value
      ? 'Nobody on the roster — our club is checked a second after you stop typing.'
      : 'Nobody on the roster yet.'
  }
  if (!answered.value || remote.value.length) return null
  return stage.value === 'club'
    ? 'Nobody at US Talence.'
    : 'No licensee found in France.'
})
</script>

<template>
  <div ref="root" class="relative">
    <div
      class="field flex items-center gap-2.5 py-0"
      :class="open ? 'ring-2 ring-accent/40' : ''"
    >
      <component
        :is="working ? Loader : Search"
        :size="15"
        class="shrink-0"
        :class="working ? 'animate-spin text-accent' : 'text-ink-subtle'"
        aria-hidden="true"
      />
      <input
        v-model="term"
        :data-testid="testid"
        type="search"
        autocomplete="off"
        :aria-label="label"
        :placeholder="selected ? name(selected) : 'Search a player…'"
        class="min-h-11 w-full bg-transparent outline-none"
        :class="selected && !term ? 'placeholder:text-ink' : 'placeholder:text-ink-subtle'"
        @focus="open = true"
      >
      <button
        v-if="selected"
        type="button"
        class="shrink-0 rounded-md p-1 text-ink-subtle transition-colors duration-150 hover:text-accent"
        :aria-label="`Clear ${label}`"
        title="Clear"
        @click="choose(null)"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>

    <p v-if="error" role="alert" class="mt-1.5 text-xs text-accent">
      {{ error }}
    </p>

    <div
      v-if="open"
      class="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl p-1 glass-menu"
    >
      <!-- The header, unchanged by whatever the search is doing below it: the
           next leg of the search, the stand-in, and an empty slot. -->
      <div class="flex flex-wrap items-center gap-1.5 px-1.5 pb-1.5 pt-1">
        <button
          v-if="next"
          type="button"
          data-testid="slot-widen"
          class="btn btn-sm border border-accent/50 bg-accent-soft text-accent hover:bg-accent-soft hover:brightness-125 disabled:opacity-45"
          :disabled="!searchable || busy"
          :title="searchable ? undefined : 'Type at least two letters first'"
          @click="run(next)"
        >
          <component :is="next === 'club' ? UserSearch : Globe" :size="14" aria-hidden="true" />
          {{ STAGE_ACTION[next] }}
        </button>

        <button
          v-if="placeholder"
          type="button"
          data-testid="slot-placeholder"
          class="btn btn-sm btn-ghost"
          :class="placeholder.id === modelValue ? 'text-accent' : ''"
          @click="choose(placeholder.id)"
        >
          {{ name(placeholder) }}
        </button>

        <button
          type="button"
          class="btn btn-sm btn-ghost text-ink-muted"
          @click="choose(null)"
        >
          <CircleDashed :size="14" aria-hidden="true" />
          No player
        </button>
      </div>

      <div class="mx-3 mb-1 border-t border-line" aria-hidden="true" />

      <!-- The roster stays listed once the search widens: you may have gone
           looking for someone else, but the people we already know are still
           the cheapest right answer. -->
      <p
        v-if="stage !== 'local' && matches.length"
        class="px-3 pb-1 pt-1.5 text-xs uppercase tracking-[0.14em] text-ink-subtle"
      >
        On the roster
      </p>

      <button
        v-for="p in matches"
        :key="p.id"
        type="button"
        class="flex w-full items-baseline gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-accent-soft hover:text-accent"
        :class="p.id === modelValue ? 'text-accent' : 'text-ink'"
        @click="choose(p.id)"
      >
        <span class="font-medium">{{ name(p) }}</span>
        <span v-if="p.club" class="truncate text-xs text-ink-subtle">{{ p.club }}</span>
      </button>

      <template v-if="stage !== 'local' && remote.length">
        <p
          data-testid="slot-remote-label"
          class="px-3 pb-1 pt-2.5 text-xs uppercase tracking-[0.14em] text-ink-subtle"
        >
          {{ STAGE_LABEL[stage] }}
        </p>
        <button
          v-for="p in remote"
          :key="p.licence"
          type="button"
          class="flex w-full items-baseline gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors duration-150 hover:bg-accent-soft hover:text-accent"
          @click="addAndChoose(p)"
        >
          <UserPlus :size="14" class="shrink-0 text-ink-subtle" aria-hidden="true" />
          <span class="font-medium">{{ p.lastName }} {{ p.firstName }}</span>
          <span class="text-xs tabular-nums text-ink-muted">{{ ranks(p) }}</span>
          <span v-if="p.club" class="truncate text-xs text-ink-subtle">{{ p.club }}</span>
        </button>
        <p v-if="truncated" class="px-3 pb-1 pt-1 text-xs text-ink-subtle">
          Showing the first {{ remote.length }} — add a first name to narrow it down.
        </p>
      </template>

      <p v-if="emptyNote" class="px-3 py-2.5 text-xs text-ink-subtle">
        {{ emptyNote }}
      </p>
    </div>
  </div>
</template>
