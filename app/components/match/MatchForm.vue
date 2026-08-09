<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchFormat } from '~~/shared/badminton'

const props = defineProps<{ matchId: string | null }>()

const client = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { data: players } = await useAsyncData('picker-players', async () => {
  const { data } = await client.from('players').select('*').order('last_name')
  return data ?? []
})

const form = reactive({
  title: '',
  played_on: null as string | null,
  venue: '',
  format: 'doubles' as MatchFormat,
  youtube_video_id: '',
  visibility: 'private' as 'private' | 'public',
  // Normally set by the tagger as work progresses; exposed here so a mistake
  // can be corrected by hand.
  tagging_status: 'untagged' as 'untagged' | 'in_progress' | 'tagged',
  best_of: 3,
  points_to_win: 21,
  win_by: 2,
  points_cap: 30,
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
}

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

const inputClass = 'rounded border border-slate-700 bg-slate-900 px-3 py-2'
const fieldClass = 'mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100'
</script>

<template>
  <form class="space-y-6" @submit.prevent="save">
    <div class="grid gap-3 md:grid-cols-2">
      <input v-model="form.title" data-testid="m-title" required placeholder="Title" :class="inputClass">
      <input v-model="form.played_on" data-testid="m-date" type="date" :class="inputClass">
      <input v-model="form.venue" placeholder="Venue" :class="inputClass">
      <input v-model="form.youtube_video_id" data-testid="m-video" placeholder="YouTube video ID (e.g. dQw4w9WgXcQ)" :class="inputClass">
      <select v-model="form.format" data-testid="m-format" :class="inputClass">
        <option value="singles">
          Singles
        </option>
        <option value="doubles">
          Doubles
        </option>
      </select>
      <select v-model="form.visibility" data-testid="m-visibility" :class="inputClass">
        <option value="private">
          Private
        </option>
        <option value="public">
          Public
        </option>
      </select>
      <select v-model="form.tagging_status" data-testid="m-tagging-status" :class="inputClass">
        <option value="untagged">
          Untagged
        </option>
        <option value="in_progress">
          Tagging in progress
        </option>
        <option value="tagged">
          Tagged
        </option>
      </select>
    </div>

    <fieldset>
      <legend class="text-sm font-semibold text-slate-300">
        Players
      </legend>
      <MatchPlayerPicker
        class="mt-2"
        :model-value="slotMap"
        :format="form.format"
        :players="players ?? []"
        @select="(slot, playerId) => { slotMap[slot] = playerId }"
      />
    </fieldset>

    <fieldset>
      <legend class="text-sm font-semibold text-slate-300">
        Scoring
      </legend>
      <div class="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label class="text-sm text-slate-400">Best of
          <input v-model.number="form.best_of" type="number" :class="fieldClass"></label>
        <label class="text-sm text-slate-400">Points to win
          <input v-model.number="form.points_to_win" type="number" :class="fieldClass"></label>
        <label class="text-sm text-slate-400">Win by
          <input v-model.number="form.win_by" type="number" :class="fieldClass"></label>
        <label class="text-sm text-slate-400">Cap
          <input v-model.number="form.points_cap" type="number" :class="fieldClass"></label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="text-sm font-semibold text-slate-300">
        Opening serve
      </legend>
      <div class="mt-2 grid gap-3 md:grid-cols-3">
        <label class="text-sm text-slate-400">First server side
          <select v-model.number="form.initial_server_side" data-testid="m-server" :class="fieldClass">
            <option :value="1">Side 1 (us)</option>
            <option :value="2">Side 2 (them)</option>
          </select></label>
        <template v-if="form.format === 'doubles'">
          <label class="text-sm text-slate-400">Our right-court player
            <select v-model.number="form.side1_right_court_slot" data-testid="m-right1" :class="fieldClass">
              <option :value="1">Slot 1</option>
              <option :value="2">Slot 2</option>
            </select></label>
          <label class="text-sm text-slate-400">Their right-court player
            <select v-model.number="form.side2_right_court_slot" data-testid="m-right2" :class="fieldClass">
              <option :value="3">Slot 3</option>
              <option :value="4">Slot 4</option>
            </select></label>
        </template>
      </div>
    </fieldset>

    <p v-if="error" data-testid="m-error" class="text-sm text-red-400">
      {{ error }}
    </p>
    <button type="submit" data-testid="m-save" :disabled="busy" class="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
      {{ busy ? 'Saving…' : 'Save match' }}
    </button>
  </form>
</template>
