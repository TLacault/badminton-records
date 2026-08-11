<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchFormat } from '~~/shared/badminton'
import {
  Check,
  CircleCheck,
  CircleDashed,
  Eye,
  EyeOff,
  Loader,
  Save,
  Tags,
  TriangleAlert,
  User,
  Users,
} from '@lucide/vue'
import { PLAYER_INFO_FIELDS } from '~/utils/players'

const props = defineProps<{ matchId: string | null }>()

const client = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { data: players, refresh: refreshPlayers } = await useAsyncData(
  'picker-players',
  async () => {
    const { data } = await client.from('players').select('*').order('last_name')
    return data ?? []
  },
)

const { data: matchTypes } = await useAsyncData('form-match-types', async () => {
  const { data } = await client
    .from('match_types')
    .select('id, label, slug')
    .order('sort_order')
  return data ?? []
})

/** Almost every recording is a free-play session, so that is what a new one is. */
const DEFAULT_MATCH_TYPE = 'free-play'

const form = reactive({
  title: '',
  played_on: null as string | null,
  // Nearly every match is filmed in the same hall.
  venue: 'Talence',
  match_type_id: null as string | null,
  /**
   * Which personal details the public player table prints. Everything we have,
   * by default: a detail is only noise when the player has no value for it,
   * and those are dropped at render anyway.
   */
  player_info_fields: PLAYER_INFO_FIELDS.map(f => f.id),
  format: 'doubles' as MatchFormat,
  youtube_video_id: '',
  // Everything is filmed on the same rig, so this is true until said otherwise
  // — the column defaults the same way, and the card pins it on the thumbnail.
  is_4k: true,
  visibility: 'private' as 'private' | 'public',
  // Normally set by the tagger as work progresses; exposed here so a mistake
  // can be corrected by hand.
  tagging_status: 'untagged' as 'untagged' | 'in_progress' | 'tagged',
  best_of: 3,
  // House rules: sets to 15, capped at 21. Matches recorded under the old
  // 21/30 keep their own numbers — these are only the numbers a new one starts
  // with, and they match the column defaults so an imported video agrees.
  points_to_win: 15,
  win_by: 2,
  points_cap: 21,
  initial_server_side: 1 as 1 | 2,
  side1_right_court_slot: 1 as 1 | 2,
  side2_right_court_slot: 3 as 3 | 4,
})

// reactive, not ref: the picker reports one slot at a time and we mutate in
// place, so each change is visible to the next one immediately.
const slotMap = reactive<Record<number, string | null>>({ 1: null, 2: null, 3: null, 4: null })
const error = ref<string | null>(null)
const busy = ref(false)

if (props.matchId) {
  const { data: match } = await client
    .from('matches').select('*').eq('id', props.matchId).single()
  if (match) Object.assign(form, match)

  const { data: mp } = await client
    .from('match_players').select('slot, player_id').eq('match_id', props.matchId)
  for (const row of mp ?? []) slotMap[row.slot] = row.player_id

  // A match imported from YouTube arrives with nobody in it, and it is nearly
  // always the two of us on this half of the court — so it starts filled in,
  // exactly as a match created by hand does.
  //
  // Only when the match has no participants at all: one slot already set means
  // the roster has been thought about, and the empty slot beside it may well be
  // empty on purpose.
  if (!mp?.length) Object.assign(slotMap, homePairSlots(players.value ?? []))
}
else {
  // A new match starts with our half of the court already filled in, and as
  // the kind of session we almost always record.
  Object.assign(slotMap, homePairSlots(players.value ?? []))
  form.match_type_id
    = matchTypes.value?.find(t => t.slug === DEFAULT_MATCH_TYPE)?.id ?? null
}

/**
 * Autosave state for an existing match. A new one has no row to write to, so
 * it keeps the explicit button until it is created.
 */
const autosaves = computed(() => Boolean(props.matchId))
const saveState = ref<'clean' | 'pending' | 'saving' | 'saved' | 'error'>('clean')

async function save() {
  busy.value = true
  error.value = null

  // useSupabaseUser() holds JWT claims, not a User: the id is `sub`, and `.id`
  // is undefined. JwtPayload's index signature means `.id` type-checks anyway,
  // so this silently wrote null before.
  const payload = { ...form, created_by: user.value?.sub ?? null }
  if (!payload.played_on) payload.played_on = null

  const { data: saved, error: dbError } = props.matchId
    ? await client.from('matches').update(payload).eq('id', props.matchId).select('id').single()
    : await client.from('matches').insert(payload).select('id').single()

  if (dbError || !saved) {
    busy.value = false
    error.value = dbError?.message ?? 'Save failed'
    return
  }

  // Participants: replace wholesale, it is at most four rows.
  await client.from('match_players').delete().eq('match_id', saved.id)
  const rows = Object.entries(slotMap)
    .filter(([, playerId]) => Boolean(playerId))
    .map(([slot, playerId]) => ({
      match_id: saved.id,
      slot: Number(slot),
      player_id: playerId as string,
    }))
  if (rows.length) {
    const { error: mpError } = await client.from('match_players').insert(rows)
    if (mpError) {
      busy.value = false
      error.value = mpError.message
      return
    }
  }

  busy.value = false
  await navigateTo(`/admin/matches/${saved.id}`)
}

/**
 * Writes the current form to the row it came from. Short debounce rather than
 * none: typing a title would otherwise be one request per keystroke.
 */
const SAVE_DEBOUNCE_MS = 500
let timer: ReturnType<typeof setTimeout> | null = null

async function autosave() {
  if (!props.matchId) return
  saveState.value = 'saving'
  error.value = null

  const payload = { ...form }
  if (!payload.played_on) payload.played_on = null

  const { error: dbError } = await client
    .from('matches').update(payload).eq('id', props.matchId)

  if (dbError) {
    saveState.value = 'error'
    error.value = dbError.message
    return
  }

  // Participants are replaced wholesale — at most four rows, and the delete
  // plus insert has to be one thought, or a half-written roster is possible.
  await client.from('match_players').delete().eq('match_id', props.matchId)
  const rows = Object.entries(slotMap)
    .filter(([, playerId]) => Boolean(playerId))
    .map(([slot, playerId]) => ({
      match_id: props.matchId as string,
      slot: Number(slot),
      player_id: playerId as string,
    }))
  if (rows.length) {
    const { error: mpError } = await client.from('match_players').insert(rows)
    if (mpError) {
      saveState.value = 'error'
      error.value = mpError.message
      return
    }
  }

  saveState.value = 'saved'
}

function scheduleAutosave() {
  if (!autosaves.value) return
  saveState.value = 'pending'
  if (timer) clearTimeout(timer)
  timer = setTimeout(autosave, SAVE_DEBOUNCE_MS)
}

// Both are `reactive`, so watching them directly is already deep; the spread
// that was here rebuilt two objects on every tick for nothing.
watch([form, slotMap], scheduleAutosave)

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const saveLabel = computed(() => {
  switch (saveState.value) {
    case 'pending': return 'Saving…'
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Save failed'
    default: return 'Up to date'
  }
})

const formatOptions = [
  { value: 'doubles' as MatchFormat, label: 'Doubles', icon: Users },
  { value: 'singles' as MatchFormat, label: 'Singles', icon: User },
]

const typeOptions = computed(() => [
  { value: null as string | null, label: 'No type', icon: CircleDashed },
  ...(matchTypes.value ?? []).map(t => ({ value: t.id as string | null, label: t.label, icon: Tags })),
])

const visibilityOptions = [
  { value: 'private' as const, label: 'Private', icon: EyeOff },
  { value: 'public' as const, label: 'Public', icon: Eye },
]

const taggingOptions = [
  { value: 'untagged' as const, label: 'Untagged', icon: CircleDashed },
  { value: 'in_progress' as const, label: 'Tagging in progress', icon: Loader },
  { value: 'tagged' as const, label: 'Tagged', icon: CircleCheck },
]

/*
 * The serve pickers name people, not slots. "Slot 3" is an implementation
 * detail of the schema, and nobody setting up a match thinks in it — they think
 * "Adrien served first". A slot with nobody in it yet keeps its number, so the
 * dropdown still has something to say before the roster is filled.
 */
function playerIn(slot: number) {
  const id = slotMap[slot]
  return id ? (players.value ?? []).find(p => p.id === id) ?? null : null
}

function slotLabel(slot: number): string {
  const player = playerIn(slot)
  return player ? `${player.first_name} ${player.last_name}` : `Slot ${slot}`
}

/** First names, joined: a full pair of full names does not fit a dropdown. */
function sideLabel(slots: number[], fallback: string): string {
  const names = slots.map(playerIn).filter(Boolean).map(p => p!.first_name)
  return names.length ? names.join(' & ') : fallback
}

const serverOptions = computed(() => {
  const singles = form.format === 'singles'
  return [
    { value: 1 as 1 | 2, label: sideLabel(singles ? [1] : [1, 2], 'Our side'), icon: Users },
    { value: 2 as 1 | 2, label: sideLabel(singles ? [3] : [3, 4], 'Their side'), icon: Users },
  ]
})

const rightCourt1 = computed(() => [
  { value: 1 as 1 | 2, label: slotLabel(1), icon: User },
  { value: 2 as 1 | 2, label: slotLabel(2), icon: User },
])
const rightCourt2 = computed(() => [
  { value: 3 as 3 | 4, label: slotLabel(3), icon: User },
  { value: 4 as 3 | 4, label: slotLabel(4), icon: User },
])

/** Every detail or none — the checkboxes are rarely wanted one at a time. */
const allInfoFields = computed(
  () => form.player_info_fields.length === PLAYER_INFO_FIELDS.length,
)

function toggleAllInfoFields() {
  form.player_info_fields = allInfoFields.value ? [] : PLAYER_INFO_FIELDS.map(f => f.id)
}

const FIELDSET = 'rounded-2xl p-5 glass sm:p-6'
</script>

<template>
  <form class="space-y-5" @submit.prevent="save">
    <fieldset :class="FIELDSET">
      <legend class="label px-1">
        Match
      </legend>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="block md:col-span-2">
          <span class="label">Title <span class="text-accent">*</span></span>
          <input v-model="form.title" data-testid="m-title" required placeholder="Doubles vs BC Bordeaux" class="field mt-2">
        </label>
        <label class="block">
          <span class="label">Played on</span>
          <input v-model="form.played_on" data-testid="m-date" type="date" class="field mt-2 tabular-nums">
        </label>
        <label class="block">
          <span class="label">Venue</span>
          <input v-model="form.venue" placeholder="Talence" class="field mt-2">
        </label>
        <label class="block md:col-span-2">
          <span class="label">YouTube video ID</span>
          <input
            v-model="form.youtube_video_id"
            data-testid="m-video"
            placeholder="dQw4w9WgXcQ"
            class="field mt-2 font-mono"
            aria-describedby="m-video-help"
          >
          <span id="m-video-help" class="mt-1.5 block text-xs text-ink-subtle">
            The id only — the part after <code>v=</code>, not the whole URL.
          </span>
        </label>
        <div class="md:col-span-2">
          <label class="inline-flex items-center gap-2 text-sm text-ink-muted">
            <input
              v-model="form.is_4k"
              data-testid="m-4k"
              type="checkbox"
              class="size-4 accent-[var(--ui-brand)]"
            >
            Available in 4K
          </label>
          <span class="mt-1.5 block text-xs text-ink-subtle">
            Pinned on the video card. On by default, since every session is
            filmed in 4K at 60fps — untick it for an upload that is not.
          </span>
        </div>
        <div>
          <span class="label">Format</span>
          <UiSelect v-model="form.format" data-testid="m-format" class="mt-2" label="Format" :options="formatOptions" />
        </div>
        <div>
          <span class="label">Type</span>
          <UiSelect v-model="form.match_type_id" data-testid="m-type" class="mt-2" label="Match type" :options="typeOptions" />
          <span class="mt-1.5 block text-xs text-ink-subtle">
            Printed above the video.
            <NuxtLink to="/admin/match-types" class="text-accent hover:underline">Edit the list</NuxtLink>.
          </span>
        </div>
        <div>
          <span class="label">Visibility</span>
          <UiSelect v-model="form.visibility" data-testid="m-visibility" class="mt-2" label="Visibility" :options="visibilityOptions" />
        </div>
        <div class="md:col-span-2">
          <span class="label">Tagging status</span>
          <UiSelect v-model="form.tagging_status" data-testid="m-tagging-status" class="mt-2" label="Tagging status" :options="taggingOptions" />
          <span class="mt-1.5 block text-xs text-ink-subtle">
            Set automatically by the tagger. Change it here only to fix a mistake.
          </span>
        </div>
      </div>
    </fieldset>

    <fieldset :class="FIELDSET">
      <legend class="label px-1">
        Players
      </legend>
      <MatchPlayerPicker
        :model-value="slotMap"
        :format="form.format"
        :players="players ?? []"
        @select="(slot, playerId) => { slotMap[slot] = playerId }"
        @created="refreshPlayers"
      />

      <!-- Per match, not per site: a tournament sheet wants ranks and licences
           where a Tuesday evening wants a first name and nothing else. -->
      <div class="mt-5 border-t border-line pt-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="label">
            Show beside each player
          </p>
          <button
            type="button"
            data-testid="m-info-toggle-all"
            class="btn btn-sm btn-ghost"
            @click="toggleAllInfoFields"
          >
            {{ allInfoFields ? 'Uncheck all' : 'Check all' }}
          </button>
        </div>
        <div class="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
          <label
            v-for="field in PLAYER_INFO_FIELDS"
            :key="field.id"
            class="inline-flex items-center gap-2 text-sm text-ink-muted"
          >
            <input
              v-model="form.player_info_fields"
              type="checkbox"
              :value="field.id"
              :data-testid="`m-info-${field.id}`"
              class="size-4 accent-[var(--ui-brand)]"
            >
            {{ field.label }}
          </label>
        </div>
        <p class="mt-2 text-xs text-ink-subtle">
          Anything a player has no value for is simply left out.
        </p>
      </div>
    </fieldset>

    <fieldset :class="FIELDSET">
      <legend class="label px-1">
        Scoring
      </legend>
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <label class="block">
          <span class="label">Best of</span>
          <input v-model.number="form.best_of" type="number" inputmode="numeric" class="field mt-2 tabular-nums">
        </label>
        <label class="block">
          <span class="label">Points to win</span>
          <input v-model.number="form.points_to_win" type="number" inputmode="numeric" class="field mt-2 tabular-nums">
        </label>
        <label class="block">
          <span class="label">Win by</span>
          <input v-model.number="form.win_by" type="number" inputmode="numeric" class="field mt-2 tabular-nums">
        </label>
        <label class="block">
          <span class="label">Cap</span>
          <input v-model.number="form.points_cap" type="number" inputmode="numeric" class="field mt-2 tabular-nums">
        </label>
      </div>
    </fieldset>

    <fieldset :class="FIELDSET">
      <legend class="label px-1">
        Opening serve
      </legend>
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <span class="label">First server side</span>
          <UiSelect v-model="form.initial_server_side" data-testid="m-server" class="mt-2" label="First server side" :options="serverOptions" />
        </div>
        <template v-if="form.format === 'doubles'">
          <div>
            <span class="label">Our right-court player</span>
            <UiSelect v-model="form.side1_right_court_slot" data-testid="m-right1" class="mt-2" label="Our right-court player" :options="rightCourt1" />
          </div>
          <div>
            <span class="label">Their right-court player</span>
            <UiSelect v-model="form.side2_right_court_slot" data-testid="m-right2" class="mt-2" label="Their right-court player" :options="rightCourt2" />
          </div>
        </template>
      </div>
    </fieldset>

    <p
      v-if="error"
      data-testid="m-error"
      role="alert"
      class="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm text-accent"
    >
      <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
      {{ error }}
    </p>

    <!--
      An existing match writes itself as you edit it, so there is nothing to
      press — only a line saying whether the write landed. A match that does
      not exist yet has no row to write to, so it keeps the button.
    -->
    <div class="sticky bottom-0 -mx-1 rounded-t-2xl border-t border-line bg-bg/80 px-1 py-4 backdrop-blur-xl">
      <p
        v-if="autosaves"
        data-testid="m-autosave"
        role="status"
        class="inline-flex items-center gap-2 text-sm"
        :class="saveState === 'error' ? 'text-accent' : 'text-ink-subtle'"
      >
        <component
          :is="saveState === 'error' ? TriangleAlert : saveState === 'saved' || saveState === 'clean' ? Check : Loader"
          :size="15"
          :class="saveState === 'pending' || saveState === 'saving' ? 'animate-spin' : ''"
          aria-hidden="true"
        />
        {{ saveLabel }}
      </p>
      <button v-else type="submit" data-testid="m-save" :disabled="busy" class="btn btn-primary">
        <component :is="busy ? Loader : Save" :size="16" :class="busy ? 'animate-spin' : ''" aria-hidden="true" />
        {{ busy ? 'Saving…' : 'Create match' }}
      </button>
    </div>
  </form>
</template>
