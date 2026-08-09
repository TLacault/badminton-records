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
    <div class="flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2">
      <component :is="busy ? Loader : Search" :size="15" :class="busy ? 'animate-spin text-slate-400' : 'text-slate-500'" />
      <input
        v-model="term"
        data-testid="ffbad-search"
        placeholder="Search FFBaD by surname…"
        class="w-full bg-transparent outline-none placeholder:text-slate-500"
        @focus="open = true"
      >
    </div>

    <p v-if="error" data-testid="ffbad-error" class="mt-1 text-xs text-amber-400">
      {{ error }}
    </p>

    <ul
      v-if="open && results.length"
      data-testid="ffbad-results"
      class="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-xl"
    >
      <li v-for="p in results" :key="p.licence">
        <button
          type="button"
          class="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800"
          @click="choose(p)"
        >
          <span class="font-medium">{{ p.lastName }} {{ p.firstName }}</span>
          <span class="text-xs text-slate-400">{{ ranks(p) }}</span>
          <span v-if="age(p.birthYear)" class="text-xs text-slate-500">{{ age(p.birthYear) }}</span>
          <span class="ml-auto shrink-0 font-mono text-xs text-slate-600">{{ p.licence }}</span>
        </button>
      </li>
    </ul>

    <p
      v-else-if="open && term.trim().length >= 2 && !busy && !error"
      class="mt-1 text-xs text-slate-500"
    >
      No licensee found.
    </p>
  </div>
</template>
