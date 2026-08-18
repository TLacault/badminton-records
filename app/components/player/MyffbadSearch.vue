<script setup lang="ts">
import type { MyffbadPlayer } from '~~/server/utils/myffbad'
import { Globe, Loader, Search, UserSearch } from '@lucide/vue'
// Named explicitly rather than auto-imported: the template reads them, and a
// bare identifier there resolves against the setup bindings, not unimport.
import { MIN_TERM_LENGTH, STAGE_ACTION, STAGE_LABEL, useMyffbadSearch } from '~/composables/useMyffbadSearch'

const emit = defineEmits<{ select: [player: MyffbadPlayer] }>()

const term = ref('')
const open = ref(false)

/**
 * No roster leg here: this form exists to put someone on the roster, so the
 * search starts at our own club and widens to France on its own when the club
 * has nobody by that name.
 */
const { stage, next, results, truncated, busy, error, answered, searchable, run, reset }
  = useMyffbadSearch({ term, startAt: 'club' })

watch(term, () => {
  open.value = true
})

function choose(player: MyffbadPlayer) {
  emit('select', player)
  open.value = false
  term.value = ''
  reset()
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

    <div class="mt-2 flex flex-wrap items-center gap-2">
      <button
        v-if="next"
        type="button"
        data-testid="myffbad-widen"
        class="btn btn-sm border border-accent/50 bg-accent-soft text-accent hover:brightness-125 disabled:opacity-45"
        :disabled="!searchable || busy"
        :title="searchable ? undefined : `Type at least ${MIN_TERM_LENGTH} letters first`"
        @click="run(next)"
      >
        <component :is="next === 'club' ? UserSearch : Globe" :size="14" aria-hidden="true" />
        {{ STAGE_ACTION[next] }}
      </button>

      <p id="myffbad-help" class="text-xs text-ink-subtle">
        Fills the form from myffbad.fr — it does not save anything. US Talence
        first, then all of France.
      </p>
    </div>

    <p v-if="error" data-testid="myffbad-error" role="alert" class="mt-1.5 text-xs text-accent">
      {{ error }}
    </p>

    <template v-if="open && results.length">
      <p
        data-testid="myffbad-scope"
        class="mt-2 text-xs uppercase tracking-[0.14em] text-ink-subtle"
      >
        {{ STAGE_LABEL[stage === 'all' ? 'all' : 'club'] }}
      </p>
      <ul
        data-testid="myffbad-results"
        class="mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-panel-solid p-1 shadow-[var(--ui-shadow)]"
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
        v-if="truncated"
        data-testid="myffbad-truncated"
        class="mt-1.5 text-xs text-ink-subtle"
      >
        Showing the first {{ results.length }} matches — add a first name to narrow it down.
      </p>
    </template>

    <p
      v-else-if="open && answered && !busy && !error"
      class="mt-1.5 text-xs text-ink-subtle"
    >
      {{ stage === 'club' ? 'Nobody at US Talence.' : 'No licensee found in France.' }}
    </p>
  </div>
</template>
