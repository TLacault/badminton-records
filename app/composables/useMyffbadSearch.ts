import type { MyffbadPlayer } from '~~/server/utils/myffbad'
import type { Ref } from 'vue'

/**
 * The three legs of a player search, in the order they are tried.
 *
 * `local` is the roster we already hold — free, instant, and right nearly
 * every time. `club` asks MyFFBaD for our own club, which is where a new
 * team-mate comes from. `all` asks it for France, which is where an opponent
 * comes from. Each leg is only reached when the one before it found nobody,
 * so the common case never touches the network and a search for a common
 * surname is never a page of strangers from the other end of the country.
 */
export type SearchStage = 'local' | 'club' | 'all'

/** The leg after this one, or null once the search is as wide as it goes. */
export const NEXT_STAGE: Record<SearchStage, 'club' | 'all' | null> = {
  local: 'club',
  club: 'all',
  all: null,
}

/** What the button that widens the search says. */
export const STAGE_ACTION: Record<'club' | 'all', string> = {
  club: 'Start UST search',
  all: 'Start global search',
}

/** What the block of results calls itself. */
export const STAGE_LABEL: Record<'club' | 'all', string> = {
  club: 'US Talence — from MyFFBaD',
  all: 'All of France — from MyFFBaD',
}

/**
 * Long enough that typing a full name is one request rather than a dozen —
 * this hits someone else's website, so the quiet period is deliberate.
 */
const DEBOUNCE_MS = 1000

/** Below this a term matches half the federation, so it is not searched. */
export const MIN_TERM_LENGTH = 2

export interface StagedSearchOptions {
  term: Ref<string>
  /**
   * How many roster rows the term already matches. While that is above zero
   * the search stays local: the person is in front of you, and going to
   * MyFFBaD would only offer a second copy of them.
   */
  localCount?: () => number
  /** The leg a fresh term starts on. Forms with no roster start at `club`. */
  startAt?: SearchStage
}

interface SearchResponse {
  players: MyffbadPlayer[]
  total: number
  scope: 'club' | 'all'
  truncated: boolean
}

/**
 * Drives the local → club → France escalation for one search box.
 *
 * Each leg can also be started by hand, which is the point of returning
 * `run`: the automatic path only widens when a leg found nobody, and
 * sometimes you can see the roster's answer is not the person you mean.
 */
export function useMyffbadSearch(options: StagedSearchOptions) {
  const { term, localCount = () => 0, startAt = 'local' } = options

  const stage = ref<SearchStage>(startAt)
  const results = ref<MyffbadPlayer[]>([])
  const total = ref(0)
  const truncated = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  /** True once the current leg has answered, so "nobody" can be said honestly. */
  const answered = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null
  // Guards against a slow early request landing after a fast later one.
  let sequence = 0

  const searchable = computed(() => term.value.trim().length >= MIN_TERM_LENGTH)
  const next = computed(() => NEXT_STAGE[stage.value])

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  async function run(scope: 'club' | 'all') {
    cancel()
    if (!searchable.value) return

    stage.value = scope
    results.value = []
    answered.value = false
    const ticket = ++sequence
    busy.value = true
    error.value = null
    try {
      const res = await $fetch<SearchResponse>('/api/myffbad/search', {
        query: { q: term.value.trim(), scope },
      })
      if (ticket !== sequence) return
      results.value = res.players
      total.value = res.total
      truncated.value = res.truncated
      answered.value = true

      // Nobody in our club is not an answer, it is a reason to look wider.
      // The inner call takes the ticket with it, so the `finally` below sees a
      // stale one and leaves `busy` to the leg that is actually running.
      if (!res.players.length && scope === 'club') await run('all')
    }
    catch (cause) {
      if (ticket !== sequence) return
      const err = cause as { statusMessage?: string, message?: string }
      error.value = err.statusMessage ?? err.message ?? 'MyFFBaD search failed'
      results.value = []
      answered.value = true
    }
    finally {
      if (ticket === sequence) busy.value = false
    }
  }

  /** Back to the first leg with nothing found — a new term, or a pick made. */
  function reset() {
    cancel()
    sequence += 1
    stage.value = startAt
    results.value = []
    total.value = 0
    truncated.value = false
    busy.value = false
    error.value = null
    answered.value = false
  }

  watch(term, () => {
    reset()
    if (!searchable.value) return
    timer = setTimeout(() => {
      // The roster answered, so the network is not asked.
      if (startAt === 'local' && localCount() > 0) return
      run('club')
    }, DEBOUNCE_MS)
  })

  onBeforeUnmount(cancel)

  return { stage, next, results, total, truncated, busy, error, answered, searchable, run, reset }
}
