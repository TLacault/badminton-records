<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MyffbadPlayer } from '~~/server/utils/myffbad'
import type { PlayerSortKey } from '~/utils/players'
import { ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, Pencil, Save, Trash2, TriangleAlert, UserPlus, UsersRound, X } from '@lucide/vue'
import { myffbadProfileUrl, sortPlayers } from '~/utils/players'

definePageMeta({ middleware: 'admin', layout: 'admin' })

type PlayerRow = Database['public']['Tables']['players']['Row']
type PlayerInsert = Database['public']['Tables']['players']['Insert']

const client = useSupabaseClient<Database>()

const { data: players, refresh } = await useAsyncData('players', async () => {
  const { data } = await client.from('players').select('*').order('last_name')
  return data ?? []
})

/** MyFFBaD club id → our club row, so autofill can link rather than copy text. */
const { data: clubs } = await useAsyncData('players-clubs', async () => {
  const { data } = await client
    .from('clubs')
    .select('id, myffbad_club_id')
    .not('myffbad_club_id', 'is', null)
  return data ?? []
})

function blank(): PlayerInsert {
  return {
    first_name: '',
    last_name: '',
    club: '',
    rank_singles: '',
    rank_doubles: '',
    rank_mixed: '',
    ffbad_license: '',
    category: '',
    cpph: null,
    myffbad_person_id: '',
    club_id: null,
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

/** The licence already on the roster, if this form would duplicate one. */
const duplicate = computed(() => {
  const licence = form.value.ffbad_license?.trim()
  if (!licence) return null
  return (players.value ?? []).find(
    p => p.ffbad_license === licence && p.id !== editingId.value,
  ) ?? null
})

async function save() {
  error.value = null

  if (duplicate.value) {
    const { first_name, last_name } = duplicate.value
    error.value
      = `Licence ${form.value.ffbad_license} already belongs to ${first_name} ${last_name}.`
    return
  }

  // '' would collide with every other blank licence under the unique index,
  // and an empty string is not a licence anyway.
  const licence = form.value.ffbad_license?.trim()
  const payload = { ...form.value, ffbad_license: licence || null }

  const { error: dbError } = editingId.value
    ? await client.from('players').update(payload).eq('id', editingId.value)
    : await client.from('players').insert(payload)
  if (dbError) {
    // The unique index is the real guard — the check above only catches what
    // this browser has already loaded.
    error.value = dbError.code === '23505'
      ? `Licence ${licence} is already on the roster.`
      : dbError.message
    return
  }
  cancel()
  await refresh()
}

async function remove(player: PlayerRow) {
  // Deleting a player is not undoable and the FK only stops it when a match
  // already uses them — a roster typo would otherwise vanish silently.
  const name = `${player.first_name} ${player.last_name}`.trim()
  if (import.meta.client && !window.confirm(`Delete ${name} from the roster?`)) return

  const id = player.id
  error.value = null
  const { error: dbError } = await client.from('players').delete().eq('id', id)
  if (dbError) {
    // The FK is ON DELETE RESTRICT, so a player used by a match cannot go.
    error.value = `${dbError.message} — this player is used by a match.`
    return
  }
  await refresh()
}

/**
 * Fills the form from a MyFFBaD licensee. It does not save — the admin still
 * reviews and submits, so a bad match, or a name the surname rule split wrong,
 * is caught before it reaches the roster.
 *
 * Picking someone already on the roster switches the form to editing them
 * rather than preparing a duplicate the unique licence index would reject.
 */
function fillFromMyffbad(p: MyffbadPlayer) {
  const existing = (players.value ?? []).find(row => row.ffbad_license === p.licence)
  editingId.value = existing?.id ?? null
  form.value = {
    ...blank(),
    first_name: p.firstName,
    last_name: p.lastName,
    club: p.club ?? '',
    rank_singles: p.rankSingles ?? '',
    rank_doubles: p.rankDoubles ?? '',
    rank_mixed: p.rankMixed ?? '',
    ffbad_license: p.licence,
    category: p.category ?? '',
    cpph: p.cpph,
    myffbad_person_id: p.personId,
    // Free text stays as the label; club_id links to our list when we know the
    // club, which is what the search ranking and any "who plays at UST" reads.
    club_id: (clubs.value ?? []).find(c => c.myffbad_club_id === p.clubId)?.id ?? null,
  }
}

/** Labelled, not placeholder-only: a filled-in field must still say what it is. */
interface TextField {
  key: 'first_name' | 'last_name' | 'club' | 'rank_singles' | 'rank_doubles' | 'rank_mixed' | 'ffbad_license' | 'category'
  label: string
  testid?: string
  required?: boolean
  placeholder: string
}

const fields: TextField[] = [
  { key: 'first_name', label: 'First name', testid: 'p-first', required: true, placeholder: 'Jean' },
  { key: 'last_name', label: 'Last name', testid: 'p-last', required: true, placeholder: 'Dupont' },
  { key: 'club', label: 'Club', testid: 'p-club', placeholder: 'USTalence' },
  { key: 'rank_singles', label: 'Rank S', placeholder: 'D9' },
  { key: 'rank_doubles', label: 'Rank D', placeholder: 'D8' },
  { key: 'rank_mixed', label: 'Rank Mx', placeholder: 'P10' },
  { key: 'ffbad_license', label: 'FFBaD licence', placeholder: '00000000' },
  { key: 'category', label: 'Category', placeholder: 'Senior' },
]

/**
 * The sortable columns, in the order they are printed. The three ranks are
 * three columns rather than one `S / D / Mx` cell: written as one string they
 * read fine and sort not at all, and "who are our best doubles players" is the
 * question this table is opened to answer.
 */
const columns: { key: PlayerSortKey, label: string, title: string }[] = [
  { key: 'name', label: 'Name', title: 'Sort by name' },
  { key: 'club', label: 'Club', title: 'Sort by club' },
  { key: 'rank_singles', label: 'S', title: 'Sort by singles rank' },
  { key: 'rank_doubles', label: 'D', title: 'Sort by doubles rank' },
  { key: 'rank_mixed', label: 'Mx', title: 'Sort by mixed rank' },
]

const sortKey = ref<PlayerSortKey>('name')
const direction = ref<'asc' | 'desc'>('asc')

/** A new column starts ascending; the column already sorted flips. */
function sortBy(key: PlayerSortKey) {
  if (sortKey.value === key) {
    direction.value = direction.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  direction.value = 'asc'
}

const rows = computed(() => sortPlayers(players.value ?? [], sortKey.value, direction.value))
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">
          <UsersRound :size="15" aria-hidden="true" />
          Roster
        </p>
        <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
          Players
        </h1>
      </div>
      <p class="text-sm text-ink-subtle">
        <span class="tabular-nums">{{ players?.length ?? 0 }}</span> on the roster
      </p>
    </div>

    <section class="mt-8 rounded-2xl p-5 glass sm:p-6">
      <h2 class="label">
        {{ editingId ? 'Edit player' : 'Add a player' }}
      </h2>

      <PlayerMyffbadSearch class="mt-4 max-w-xl" @select="fillFromMyffbad" />

      <form class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="save">
        <label v-for="field in fields" :key="field.key" class="block">
          <span class="label">
            {{ field.label }}<span v-if="field.required" class="text-accent"> *</span>
          </span>
          <input
            v-model="form[field.key]"
            :data-testid="field.testid"
            :required="field.required"
            :placeholder="field.placeholder"
            class="field mt-2"
          >
        </label>

        <label class="block">
          <span class="label">CPPH</span>
          <input
            v-model.number="form.cpph"
            data-testid="p-cpph"
            type="number"
            step="0.01"
            inputmode="decimal"
            placeholder="1470"
            class="field mt-2 tabular-nums"
          >
        </label>

        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" data-testid="p-save" class="btn btn-primary">
            <component :is="editingId ? Save : UserPlus" :size="16" aria-hidden="true" />
            {{ editingId ? 'Save changes' : 'Add player' }}
          </button>
          <button v-if="editingId" type="button" class="btn btn-ghost" @click="cancel">
            <X :size="16" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </form>

      <p
        v-if="error"
        data-testid="p-error"
        role="alert"
        class="mt-4 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm text-accent"
      >
        <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
        {{ error }}
      </p>
    </section>

    <!-- The table scrolls inside its own box; the page itself never scrolls
         sideways on a phone. -->
    <div v-if="players?.length" class="mt-8 overflow-x-auto rounded-2xl border border-line">
      <table class="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-line bg-panel">
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="px-4 py-3"
              :aria-sort="sortKey === col.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'"
            >
              <button
                type="button"
                :data-testid="`p-sort-${col.key}`"
                :title="col.title"
                class="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] transition-colors duration-150 hover:text-accent"
                :class="sortKey === col.key ? 'text-accent' : 'text-ink-subtle'"
                @click="sortBy(col.key)"
              >
                {{ col.label }}
                <component
                  :is="sortKey === col.key ? (direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown"
                  :size="13"
                  :class="sortKey === col.key ? '' : 'opacity-40'"
                  aria-hidden="true"
                />
              </button>
            </th>
            <th class="px-4 py-3">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody data-testid="p-rows">
          <tr
            v-for="p in rows"
            :key="p.id"
            :data-player-id="p.id"
            class="border-b border-line last:border-b-0 transition-colors duration-150 hover:bg-panel"
            :class="editingId === p.id ? 'bg-accent-soft' : ''"
          >
            <td class="px-4 py-3 font-medium text-ink">
              {{ p.first_name }} {{ p.last_name }}
            </td>
            <td class="px-4 py-3 text-ink-muted">
              {{ p.club || '—' }}
            </td>
            <td class="px-4 py-3 tabular-nums text-ink-muted">
              {{ p.rank_singles || '—' }}
            </td>
            <td class="px-4 py-3 tabular-nums text-ink-muted">
              {{ p.rank_doubles || '—' }}
            </td>
            <td class="px-4 py-3 tabular-nums text-ink-muted">
              {{ p.rank_mixed || '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1">
                <a
                  v-if="myffbadProfileUrl(p.ffbad_license)"
                  :href="myffbadProfileUrl(p.ffbad_license)!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-panel-strong hover:text-accent"
                  :aria-label="`Open ${p.first_name} ${p.last_name} on MyFFBaD`"
                  title="MyFFBaD profile"
                >
                  <ExternalLink :size="15" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-panel-strong hover:text-accent"
                  :aria-label="`Edit ${p.first_name} ${p.last_name}`"
                  title="Edit"
                  @click="edit(p)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-accent-soft hover:text-accent"
                  :aria-label="`Delete ${p.first_name} ${p.last_name}`"
                  title="Delete"
                  @click="remove(p)"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="mt-8 rounded-2xl border border-dashed border-line px-6 py-14 text-center text-ink-muted">
      No players yet — search the federation above, or type one in by hand.
    </p>
  </div>
</template>
