/**
 * The tagging keyboard, as data.
 *
 * Every binding is editable and lives in localStorage, so the layout follows
 * the person rather than the source file. Defaults reproduce what the tool
 * shipped with.
 *
 * A binding records how it wants to be matched, decided when it is captured:
 *
 * - `key` — the character the keyboard produced. Right for letters: on AZERTY
 *   the A key reports `code: 'KeyQ'`, so matching on code would put "point for
 *   us" under Q.
 * - `code` — the physical position. Right for keys that produce nothing
 *   printable (Space, arrows) and for the digit row, which on AZERTY produces
 *   & é " ' rather than 1 2 3 4.
 *
 * An action can hold several bindings, which is how the digits answer to both
 * the number row and the numpad out of the box. Rebinding replaces the lot
 * with the single key that was pressed — what you press is what you get.
 */

export type KeybindActionId =
  | 'pointUs' | 'pointThem' | 'let' | 'highlight' | 'break'
  | 'playPause' | 'seekBack' | 'seekForward' | 'volumeUp' | 'volumeDown'
  | 'fullscreen' | 'toggleScoreboard' | 'scoreboardSize' | 'toggleTimeline'
  | 'scorer1' | 'scorer2' | 'scorer3' | 'scorer4'
  | 'undo' | 'redo' | 'save'

export interface Binding {
  matchOn: 'key' | 'code'
  /** Lowercased `event.key` as produced when the binding was made. */
  key: string
  code: string
  ctrl?: boolean
}

export interface KeybindAction {
  id: KeybindActionId
  label: string
  group: 'Scoring' | 'Playback' | 'Display' | 'Session'
  /** Works on the public match page too, not only in the tagger. */
  player?: boolean
}

export const KEYBIND_ACTIONS: KeybindAction[] = [
  { id: 'pointUs', label: 'Point for us', group: 'Scoring' },
  { id: 'pointThem', label: 'Point for them', group: 'Scoring' },
  { id: 'let', label: 'Let (rally replayed)', group: 'Scoring' },
  { id: 'highlight', label: 'Highlight last point', group: 'Scoring' },
  { id: 'break', label: 'Start / end a break', group: 'Scoring' },
  { id: 'scorer1', label: 'Scorer: slot 1', group: 'Scoring' },
  { id: 'scorer2', label: 'Scorer: slot 2', group: 'Scoring' },
  { id: 'scorer3', label: 'Scorer: slot 3', group: 'Scoring' },
  { id: 'scorer4', label: 'Scorer: slot 4', group: 'Scoring' },
  { id: 'playPause', label: 'Play / pause', group: 'Playback', player: true },
  { id: 'seekBack', label: 'Back 5 seconds', group: 'Playback', player: true },
  { id: 'seekForward', label: 'Forward 5 seconds', group: 'Playback', player: true },
  { id: 'volumeUp', label: 'Volume up', group: 'Playback', player: true },
  { id: 'volumeDown', label: 'Volume down', group: 'Playback', player: true },
  { id: 'fullscreen', label: 'Fullscreen', group: 'Display', player: true },
  { id: 'toggleScoreboard', label: 'Show / hide scoreboard', group: 'Display', player: true },
  { id: 'scoreboardSize', label: 'Maximise / minimise scoreboard', group: 'Display', player: true },
  { id: 'toggleTimeline', label: 'Show / hide the timeline', group: 'Display', player: true },
  { id: 'undo', label: 'Undo', group: 'Session' },
  { id: 'redo', label: 'Redo', group: 'Session' },
  // Tagging saves itself; this only skips the debounce for the impatient.
  { id: 'save', label: 'Save immediately', group: 'Session' },
]

const letter = (key: string, code: string, ctrl = false): Binding =>
  ({ matchOn: 'key', key, code, ctrl })
const physical = (code: string, key: string): Binding =>
  ({ matchOn: 'code', key, code })

/** Digit row and numpad both, since either hand should work. */
const digit = (n: number): Binding[] =>
  [physical(`Digit${n}`, String(n)), physical(`Numpad${n}`, String(n))]

export const DEFAULT_BINDINGS: Record<KeybindActionId, Binding[]> = {
  pointUs: [letter('a', 'KeyA')],
  pointThem: [letter('z', 'KeyZ')],
  let: [letter('r', 'KeyR')],
  // H and B, not P and M: those two now drive the scoreboard on every player,
  // public page included, and a shortcut cannot mean one thing here and
  // another there without becoming a trap during a long tagging session.
  highlight: [letter('h', 'KeyH')],
  break: [letter('b', 'KeyB')],
  scorer1: digit(1),
  scorer2: digit(2),
  scorer3: digit(3),
  scorer4: digit(4),
  playPause: [physical('Space', ' ')],
  seekBack: [physical('ArrowLeft', 'arrowleft')],
  seekForward: [physical('ArrowRight', 'arrowright')],
  volumeUp: [physical('ArrowUp', 'arrowup')],
  volumeDown: [physical('ArrowDown', 'arrowdown')],
  fullscreen: [letter('f', 'KeyF')],
  toggleScoreboard: [letter('p', 'KeyP')],
  scoreboardSize: [letter('m', 'KeyM')],
  toggleTimeline: [letter('t', 'KeyT')],
  undo: [letter('z', 'KeyZ', true)],
  redo: [letter('y', 'KeyY', true)],
  save: [letter('s', 'KeyS', true)],
}

/**
 * v2 because P and M changed hands. Overrides are stored per action, so a
 * sheet saved under v1 could still hold P for "highlight" and quietly fight
 * the scoreboard for it. Starting a new key drops those rather than merging
 * a conflict nobody asked for.
 */
const STORAGE_KEY = 'ust-tagging-keybinds-v2'

/** The subset every player understands, in the order the cheat sheet reads. */
export const PLAYER_ACTIONS: KeybindActionId[] = [
  'fullscreen',
  'seekBack',
  'seekForward',
  'volumeUp',
  'volumeDown',
  'playPause',
  'toggleScoreboard',
  'scoreboardSize',
  'toggleTimeline',
]

const PRETTY_CODE: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: '↵',
  Escape: 'Esc',
  Backspace: '⌫',
  Tab: '⇥',
}

/** How a binding reads on the cheat sheet. */
export function bindingLabel(binding: Binding): string {
  const base = binding.matchOn === 'code'
    ? PRETTY_CODE[binding.code]
      ?? binding.code.replace(/^Digit/, '').replace(/^Numpad/, 'num ').replace(/^Key/, '')
    : binding.key === ' ' ? 'Space' : binding.key.toUpperCase()
  return binding.ctrl ? `Ctrl+${base}` : base
}

function matches(binding: Binding, event: KeyboardEvent): boolean {
  const held = event.ctrlKey || event.metaKey
  if (held !== Boolean(binding.ctrl)) return false
  return binding.matchOn === 'code'
    ? event.code === binding.code
    : event.key.toLowerCase() === binding.key
}

/**
 * Turns a keypress into a binding. Modifier-only presses return null, so
 * holding Ctrl on the way to Ctrl+S never lands as a binding of its own.
 */
export function bindingFromEvent(event: KeyboardEvent): Binding | null {
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) return null

  const ctrl = event.ctrlKey || event.metaKey
  // A single printable character is what the user sees on the keycap; anything
  // longer ('Space', 'ArrowLeft', 'F5') only has meaning as a position.
  const printable = event.key.length === 1 && event.key !== ' '
  return printable
    ? { matchOn: 'key', key: event.key.toLowerCase(), code: event.code, ctrl }
    : { matchOn: 'code', key: event.key.toLowerCase(), code: event.code, ctrl }
}

export function useKeybinds() {
  const bindings = useState<Record<KeybindActionId, Binding[]>>(
    'tagging-keybinds',
    () => structuredClone(DEFAULT_BINDINGS),
  )
  const loaded = useState('tagging-keybinds-loaded', () => false)

  /**
   * Only overrides are stored, so an action added to the defaults later still
   * arrives with a key rather than none.
   */
  function load() {
    if (loaded.value || !import.meta.client) return
    loaded.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as Partial<Record<KeybindActionId, Binding[]>>
      const next = structuredClone(DEFAULT_BINDINGS)
      for (const action of KEYBIND_ACTIONS) {
        const override = stored[action.id]
        if (Array.isArray(override)) next[action.id] = override
      }
      bindings.value = next
    }
    catch {
      // Corrupt or unreadable storage is not worth a broken tagger.
    }
  }

  function persist() {
    if (!import.meta.client) return
    const overrides: Partial<Record<KeybindActionId, Binding[]>> = {}
    for (const action of KEYBIND_ACTIONS) {
      const mine = bindings.value[action.id]
      if (JSON.stringify(mine) !== JSON.stringify(DEFAULT_BINDINGS[action.id])) {
        overrides[action.id] = mine
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
    }
    catch {
      // Private-mode storage failures are silent; the session still works.
    }
  }

  /** The action this keypress triggers, or null. */
  function actionFor(event: KeyboardEvent): KeybindActionId | null {
    for (const action of KEYBIND_ACTIONS) {
      if (bindings.value[action.id]?.some(b => matches(b, event))) return action.id
    }
    return null
  }

  /**
   * Assigns a keypress to an action, taking the key off whoever held it.
   * Returns the actions that lost a binding, so the UI can say so instead of
   * leaving a silently dead key.
   *
   * `at` replaces one of the action's existing keys; leaving it out appends,
   * which is how an action ends up answering to two keys.
   */
  function rebind(id: KeybindActionId, event: KeyboardEvent, at?: number): KeybindActionId[] {
    const binding = bindingFromEvent(event)
    if (!binding) return []

    const takenFrom: KeybindActionId[] = []
    const next = { ...bindings.value }
    for (const action of KEYBIND_ACTIONS) {
      const own = action.id === id
      const kept = (next[action.id] ?? []).filter((b, i) =>
        // Within the action being edited, only the slot under the cursor gives
        // way; a duplicate elsewhere in its own list is still a conflict.
        !matches(b, event) || (own && i === at),
      )
      if (kept.length !== (next[action.id] ?? []).length) {
        if (!own) takenFrom.push(action.id)
        next[action.id] = kept
      }
    }

    const list = [...(next[id] ?? [])]
    if (at !== undefined && at < list.length) list[at] = binding
    else list.push(binding)
    next[id] = list

    bindings.value = next
    persist()
    return takenFrom
  }

  /** Drops one key from an action. The last one can go: unbound is a choice. */
  function unbind(id: KeybindActionId, at: number) {
    bindings.value = {
      ...bindings.value,
      [id]: (bindings.value[id] ?? []).filter((_, i) => i !== at),
    }
    persist()
  }

  /** Restores one action, or the whole sheet. */
  function reset(id?: KeybindActionId) {
    bindings.value = id
      ? { ...bindings.value, [id]: structuredClone(DEFAULT_BINDINGS[id]) }
      : structuredClone(DEFAULT_BINDINGS)
    persist()
  }

  const isDefault = computed(() =>
    KEYBIND_ACTIONS.every(a =>
      JSON.stringify(bindings.value[a.id]) === JSON.stringify(DEFAULT_BINDINGS[a.id]),
    ),
  )

  onMounted(load)

  return { bindings, actionFor, rebind, unbind, reset, isDefault }
}
