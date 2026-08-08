<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ middleware: 'admin', layout: 'admin' })

type PlayerRow = Database['public']['Tables']['players']['Row']
type PlayerInsert = Database['public']['Tables']['players']['Insert']

const client = useSupabaseClient<Database>()

const { data: players, refresh } = await useAsyncData('players', async () => {
  const { data } = await client.from('players').select('*').order('last_name')
  return data ?? []
})

function blank(): PlayerInsert {
  return {
    first_name: '',
    last_name: '',
    club: '',
    birth_year: null,
    rank_singles: '',
    rank_doubles: '',
    rank_mixed: '',
    ffbad_license: '',
    notes: '',
  }
}

const form = ref<PlayerInsert>(blank())
const editingId = ref<string | null>(null)
const error = ref<string | null>(null)

function edit(p: PlayerRow) {
  editingId.value = p.id
  form.value = { ...p }
}

function cancel() {
  editingId.value = null
  form.value = blank()
}

async function save() {
  error.value = null
  const payload = { ...form.value }
  const { error: dbError } = editingId.value
    ? await client.from('players').update(payload).eq('id', editingId.value)
    : await client.from('players').insert(payload)
  if (dbError) {
    error.value = dbError.message
    return
  }
  cancel()
  await refresh()
}

async function remove(id: string) {
  error.value = null
  const { error: dbError } = await client.from('players').delete().eq('id', id)
  if (dbError) {
    // The FK is ON DELETE RESTRICT, so a player used by a match cannot go.
    error.value = `${dbError.message} — this player is used by a match.`
    return
  }
  await refresh()
}

/** Age is derived, never stored: a stored age silently rots. */
function age(birthYear: number | null) {
  return birthYear ? new Date().getFullYear() - birthYear : '—'
}

const inputClass = 'rounded border border-slate-700 bg-slate-900 px-3 py-2'
</script>

<template>
  <h1 class="text-2xl font-bold">
    Players
  </h1>

  <form class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" @submit.prevent="save">
    <input v-model="form.first_name" data-testid="p-first" required placeholder="First name" :class="inputClass">
    <input v-model="form.last_name" data-testid="p-last" required placeholder="Last name" :class="inputClass">
    <input v-model="form.club" data-testid="p-club" placeholder="Club" :class="inputClass">
    <input v-model.number="form.birth_year" data-testid="p-year" type="number" placeholder="Birth year" :class="inputClass">
    <input v-model="form.rank_singles" placeholder="Rank S (D9…)" :class="inputClass">
    <input v-model="form.rank_doubles" placeholder="Rank D" :class="inputClass">
    <input v-model="form.rank_mixed" placeholder="Rank Mx" :class="inputClass">
    <input v-model="form.ffbad_license" placeholder="FFBad licence" :class="inputClass">
    <div class="col-span-2 flex gap-2 md:col-span-4">
      <button type="submit" data-testid="p-save" class="rounded bg-emerald-600 px-4 py-2 font-medium">
        {{ editingId ? 'Save changes' : 'Add player' }}
      </button>
      <button v-if="editingId" type="button" class="rounded bg-slate-800 px-4 py-2" @click="cancel">
        Cancel
      </button>
    </div>
  </form>

  <p v-if="error" data-testid="p-error" class="mt-3 text-sm text-red-400">
    {{ error }}
  </p>

  <table class="mt-8 w-full text-left text-sm">
    <thead class="text-slate-400">
      <tr>
        <th class="py-2">
          Name
        </th>
        <th>Club</th>
        <th>Age</th>
        <th>S / D / Mx</th>
        <th />
      </tr>
    </thead>
    <tbody data-testid="p-rows" class="divide-y divide-slate-800">
      <tr v-for="p in players" :key="p.id" :data-player-id="p.id">
        <td class="py-2 font-medium">
          {{ p.first_name }} {{ p.last_name }}
        </td>
        <td class="text-slate-400">
          {{ p.club || '—' }}
        </td>
        <td class="text-slate-400" data-testid="p-age">
          {{ age(p.birth_year) }}
        </td>
        <td class="text-slate-400">
          {{ p.rank_singles || '—' }} / {{ p.rank_doubles || '—' }} / {{ p.rank_mixed || '—' }}
        </td>
        <td class="text-right">
          <button class="text-slate-400 hover:text-slate-100" @click="edit(p)">
            Edit
          </button>
          <button class="ml-3 text-red-400 hover:text-red-300" @click="remove(p.id)">
            Delete
          </button>
        </td>
      </tr>
    </tbody>
  </table>
  <p v-if="!players?.length" class="mt-4 text-slate-400">
    No players yet.
  </p>
</template>
