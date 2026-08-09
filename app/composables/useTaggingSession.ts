import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, RallyInput, Side } from '~~/shared/badminton'
import { deriveMatch, insertPositionFor } from '~~/shared/badminton'

const UNDO_LIMIT = 100
const SAVE_DEBOUNCE_MS = 1500

interface Snapshot {
  rallies: RallyInput[]
  breaks: BreakInput[]
}

function clone(rallies: RallyInput[], breaks: BreakInput[]): Snapshot {
  return {
    rallies: rallies.map(r => ({ ...r })),
    breaks: breaks.map(b => ({ ...b })),
  }
}

export function useTaggingSession(
  matchId: string,
  config: Ref<MatchConfig>,
  initial: RallyInput[],
  initialBreaks: BreakInput[] = [],
) {
  const client = useSupabaseClient<Database>()

  const rallies = ref<RallyInput[]>(initial.map(r => ({ ...r })))
  const breaks = ref<BreakInput[]>(initialBreaks.map(b => ({ ...b })))
  const undoStack = ref<Snapshot[]>([])
  const redoStack = ref<Snapshot[]>([])
  /**
   * The rally most recently logged. `P` and the scorer numkeys act on it, and
   * it is not always the last element: a point inserted to patch a miscount
   * lands mid-log.
   */
  const lastTouchedIdx = ref<number | null>(null)
  const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveError = ref<string | null>(null)
  const dirty = ref(false)

  const derived = computed(() => deriveMatch(config.value, rallies.value))
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  let timer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave() {
    dirty.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(saveNow, SAVE_DEBOUNCE_MS)
  }

  async function saveNow() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    saveState.value = 'saving'
    const payload = rallies.value.map(r => ({
      idx: r.idx,
      winnerSide: r.winnerSide,
      isLet: r.isLet,
      isHighlight: r.isHighlight,
      scoredByPlayerId: r.scoredByPlayerId,
      endedAtSeconds: r.endedAtSeconds,
    }))
    const { error } = await client.rpc('save_match_rallies', {
      p_match_id: matchId,
      p_rallies: payload,
    })
    if (error) {
      saveState.value = 'error'
      saveError.value = error.message
      return
    }

    // Breaks live outside the rally RPC. Replaced wholesale, like the rally
    // log: there are only a handful, and diffing would buy nothing.
    await client.from('match_breaks').delete().eq('match_id', matchId)
    if (breaks.value.length) {
      const { error: breakError } = await client.from('match_breaks').insert(
        breaks.value.map(b => ({
          match_id: matchId,
          idx: b.idx,
          starts_at_seconds: b.startsAtSeconds,
          ends_at_seconds: b.endsAtSeconds,
        })),
      )
      if (breakError) {
        saveState.value = 'error'
        saveError.value = breakError.message
        return
      }
    }

    saveState.value = 'saved'
    saveError.value = null
    dirty.value = false
  }

  /** Snapshot for undo, apply the mutation, renumber, then queue a save. */
  function mutate(fn: () => void) {
    undoStack.value.push(clone(rallies.value, breaks.value))
    if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
    redoStack.value = []
    fn()
    rallies.value.forEach((r, i) => {
      r.idx = i
    })
    breaks.value.forEach((b, i) => {
      b.idx = i
    })
    scheduleSave()
  }

  function addRally(winnerSide: Side, endedAtSeconds: number) {
    const at = insertPositionFor(rallies.value, endedAtSeconds)
    mutate(() => {
      rallies.value.splice(at, 0, {
        idx: at,
        winnerSide,
        isLet: false,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
    lastTouchedIdx.value = at
  }

  function addLet(endedAtSeconds: number) {
    const at = insertPositionFor(rallies.value, endedAtSeconds)
    mutate(() => {
      rallies.value.splice(at, 0, {
        idx: at,
        winnerSide: null,
        isLet: true,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
    lastTouchedIdx.value = at
  }

  /** The rally `P` and the scorer numkeys apply to. */
  function lastTouched() {
    if (lastTouchedIdx.value !== null) {
      const hit = rallies.value[lastTouchedIdx.value]
      if (hit) return hit
    }
    return rallies.value.at(-1)
  }

  function toggleHighlightOnLast() {
    const target = lastTouched()
    if (!target) return
    mutate(() => {
      target.isHighlight = !target.isHighlight
    })
  }

  function setScorerOnLast(playerId: string | null) {
    const target = lastTouched()
    if (!target) return
    mutate(() => {
      target.scoredByPlayerId = playerId
    })
  }

  /**
   * `M` opens a break; the next `M` closes it. Only one can be open at a time,
   * so the keypress is unambiguous whatever the state.
   */
  function toggleBreak(atSeconds: number) {
    const open = breaks.value.find(b => b.endsAtSeconds === null)
    mutate(() => {
      if (open) open.endsAtSeconds = Math.max(open.startsAtSeconds, atSeconds)
      else {
        breaks.value.push({
          idx: breaks.value.length,
          startsAtSeconds: atSeconds,
          endsAtSeconds: null,
        })
      }
    })
  }

  function deleteBreak(idx: number) {
    mutate(() => {
      breaks.value.splice(idx, 1)
    })
  }

  const openBreak = computed(() =>
    breaks.value.find(b => b.endsAtSeconds === null) ?? null,
  )

  function flipWinner(idx: number) {
    const r = rallies.value[idx]
    if (!r || r.isLet) return
    mutate(() => {
      r.winnerSide = r.winnerSide === 1 ? 2 : 1
    })
  }

  function toggleLet(idx: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      if (r.isLet) {
        r.isLet = false
        r.winnerSide = 1
      }
      else {
        r.isLet = true
        r.winnerSide = null
      }
    })
  }

  function toggleHighlight(idx: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      r.isHighlight = !r.isHighlight
    })
  }

  function setTimestamp(idx: number, seconds: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      r.endedAtSeconds = Math.max(0, seconds)
    })
  }

  function setScorer(idx: number, playerId: string | null) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      r.scoredByPlayerId = playerId
    })
  }

  function deleteRally(idx: number) {
    mutate(() => {
      rallies.value.splice(idx, 1)
    })
  }

  function insertBefore(idx: number, winnerSide: Side, endedAtSeconds: number) {
    mutate(() => {
      rallies.value.splice(idx, 0, {
        idx,
        winnerSide,
        isLet: false,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(clone(rallies.value, breaks.value))
    rallies.value = previous.rallies
    breaks.value = previous.breaks
    scheduleSave()
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(clone(rallies.value, breaks.value))
    rallies.value = next.rallies
    breaks.value = next.breaks
    scheduleSave()
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    rallies,
    breaks,
    openBreak,
    derived,
    saveState,
    saveError,
    dirty,
    canUndo,
    canRedo,
    addRally,
    addLet,
    toggleHighlightOnLast,
    setScorerOnLast,
    flipWinner,
    toggleLet,
    toggleHighlight,
    setTimestamp,
    setScorer,
    deleteRally,
    insertBefore,
    toggleBreak,
    deleteBreak,
    undo,
    redo,
    saveNow,
  }
}
