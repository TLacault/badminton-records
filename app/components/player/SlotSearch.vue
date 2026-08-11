<script setup lang="ts">
import type { MyffbadPlayer } from '~~/server/utils/myffbad'
import type { Database } from '~/types/database.types'
import { CircleDashed, Loader, Search, UserPlus, X } from '@lucide/vue'

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

/** Only the MyFFBaD leg is debounced — filtering the roster is free. */
const DEBOUNCE_MS = 1000

const client = useSupabaseClient<Database>()

const term = ref('')
const open = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const remote = ref<MyffbadPlayer[]>([])
const root = ref<HTMLElement | null>(null)

const selected = computed(() =>
  props.players.find(p => p.id === props.modelValue) ?? null,
)

function name(player: PlayerRow) {
  return `${player.first_name} ${player.last_name}`.trim()
}

/**
 * The stand-in, kept at the top of the list whatever is typed. It is the
 * answer to "I cannot name this person", which is a thing you know before you
 * start typing and still know after a search has found nobody — so it is
 * pinned rather than left to be found by name among the real players.
 */
const placeholder = computed(() => findPlaceholder(props.players))

/**
 * The roster, filtered on every keystroke. No request, so no debounce.
 *
 * Without the stand-in, which sits above: listing it twice is noise, and
 * counting it as a hit would mean the MyFFBaD fallback below never runs.
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

/**
 * MyFFBaD is the fallback, not the first stop: it only runs once the roster
 * has nothing to offer, so the common case — someone we have played before —
 * never touches the network.
 */
let timer: ReturnType<typeof setTimeout> | null = null
let sequence = 0

async function lookup(value: string) {
  const query = value.trim()
  if (query.length < 2 || matches.value.length) {
    remote.value = []
    return
  }
  const ticket = ++sequence
  busy.value = true
  error.value = null
  try {
    // `all`, not the default `local`: we only get here because the roster had
    // nobody, and the person being added is usually an opponent — quite
    // possibly from outside Gironde. The ranking still floats our clubs to the
    // top, so nothing local is buried by widening the net.
    const res = await $fetch<{ players: MyffbadPlayer[] }>('/api/myffbad/search', {
      query: { q: query, scope: 'all' },
    })
    if (ticket !== sequence) return
    remote.value = res.players
  }
  catch (cause) {
    if (ticket !== sequence) return
    const err = cause as { statusMessage?: string, message?: string }
    error.value = err.statusMessage ?? err.message ?? 'MyFFBaD search failed'
    remote.value = []
  }
  finally {
    if (ticket === sequence) busy.value = false
  }
}

watch(term, (value) => {
  if (timer) clearTimeout(timer)
  remote.value = []
  timer = setTimeout(() => lookup(value), DEBOUNCE_MS)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

function choose(playerId: string | null) {
  emit('update:modelValue', playerId)
  term.value = ''
  remote.value = []
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

  busy.value = true
  error.value = null
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
      error.value = dbError.message
      return
    }
    emit('created')
    choose(created.id)
  }
  finally {
    busy.value = false
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
</script>

<template>
  <div ref="root" class="relative">
    <div
      class="field flex items-center gap-2.5 py-0"
      :class="open ? 'ring-2 ring-accent/40' : ''"
    >
      <component
        :is="busy ? Loader : Search"
        :size="15"
        class="shrink-0"
        :class="busy ? 'animate-spin text-accent' : 'text-ink-subtle'"
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
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink-muted transition-colors duration-150 hover:bg-accent-soft hover:text-accent"
        @click="choose(null)"
      >
        <CircleDashed :size="15" aria-hidden="true" />
        No player
      </button>

      <!-- The two ways of not naming somebody, together and above the rule:
           leave the slot empty, or fill it with the stand-in. -->
      <button
        v-if="placeholder"
        type="button"
        data-testid="slot-placeholder"
        class="flex w-full items-baseline gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-accent-soft hover:text-accent"
        :class="placeholder.id === modelValue ? 'text-accent' : 'text-ink'"
        @click="choose(placeholder.id)"
      >
        <span class="font-medium">{{ name(placeholder) }}</span>
        <span v-if="placeholder.club" class="truncate text-xs text-ink-subtle">{{ placeholder.club }}</span>
      </button>

      <div v-if="placeholder" class="mx-3 my-1 border-t border-line" aria-hidden="true" />

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

      <!--
        Only ever shown when the roster came up empty, so a licensee never
        competes with someone already on it.
      -->
      <template v-if="!matches.length && remote.length">
        <p class="px-3 pb-1 pt-2.5 text-xs uppercase tracking-[0.14em] text-ink-subtle">
          Not on the roster — from MyFFBaD
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
      </template>

      <p
        v-else-if="!matches.length && !busy"
        class="px-3 py-2.5 text-xs text-ink-subtle"
      >
        {{ term.trim().length < 2 ? 'Nobody on the roster yet.' : 'No match — MyFFBaD is checked a second after you stop typing.' }}
      </p>
    </div>
  </div>
</template>
