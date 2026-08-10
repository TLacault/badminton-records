<script setup lang="ts">
import type { Database } from '~/types/database.types'
import {
  Building2,
  ExternalLink,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin' })

type ClubRow = Database['public']['Tables']['clubs']['Row']
type ClubInsert = Database['public']['Tables']['clubs']['Insert']

const client = useSupabaseClient<Database>()

const { data: clubs, refresh } = await useAsyncData('clubs', async () => {
  const { data } = await client
    .from('clubs')
    .select('*')
    .order('priority', { ascending: false })
    .order('name')
  return data ?? []
})

function blank(): ClubInsert {
  return {
    name: '',
    acronym: '',
    city: '',
    department: '33',
    myffbad_club_id: '',
    source: 'manual',
    priority: 0,
  }
}

const form = ref<ClubInsert>(blank())
const editingId = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)
const imported = ref<string | null>(null)

function edit(club: ClubRow) {
  editingId.value = club.id
  form.value = { ...club }
}

function cancel() {
  editingId.value = null
  form.value = blank()
}

async function save() {
  error.value = null
  // Empty text would collide on the unique index the moment a second club had
  // no MyFFBaD id, the same trap the roster's licence had.
  const payload = {
    ...form.value,
    myffbad_club_id: form.value.myffbad_club_id?.trim() || null,
  }
  const { error: dbError } = editingId.value
    ? await client.from('clubs').update(payload).eq('id', editingId.value)
    : await client.from('clubs').insert(payload)
  if (dbError) {
    error.value = dbError.code === '23505'
      ? `MyFFBaD club ${payload.myffbad_club_id} is already in the list.`
      : dbError.message
    return
  }
  cancel()
  await refresh()
}

async function remove(club: ClubRow) {
  if (
    import.meta.client
    && !window.confirm(`Delete ${club.name}? Players pointing at it lose their club link.`)
  ) return

  error.value = null
  const { error: dbError } = await client.from('clubs').delete().eq('id', club.id)
  if (dbError) {
    error.value = dbError.message
    return
  }
  await refresh()
}

/** Re-imports from badiste. Manual rows and every priority survive it. */
async function reimport() {
  busy.value = true
  error.value = null
  imported.value = null
  try {
    const res = await $fetch<{ imported: number, added: number, archived: number }>(
      '/api/clubs/refresh',
      { method: 'POST' },
    )
    imported.value
      = `${res.imported} clubs read — ${res.added} new, ${res.archived} archived.`
    await refresh()
  }
  catch (cause) {
    const err = cause as { statusMessage?: string, message?: string }
    error.value = err.statusMessage ?? err.message ?? 'Refresh failed'
  }
  finally {
    busy.value = false
  }
}

/** Priority is a ranking knob, so it reads as words rather than a number. */
function rank(priority: number) {
  if (priority >= 100) return 'Ours'
  if (priority > 0) return `Priority ${priority}`
  return '—'
}

interface TextField {
  key: 'name' | 'acronym' | 'city' | 'department' | 'myffbad_club_id'
  label: string
  required?: boolean
  placeholder: string
}

const fields: TextField[] = [
  { key: 'name', label: 'Name', required: true, placeholder: 'Union Sportive Talence Badminton' },
  { key: 'acronym', label: 'Acronym', placeholder: 'UST33' },
  { key: 'city', label: 'City', placeholder: 'TALENCE' },
  { key: 'department', label: 'Dept.', placeholder: '33' },
  { key: 'myffbad_club_id', label: 'MyFFBaD id', placeholder: '830' },
]
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">
          <Building2 :size="15" aria-hidden="true" />
          Reference
        </p>
        <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
          Clubs
        </h1>
      </div>
      <div class="flex items-center gap-3">
        <p class="text-sm text-ink-subtle">
          <span class="tabular-nums">{{ clubs?.length ?? 0 }}</span> listed
        </p>
        <button
          type="button"
          data-testid="c-refresh"
          class="btn btn-ghost"
          :disabled="busy"
          @click="reimport"
        >
          <RefreshCw :size="16" :class="busy ? 'animate-spin' : ''" aria-hidden="true" />
          Refresh from badiste
        </button>
      </div>
    </div>

    <p v-if="imported" data-testid="c-imported" class="mt-4 text-sm text-ink-muted">
      {{ imported }}
    </p>

    <section class="mt-8 rounded-2xl p-5 glass sm:p-6">
      <h2 class="label">
        {{ editingId ? 'Edit club' : 'Add a club' }}
      </h2>
      <p class="mt-1.5 text-xs text-ink-subtle">
        Clubs come from badiste's Gironde list. Add one by hand for anywhere
        else — a refresh never touches it.
      </p>

      <form class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" @submit.prevent="save">
        <label v-for="field in fields" :key="field.key" class="block">
          <span class="label">
            {{ field.label }}<span v-if="field.required" class="text-accent"> *</span>
          </span>
          <input
            v-model="form[field.key]"
            :required="field.required"
            :placeholder="field.placeholder"
            class="field mt-2"
          >
        </label>

        <label class="block">
          <span class="label">Search priority</span>
          <input
            v-model.number="form.priority"
            data-testid="c-priority"
            type="number"
            inputmode="numeric"
            placeholder="0"
            class="field mt-2 tabular-nums"
          >
          <span class="mt-1.5 block text-xs text-ink-subtle">
            Higher sorts first in player search. Ours is 100.
          </span>
        </label>

        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" data-testid="c-save" class="btn btn-primary">
            <component :is="editingId ? Save : Building2" :size="16" aria-hidden="true" />
            {{ editingId ? 'Save changes' : 'Add club' }}
          </button>
          <button v-if="editingId" type="button" class="btn btn-ghost" @click="cancel">
            <X :size="16" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </form>

      <p
        v-if="error"
        data-testid="c-error"
        role="alert"
        class="mt-4 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm text-accent"
      >
        <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
        {{ error }}
      </p>
    </section>

    <div v-if="clubs?.length" class="mt-8 overflow-x-auto rounded-2xl border border-line">
      <table class="w-full min-w-[44rem] border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-line bg-panel">
            <th class="px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Club
            </th>
            <th class="px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Acronym
            </th>
            <th class="px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              City
            </th>
            <th class="px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Rank
            </th>
            <th class="px-4 py-3">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody data-testid="c-rows">
          <tr
            v-for="c in clubs"
            :key="c.id"
            :data-club-id="c.id"
            class="border-b border-line last:border-b-0 transition-colors duration-150 hover:bg-panel"
            :class="[
              editingId === c.id ? 'bg-accent-soft' : '',
              c.archived_at ? 'opacity-50' : '',
            ]"
          >
            <td class="px-4 py-3 font-medium text-ink">
              {{ c.name }}
              <span v-if="c.archived_at" class="ml-1.5 text-xs font-normal text-ink-subtle">
                archived
              </span>
              <span v-if="c.source === 'manual'" class="ml-1.5 text-xs font-normal text-ink-subtle">
                manual
              </span>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-ink-muted">
              {{ c.acronym || '—' }}
            </td>
            <td class="px-4 py-3 text-ink-muted">
              {{ c.city || '—' }}
            </td>
            <td class="px-4 py-3 tabular-nums text-ink-muted">
              {{ rank(c.priority) }}
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1">
                <a
                  v-if="c.myffbad_club_id"
                  :href="`https://myffbad.fr/club/${c.myffbad_club_id}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-panel-strong hover:text-accent"
                  :aria-label="`Open ${c.name} on MyFFBaD`"
                  title="MyFFBaD club page"
                >
                  <ExternalLink :size="15" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-panel-strong hover:text-accent"
                  :aria-label="`Edit ${c.name}`"
                  title="Edit"
                  @click="edit(c)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-accent-soft hover:text-accent"
                  :aria-label="`Delete ${c.name}`"
                  title="Delete"
                  @click="remove(c)"
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
      No clubs yet — hit “Refresh from badiste” to import the Gironde list.
    </p>
  </div>
</template>
