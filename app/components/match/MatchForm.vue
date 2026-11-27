<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchFormat } from '~~/shared/badminton'
import {
  Check,
  CircleCheck,
  CircleDashed,
  Eye,
  EyeOff,
  Film,
  Link2,
  Loader,
  Save,
  Tags,
  TriangleAlert,
  User,
  Users,
} from '@lucide/vue'
import { PLAYER_INFO_FIELDS } from '~/utils/players'
import { TAGGING_STATES } from '~/utils/taggingStatus'

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

/** Raw matches a video can be linked to: newest first, never itself or another linked video. */
const { data: sourceMatches } = await useAsyncData(`form-sources-${props.matchId ?? 'new'}`, async () => {
  const { data } = await client
    .from('matches')
    .select('id, title, youtube_title, played_on')
    .eq('video_kind', 'raw')
    .is('source_match_id', null)
    .neq('id', props.matchId ?? '00000000-0000-0000-0000-000000000000')
    .order('played_on', { ascending: false, nullsFirst: false })
    .limit(60)
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
  // Channel kit: what the YouTube title, thumbnail and intro card print.
  event_name: null as string | null,
  round: null as string | null,
  // Nearly every match is men's: Hommes until said otherwise.
  category: 'men' as 'men' | 'women' | 'mixed' | null,
  /**
   * Which personal details the public player table prints. Everything we have,
   * by default: a detail is only noise when the player has no value for it,
   * and those are dropped at render anyway.
   */
  player_info_fields: PLAYER_INFO_FIELDS.map(f => f.id),
  format: 'doubles' as MatchFormat,
  // What the video is, and — for the public edit, highlights and edit — the
  // raw tagged match it reads its players, scores and stats from.
  video_kind: 'raw' as 'raw' | 'match' | 'highlights' | 'shorts',
  source_match_id: null as string | null,
  // The live scoreboard over the player: only right on the raw tagged video.
  show_scoreboard: false,
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
  if (match) Object.assign(form, match, { category: match.category ?? 'men' })

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
 * One day of filming is nearly always one event: a match with no event name
 * takes the one already filled in on another match played the same day.
 */
watch(() => form.played_on, async (day) => {
  if (!day || form.event_name?.trim()) return
  const { data } = await client.from('matches').select('event_name')
    .eq('played_on', day).not('event_name', 'is', null).neq('id', props.matchId ?? '00000000-0000-0000-0000-000000000000').limit(1)
  const name = data?.[0]?.event_name
  if (name && !form.event_name?.trim()) form.event_name = name
}, { immediate: true })

// The raw recording is the source: it is never linked to another.
watch(() => form.video_kind, (kind) => {
  if (kind === 'raw') form.source_match_id = null
})

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
  const { publish_settings: _ps, ...rest } = form as typeof form & { publish_settings?: unknown }
  const payload = { ...rest, created_by: user.value?.sub ?? null }
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
  await navigateTo(`/admin/matches/${saved.id}/setup`)
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

  const { publish_settings: _ps, ...payload } = form as typeof form & { publish_settings?: unknown }
  if (!payload.played_on) payload.played_on = null
  for (const key of ['event_name', 'round'] as const) payload[key] = payload[key]?.trim() || null

  const { error: dbError } = await client
    .from('matches').update(payload).eq('id', props.matchId)

  if (dbError) {
    saveState.value = 'error'
    error.value = dbError.message
    return
  }

  // The match bar lists this video's family: a new link or type shows at once.
  void refreshNuxtData('admin-match-nav')

  // Only the raw recording has players of its own; the others read them from it.
  if (form.video_kind !== 'raw') {
    saveState.value = 'saved'
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

const categoryOptions = [
  { value: 'men' as const, label: 'Hommes', icon: User },
  { value: 'women' as const, label: 'Dames', icon: User },
  { value: 'mixed' as const, label: 'Mixte', icon: Users },
]

/** The usual draw stages; free text still wins for anything else. */
const ROUNDS = ['Poules', '1/16 de finale', '1/8 de finale', 'Quarts de finale', 'Demi-finale', 'Finale']

const formatOptions = [
  { value: 'doubles' as MatchFormat, label: 'Doubles', icon: Users },
  { value: 'singles' as MatchFormat, label: 'Singles', icon: User },
]

const typeOptions = computed(() => [
  { value: null as string | null, label: 'No type', icon: CircleDashed },
  ...(matchTypes.value ?? []).map(t => ({ value: t.id as string | null, label: t.label, icon: Tags })),
])

const kindOptions = [
  { value: 'raw' as const, label: 'Raw (tagged recording)', icon: Film },
  { value: 'match' as const, label: 'Match (edited for YouTube)', icon: Film },
  { value: 'highlights' as const, label: 'Highlights', icon: Film },
  { value: 'shorts' as const, label: 'Shorts', icon: Film },
]

const sourceOptions = computed(() => [
  { value: null as string | null, label: 'Not linked', icon: CircleDashed },
  ...(sourceMatches.value ?? []).map(m => ({
    value: m.id as string | null,
    label: `${m.played_on ?? 'Undated'} · ${m.youtube_title || m.title}`,
    icon: Link2,
  })),
])

const visibilityOptions = [
  { value: 'private' as const, label: 'Private', icon: EyeOff },
  { value: 'public' as const, label: 'Public', icon: Eye },
]

const taggingOptions = TAGGING_STATES.map(s => ({
  value: s.id,
  label: s.label,
  icon: s.icon,
}))

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

// relative + focus-within:z-10: each glass panel is its own stacking context (backdrop-filter),
// so an open autocomplete would otherwise slide under the next panel.
const FIELDSET = 'relative rounded-2xl p-5 glass focus-within:z-10 sm:p-6'
</script>

<template>
  <!-- The raw recording's full setup flows over two columns; the others are one short section. -->
  <form
    class="gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid"
    :class="form.video_kind === 'raw' ? 'lg:columns-2' : 'mx-auto max-w-3xl'"
    @submit.prevent="save"
  >
    <fieldset :class="FIELDSET">
      <legend class="label px-1">
        Video
      </legend>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <span class="label">Type</span>
          <UiSelect v-model="form.video_kind" class="mt-2" label="Video type" :options="kindOptions" />
          <span class="mt-1.5 block text-xs text-ink-subtle">Set on import: HIGHLIGHTS or SHORTS in the title, else unlisted = raw, listed = match.</span>
        </div>
        <div :class="form.video_kind === 'raw' ? 'opacity-50' : ''">
          <span class="label">Linked to</span>
          <UiSelect v-model="form.source_match_id" data-testid="m-source" class="mt-2" label="Linked to" :options="sourceOptions" :disabled="form.video_kind === 'raw'" />
          <span class="mt-1.5 block text-xs text-ink-subtle">
            {{ form.video_kind === 'raw' ? 'The raw recording is the source: nothing to link.' : 'Players, scores, stats and event are read from this raw match.' }}
          </span>
        </div>
        <template v-if="form.video_kind === 'raw'">
          <label class="inline-flex items-center gap-2 text-sm text-ink-muted md:col-span-2">
            <input v-model="form.show_scoreboard" data-testid="m-scoreboard" type="checkbox" class="size-4 accent-[var(--ui-brand)]">
            Show the scoreboard over the video
          </label>
          <span class="-mt-3 block text-xs text-ink-subtle md:col-span-2">
            The scores follow the raw recording's timestamps.
          </span>
        </template>
      </div>
    </fieldset>


    <!-- Only the raw recording is set up; the other three read everything from it. -->
    <template v-if="form.video_kind === 'raw'">
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
          <span class="label">Category</span>
          <UiSelect v-model="form.category" class="mt-2" label="Category" :options="categoryOptions" />
          <span class="mt-1.5 block text-xs text-ink-subtle">With the format: "Doubles hommes" on the YouTube video.</span>
        </div>
        <label class="block">
          <span class="label">Event</span>
          <input v-model="form.event_name" placeholder="Tournois des Vendanges" class="field mt-2">
          <span class="mt-1.5 block text-xs text-ink-subtle">Tournaments and championships. The year comes from the date.</span>
        </label>
        <label class="block">
          <span class="label">Round</span>
          <input v-model="form.round" list="match-rounds" placeholder="Quarts de finale" class="field mt-2">
          <datalist id="match-rounds"><option v-for="r in ROUNDS" :key="r" :value="r" /></datalist>
        </label>
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
    </template>

    <p
      v-if="error"
      data-testid="m-error"
      role="alert"
      class="[column-span:all] flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm text-accent"
    >
      <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
      {{ error }}
    </p>

    <!--
      An existing match writes itself as you edit it, so there is nothing to
      press — only a line saying whether the write landed. A match that does
      not exist yet has no row to write to, so it keeps the button.
    -->
    <div class="[column-span:all] sticky bottom-0 -mx-1 rounded-t-2xl border-t border-line bg-bg/80 px-1 py-4 backdrop-blur-xl">
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
