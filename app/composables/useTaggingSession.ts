import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, RallyInput, Side } from '~~/shared/badminton'
import { deriveMatch, insertPositionFor } from '~~/shared/badminton'

const UNDO_LIMIT = 100
// Short enough to feel immediate, long enough that a burst of keystrokes
// during a rally is one write rather than six. There is no save button any
// more, so this is the only thing standing between a tag and the database.
const SAVE_DEBOUNCE_MS = 400
/**
 * Below this, a break is a double press rather than a pause: nobody leaves the
 * court for half a second, and the key that ends a break is easy to hit twice.
 */
const MIN_BREAK_SECONDS = 1

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
  }

  /**
   * Where play last stopped before `atSeconds`, which is where the dead time
   * running up to it began: the end of the last rally or the end of the last
   * break, whichever is later, and the start of the video if there is neither.
   */
  function lastStopBefore(atSeconds: number) {
    let stop = 0
    for (const r of rallies.value) {
      if (r.endedAtSeconds < atSeconds && r.endedAtSeconds > stop) stop = r.endedAtSeconds
    }
    for (const b of breaks.value) {
      const end = b.endsAtSeconds
      if (end !== null && end < atSeconds && end > stop) stop = end
    }
    return stop
  }

  /**
   * One press, as play resumes: this marks where a break ENDED.
   *
   * The start needs no keypress of its own — dead time runs from wherever play
   * last stopped, and the tagger already knows when that was. Asking for two
   * presses meant tagging the start before the pause, at the one moment nobody
   * is watching for it, and a forgotten first press left the log lying.
   *
   * A break already left open — by older data, tagged when it took two presses
   * — is closed here instead, so it can still be finished.
   */
  function endBreak(atSeconds: number) {
    const open = breaks.value.find(b => b.endsAtSeconds === null)
    const startsAtSeconds = open ? open.startsAtSeconds : lastStopBefore(atSeconds)
    if (atSeconds - startsAtSeconds < MIN_BREAK_SECONDS) return

    mutate(() => {
      if (open) {
        open.endsAtSeconds = atSeconds
        return
      }
      // Breaks stay in video order, like the rally log: `mutate` renumbers from
      // position, and the timeline draws them in the order it is given.
      const at = breaks.value.findIndex(b => b.startsAtSeconds > startsAtSeconds)
      breaks.value.splice(at === -1 ? breaks.value.length : at, 0, {
        idx: 0,
        startsAtSeconds,
        endsAtSeconds: atSeconds,
      })
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

  /**
   * Retime a point. Re-sorts afterwards: the log must stay in video order or
   * every score after the edit is derived from the wrong sequence. The sort is
   * stable, so points sharing a timestamp keep their relative order.
   */
  function setTimestamp(idx: number, seconds: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      r.endedAtSeconds = Math.max(0, seconds)
      rallies.value.sort((a, b) => a.endedAtSeconds - b.endedAtSeconds)
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
    flipWinner,
    toggleLet,
    toggleHighlight,
    setTimestamp,
    setScorer,
    deleteRally,
    insertBefore,
    endBreak,
    deleteBreak,
    undo,
    redo,
    saveNow,
  }
}
