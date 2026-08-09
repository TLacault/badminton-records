<script setup lang="ts">
import type { Database } from '~/types/database.types'
import { GripVertical, Plus, Save, Tags, Trash2, TriangleAlert } from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const client = useSupabaseClient<Database>()

const { data: types, refresh } = await useAsyncData('match-types', async () => {
  const { data } = await client.from('match_types').select('*').order('sort_order')
  return data ?? []
})

/** How many matches point at each type, so a delete can say what it would cost. */
const { data: usage } = await useAsyncData('match-type-usage', async () => {
  const { data } = await client.from('matches').select('match_type_id')
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    if (row.match_type_id) counts[row.match_type_id] = (counts[row.match_type_id] ?? 0) + 1
  }
  return counts
})

const error = ref<string | null>(null)
const busy = ref(false)
const newLabel = ref('')

/** `Interclubs D2` → `interclubs-d2`. Stable id for a hand-typed label. */
function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function add() {
  const label = newLabel.value.trim()
  if (!label) return
  busy.value = true
  error.value = null

  const last = types.value?.at(-1)
  const { error: dbError } = await client.from('match_types').insert({
    slug: slugify(label),
    label,
    sort_order: (last?.sort_order ?? 0) + 10,
  })

  busy.value = false
  if (dbError) {
    error.value = dbError.code === '23505'
      ? `“${label}” already exists.`
      : dbError.message
    return
  }
  newLabel.value = ''
  await refresh()
}

async function rename(id: string, label: string) {
  const trimmed = label.trim()
  if (!trimmed) return
  // The slug is left alone on purpose: renaming "Interclubs" to "Interclub"
  // must not orphan anything that already refers to it.
  const { error: dbError } = await client
    .from('match_types').update({ label: trimmed }).eq('id', id)
  if (dbError) error.value = dbError.message
}

async function move(id: string, direction: -1 | 1) {
  const rows = types.value ?? []
  const at = rows.findIndex(t => t.id === id)
  const swap = rows[at + direction]
  const self = rows[at]
  if (!swap || !self) return

  await Promise.all([
    client.from('match_types').update({ sort_order: swap.sort_order }).eq('id', self.id),
    client.from('match_types').update({ sort_order: self.sort_order }).eq('id', swap.id),
  ])
  await refresh()
}

async function remove(id: string, label: string) {
  const used = usage.value?.[id] ?? 0
  const warning = used
    ? `${label} is used by ${used} match${used === 1 ? '' : 'es'}. They will be left with no type. Delete it?`
    : `Delete ${label}?`
  if (!confirm(warning)) return

  const { error: dbError } = await client.from('match_types').delete().eq('id', id)
  if (dbError) {
    error.value = dbError.message
    return
  }
  await refresh()
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <p class="eyebrow">
      <Tags :size="15" aria-hidden="true" />
      Vocabulary
    </p>
    <h1 class="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight">
      Match types
    </h1>
    <p class="mt-3 text-sm text-ink-muted">
      The tag printed above every video. Add whatever the club actually plays —
      nothing here needs a deploy.
    </p>

    <p
      v-if="error"
      role="alert"
      data-testid="mt-error"
      class="mt-5 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent"
    >
      <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
      {{ error }}
    </p>

    <ul data-testid="mt-list" class="mt-7 flex flex-col gap-2">
      <li
        v-for="(type, index) in types"
        :key="type.id"
        class="flex items-center gap-3 rounded-xl p-2.5 glass"
      >
        <div class="flex shrink-0 flex-col text-ink-subtle">
          <button
            type="button"
            class="leading-none transition-colors duration-150 hover:text-accent disabled:opacity-25"
            :disabled="index === 0"
            :aria-label="`Move ${type.label} up`"
            @click="move(type.id, -1)"
          >
            ▲
          </button>
          <button
            type="button"
            class="leading-none transition-colors duration-150 hover:text-accent disabled:opacity-25"
            :disabled="index === (types?.length ?? 0) - 1"
            :aria-label="`Move ${type.label} down`"
            @click="move(type.id, 1)"
          >
            ▼
          </button>
        </div>
        <GripVertical :size="14" class="shrink-0 text-ink-subtle" aria-hidden="true" />

        <input
          :value="type.label"
          class="field !min-h-9 flex-1 !py-1"
          :aria-label="`Rename ${type.label}`"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          @blur="rename(type.id, ($event.target as HTMLInputElement).value)"
        >

        <span class="shrink-0 text-xs tabular-nums text-ink-subtle">
          {{ usage?.[type.id] ?? 0 }} used
        </span>

        <button
          type="button"
          class="shrink-0 text-ink-subtle transition-colors duration-150 hover:text-accent"
          :aria-label="`Delete ${type.label}`"
          @click="remove(type.id, type.label)"
        >
          <Trash2 :size="15" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <form class="mt-4 flex gap-2" @submit.prevent="add">
      <input
        v-model="newLabel"
        data-testid="mt-new"
        placeholder="Regional final"
        class="field"
        aria-label="New match type"
      >
      <button type="submit" :disabled="busy || !newLabel.trim()" class="btn btn-primary shrink-0">
        <component :is="busy ? Save : Plus" :size="16" aria-hidden="true" />
        Add
      </button>
    </form>
  </div>
</template>
