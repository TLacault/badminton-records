import type { Database } from '~/types/database.types'
import type { MatchConfig, RallyInput, Side } from '~~/shared/badminton'
import { deriveMatch } from '~~/shared/badminton'

const UNDO_LIMIT = 100
const SAVE_DEBOUNCE_MS = 1500

function clone(rallies: RallyInput[]): RallyInput[] {
  return rallies.map(r => ({ ...r }))
}

export function useTaggingSession(
  matchId: string,
  config: Ref<MatchConfig>,
  initial: RallyInput[],
) {
  const client = useSupabaseClient<Database>()

  const rallies = ref<RallyInput[]>(clone(initial))
  const undoStack = ref<RallyInput[][]>([])
  const redoStack = ref<RallyInput[][]>([])
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
    saveState.value = 'saved'
    saveError.value = null
    dirty.value = false
  }

  /** Snapshot for undo, apply the mutation, renumber, then queue a save. */
  function mutate(fn: () => void) {
    undoStack.value.push(clone(rallies.value))
    if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
    redoStack.value = []
    fn()
    rallies.value.forEach((r, i) => {
      r.idx = i
    })
    scheduleSave()
  }

  function addRally(winnerSide: Side, endedAtSeconds: number) {
    mutate(() => {
      rallies.value.push({
        idx: rallies.value.length,
        winnerSide,
        isLet: false,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
  }

  function addLet(endedAtSeconds: number) {
    mutate(() => {
      rallies.value.push({
        idx: rallies.value.length,
        winnerSide: null,
        isLet: true,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
  }

  function toggleHighlightOnLast() {
    const last = rallies.value.at(-1)
    if (!last) return
    mutate(() => {
      last.isHighlight = !last.isHighlight
    })
  }

  function setScorerOnLast(playerId: string | null) {
    const last = rallies.value.at(-1)
    if (!last) return
    mutate(() => {
      last.scoredByPlayerId = playerId
    })
  }

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
    redoStack.value.push(clone(rallies.value))
    rallies.value = previous
    scheduleSave()
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(clone(rallies.value))
    rallies.value = next
    scheduleSave()
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    rallies,
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
    undo,
    redo,
    saveNow,
  }
}
