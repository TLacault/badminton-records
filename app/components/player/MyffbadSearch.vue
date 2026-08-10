<script setup lang="ts">
import type { MyffbadPlayer } from '~~/server/utils/myffbad'
import { Loader, Search } from '@lucide/vue'

const emit = defineEmits<{ select: [player: MyffbadPlayer] }>()

/**
 * Long enough that typing a full name is one request rather than a dozen —
 * this hits someone else's website, so the quiet period is deliberate.
 */
const DEBOUNCE_MS = 1000

const term = ref('')
const results = ref<MyffbadPlayer[]>([])
const truncated = ref(false)
const total = ref(0)
const maxPages = ref(0)

/**
 * `total` counts the first page only, so it understates the moment there are
 * further pages — say "many" rather than a number we know to be wrong.
 */
const matchCount = computed(() =>
  maxPages.value > 1 ? 'many' : String(total.value),
)
const busy = ref(false)
const error = ref<string | null>(null)
const open = ref(false)
const searched = ref(false)

let timer: ReturnType<typeof setTimeout> | null = null
let sequence = 0

async function run(value: string) {
  if (value.trim().length < 2) {
    results.value = []
    error.value = null
    searched.value = false
    return
  }
  // Guards against a slow early request landing after a fast later one.
  const ticket = ++sequence
  busy.value = true
  error.value = null
  try {
    const res = await $fetch<{
      players: MyffbadPlayer[]
      total: number
      maxPages: number
      truncated: boolean
    }>('/api/myffbad/search', { query: { q: value } })
    if (ticket !== sequence) return
    results.value = res.players
    total.value = res.total
    maxPages.value = res.maxPages ?? 0
    truncated.value = res.truncated
    searched.value = true
    open.value = true
  }
  catch (cause) {
    if (ticket !== sequence) return
    const err = cause as { statusMessage?: string, message?: string }
    error.value = err.statusMessage ?? err.message ?? 'Search failed'
    results.value = []
    searched.value = true
  }
  finally {
    if (ticket === sequence) busy.value = false
  }
}

watch(term, (value) => {
  if (timer) clearTimeout(timer)
  searched.value = false
  timer = setTimeout(() => run(value), DEBOUNCE_MS)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

function choose(player: MyffbadPlayer) {
  emit('select', player)
  open.value = false
  term.value = ''
  results.value = []
  searched.value = false
}

function ranks(p: MyffbadPlayer) {
  return [p.rankSingles, p.rankDoubles, p.rankMixed].map(r => r || '—').join(' / ')
}
</script>

<template>
  <div class="relative">
    <label for="myffbad-search" class="label">Find a licensee</label>
    <div class="field mt-2 flex items-center gap-2.5 py-0">
      <component
        :is="busy ? Loader : Search"
        :size="16"
        class="shrink-0"
        :class="busy ? 'animate-spin text-accent' : 'text-ink-subtle'"
        aria-hidden="true"
      />
      <input
        id="myffbad-search"
        v-model="term"
        data-testid="myffbad-search"
        type="search"
        autocomplete="off"
        placeholder="Search MyFFBaD by name…"
        class="min-h-11 w-full bg-transparent outline-none placeholder:text-ink-subtle"
        aria-describedby="myffbad-help"
        @focus="open = true"
      >
    </div>

    <p id="myffbad-help" class="mt-1.5 text-xs text-ink-subtle">
      Fills the form from myffbad.fr — it does not save anything, and it cannot
      know a birth year.
    </p>

    <p v-if="error" data-testid="myffbad-error" role="alert" class="mt-1.5 text-xs text-accent">
      {{ error }}
    </p>

    <ul
      v-if="open && results.length"
      data-testid="myffbad-results"
      class="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-panel-solid p-1 shadow-[var(--ui-shadow)]"
    >
      <li v-for="p in results" :key="p.licence">
        <button
          type="button"
          class="flex w-full items-baseline gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-accent-soft hover:text-accent"
          @click="choose(p)"
        >
          <span class="font-medium">{{ p.lastName }} {{ p.firstName }}</span>
          <span class="text-xs tabular-nums text-ink-muted">{{ ranks(p) }}</span>
          <span v-if="p.category" class="truncate text-xs text-ink-subtle">{{ p.category }}</span>
          <span v-if="p.club" class="truncate text-xs text-ink-subtle">{{ p.club }}</span>
          <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-ink-subtle">{{ p.licence }}</span>
        </button>
      </li>
    </ul>

    <p
      v-if="open && truncated && results.length"
      data-testid="myffbad-truncated"
      class="mt-1.5 text-xs text-ink-subtle"
    >
      Showing {{ results.length }} of {{ matchCount }} matches — add a first name to narrow it down.
    </p>

    <p
      v-else-if="open && searched && !results.length && !busy && !error"
      class="mt-1.5 text-xs text-ink-subtle"
    >
      No licensee found.
    </p>
  </div>
</template>
