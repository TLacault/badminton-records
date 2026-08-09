<script setup lang="ts">
import type { FfbadPlayer } from '~~/server/utils/ffbad'
import { Loader, Search } from '@lucide/vue'

const emit = defineEmits<{ select: [player: FfbadPlayer] }>()

const term = ref('')
const results = ref<FfbadPlayer[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const open = ref(false)

let timer: ReturnType<typeof setTimeout> | null = null
let sequence = 0

async function run(value: string) {
  if (value.trim().length < 2) {
    results.value = []
    error.value = null
    return
  }
  // Guards against a slow early request landing after a fast later one.
  const ticket = ++sequence
  busy.value = true
  error.value = null
  try {
    const res = await $fetch<{ players: FfbadPlayer[] }>('/api/ffbad/search', {
      query: { q: value },
    })
    if (ticket !== sequence) return
    results.value = res.players
    open.value = true
  }
  catch (cause) {
    if (ticket !== sequence) return
    const err = cause as { statusMessage?: string, message?: string }
    error.value = err.statusMessage ?? err.message ?? 'Search failed'
    results.value = []
  }
  finally {
    if (ticket === sequence) busy.value = false
  }
}

watch(term, (value) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => run(value), 300)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

function choose(player: FfbadPlayer) {
  emit('select', player)
  open.value = false
  term.value = ''
  results.value = []
}

function age(birthYear: number | null) {
  return birthYear ? `${new Date().getFullYear() - birthYear}y` : null
}

function ranks(p: FfbadPlayer) {
  return [p.rankSingles, p.rankDoubles, p.rankMixed].map(r => r || '—').join(' / ')
}
</script>

<template>
  <div class="relative">
    <label for="ffbad-search" class="label">Find a licensee</label>
    <div class="field mt-2 flex items-center gap-2.5 py-0">
      <component
        :is="busy ? Loader : Search"
        :size="16"
        class="shrink-0"
        :class="busy ? 'animate-spin text-accent' : 'text-ink-subtle'"
        aria-hidden="true"
      />
      <input
        id="ffbad-search"
        v-model="term"
        data-testid="ffbad-search"
        type="search"
        autocomplete="off"
        placeholder="Search FFBaD by surname…"
        class="min-h-11 w-full bg-transparent outline-none placeholder:text-ink-subtle"
        aria-describedby="ffbad-help"
        @focus="open = true"
      >
    </div>

    <p id="ffbad-help" class="mt-1.5 text-xs text-ink-subtle">
      Fills the form from the federation's records — it does not save anything.
    </p>

    <p v-if="error" data-testid="ffbad-error" role="alert" class="mt-1.5 text-xs text-accent">
      {{ error }}
    </p>

    <ul
      v-if="open && results.length"
      data-testid="ffbad-results"
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
          <span v-if="age(p.birthYear)" class="text-xs tabular-nums text-ink-subtle">{{ age(p.birthYear) }}</span>
          <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-ink-subtle">{{ p.licence }}</span>
        </button>
      </li>
    </ul>

    <p
      v-else-if="open && term.trim().length >= 2 && !busy && !error"
      class="mt-1.5 text-xs text-ink-subtle"
    >
      No licensee found.
    </p>
  </div>
</template>
