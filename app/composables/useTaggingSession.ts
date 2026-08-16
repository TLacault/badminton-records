import type { Database } from '~/types/database.types'
import type { BreakInput, MatchConfig, RallyInput, Side } from '~~/shared/badminton'
import { clampBreak, clampBreaks, deriveMatch, insertPositionFor, MIN_BREAK_SECONDS } from '~~/shared/badminton'

const UNDO_LIMIT = 100
// Short enough to feel immediate, long enough that a burst of keystrokes
// during a rally is one write rather than six. There is no save button any
// more, so this is the only thing standing between a tag and the database.
const SAVE_DEBOUNCE_MS = 400

interface Snapshot {
  rallies: RallyInput[]
  breaks: BreakInput[]
}

/** What the list should flash: the row a mutation just put there. */
export interface Inserted {
  kind: 'rally' | 'break'
  idx: number
  /** Bumped on every insert, so flashing the same row twice still fires. */
  seq: number
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
  const lastInserted = ref<Inserted | null>(null)
  let insertSeq = 0

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

  /**
   * Put every break back inside a rally gap after the log moved under them.
   *
   * A point inserted, retimed or deleted moves the boundaries breaks were
   * tagged against. Left alone, a break that now straddles a rally end paints
   * over the point on the timeline, swallows it in `resumeTimeAt` and cuts it
   * out of the highlights — which is exactly what makes a point tagged inside a
   * break look like it was never recorded.
   *
   * Called from inside `mutate`, so the repair shares the point's undo entry:
   * one press, one undo.
   */
  function repairBreaks() {
    breaks.value = clampBreaks(rallies.value, breaks.value)
  }

  function insertRally(rally: Omit<RallyInput, 'idx'>) {
    const at = insertPositionFor(rallies.value, rally.endedAtSeconds)
    mutate(() => {
      rallies.value.splice(at, 0, { idx: at, ...rally })
      repairBreaks()
    })
    lastInserted.value = { kind: 'rally', idx: at, seq: ++insertSeq }
  }

  function addRally(winnerSide: Side, endedAtSeconds: number) {
    insertRally({
      winnerSide,
      isLet: false,
      isHighlight: false,
      scoredByPlayerId: null,
      endedAtSeconds,
    })
  }

  function addLet(endedAtSeconds: number) {
    insertRally({
      winnerSide: null,
      isLet: true,
      isHighlight: false,
      scoredByPlayerId: null,
      endedAtSeconds,
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
   * The open break this press should close, if any.
   *
   * Only one that `atSeconds` could plausibly still be inside: it has to start
   * before the press, with no point recorded in between. Adopting any open
   * break anywhere in the video — which is what this used to do — meant that
   * re-editing a match carrying a stale open break from 0:30 turned one press
   * at 3:44 into a three-minute pause swallowing everything tagged since.
   */
  function openBreakFor(atSeconds: number) {
    const candidate = breaks.value.find(
      b => b.endsAtSeconds === null && b.startsAtSeconds < atSeconds,
    )
    if (!candidate) return null
    const played = rallies.value.some(
      r => r.endedAtSeconds > candidate.startsAtSeconds && r.endedAtSeconds < atSeconds,
    )
    return played ? null : candidate
  }

  /**
   * One press, as play resumes: this marks where a break ENDED.
   *
   * The start needs no keypress of its own — dead time runs from wherever play
   * last stopped, and the tagger already knows when that was. Asking for two
   * presses meant tagging the start before the pause, at the one moment nobody
   * is watching for it, and a forgotten first press left the log lying.
   *
   * That derived start is right while tagging forwards and right again when
   * patching a region already tagged, since `lastStopBefore` is the end of the
   * point before the press either way. When the pause actually began later than
   * the previous point ended, the start is typed into the row.
   *
   * A break already left open — by older data, tagged when it took two presses
   * — is closed here instead, so it can still be finished.
   */
  function endBreak(atSeconds: number) {
    const open = openBreakFor(atSeconds)
    const startsAtSeconds = open ? open.startsAtSeconds : lastStopBefore(atSeconds)
    if (atSeconds - startsAtSeconds < MIN_BREAK_SECONDS) return

    // Breaks stay in video order, like the rally log: `mutate` renumbers from
    // position, and the timeline draws them in the order it is given.
    const at = open
      ? breaks.value.indexOf(open)
      : breaks.value.findIndex(b => b.startsAtSeconds > startsAtSeconds)
    const position = at === -1 ? breaks.value.length : at

    mutate(() => {
      if (open) open.endsAtSeconds = atSeconds
      else breaks.value.splice(position, 0, { idx: 0, startsAtSeconds, endsAtSeconds: atSeconds })
    })
    lastInserted.value = { kind: 'break', idx: position, seq: ++insertSeq }
  }

  /**
   * Retime one edge of a break, by hand, from the list.
   *
   * The edge typed is the one that holds: the other gives way if the break
   * would otherwise cross a point, which is the same rule `repairBreaks`
   * enforces from the rally side. A break clamped down to nothing is deleted
   * rather than kept as a sliver.
   */
  function setBreakTime(idx: number, edge: 'start' | 'end', seconds: number) {
    const b = breaks.value[idx]
    if (!b) return
    const at = Math.max(0, seconds)
    const proposed: BreakInput = edge === 'start'
      ? { ...b, startsAtSeconds: at }
      : { ...b, endsAtSeconds: at }

    // A start dragged past the end (or an end pulled before the start) is not a
    // clamp the rally log can resolve — the break has simply been inverted.
    if (proposed.endsAtSeconds !== null && proposed.endsAtSeconds <= proposed.startsAtSeconds) return

    const clamped = clampBreak(rallies.value, proposed, edge)
    mutate(() => {
      if (!clamped) {
        breaks.value.splice(idx, 1)
        return
      }
      breaks.value.splice(idx, 1, clamped)
      breaks.value.sort((x, y) => x.startsAtSeconds - y.startsAtSeconds)
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
   *
   * Moving a point moves the gap boundaries the breaks around it were tagged
   * against, so they are put back inside a gap in the same step.
   */
  function setTimestamp(idx: number, seconds: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      r.endedAtSeconds = Math.max(0, seconds)
      rallies.value.sort((a, b) => a.endedAtSeconds - b.endedAtSeconds)
      repairBreaks()
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
    lastInserted,
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
    endBreak,
    setBreakTime,
    deleteBreak,
    undo,
    redo,
    saveNow,
  }
}
