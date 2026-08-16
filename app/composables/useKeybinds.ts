/**
 * The keyboard, as data — the tagger's and the viewer's alike.
 *
 * Every binding is editable and lives in localStorage, so the layout follows
 * the person rather than the source file. Defaults reproduce what the tool
 * shipped with. Actions marked `player` are the ones a viewer on a match page
 * can act on, and the only ones they are shown.
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
  | 'playPause' | 'seekBack' | 'seekForward' | 'prevFrame' | 'nextFrame'
  | 'volumeUp' | 'volumeDown'
  | 'speedDown' | 'speedUp'
  | 'prevPoint' | 'nextPoint' | 'prevSet' | 'nextSet'
  | 'prevHighlight' | 'nextHighlight'
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

/**
 * A slot in an action's list. `null` is a slot with no key in it yet — shown
 * in the panel as an empty key waiting to be pressed.
 *
 * Empty slots exist so that losing a key is visible. A key belongs to one
 * action at a time, so binding it here takes it from there; the action it left
 * keeps an empty slot in its place rather than quietly ending up with nothing,
 * which is how a shortcut used to go dead without anything saying so.
 */
export type BindingSlot = Binding | null

export interface KeybindAction {
  id: KeybindActionId
  label: string
  group: 'Scoring' | 'Playback' | 'Jump to' | 'Display' | 'Session'
  /** Works on the public match page too, not only in the tagger. */
  player?: boolean
}

export const KEYBIND_ACTIONS: KeybindAction[] = [
  { id: 'pointUs', label: 'Point for us', group: 'Scoring' },
  { id: 'pointThem', label: 'Point for them', group: 'Scoring' },
  { id: 'let', label: 'Let (rally replayed)', group: 'Scoring' },
  // Both act on the point being watched — the highlighted row in the list —
  // which past the last one logged is that last one.
  { id: 'highlight', label: 'Highlight this point', group: 'Scoring' },
  { id: 'break', label: 'End a break (play resumes)', group: 'Scoring' },
  { id: 'scorer1', label: 'Scorer: slot 1', group: 'Scoring' },
  { id: 'scorer2', label: 'Scorer: slot 2', group: 'Scoring' },
  { id: 'scorer3', label: 'Scorer: slot 3', group: 'Scoring' },
  { id: 'scorer4', label: 'Scorer: slot 4', group: 'Scoring' },
  { id: 'playPause', label: 'Play / pause', group: 'Playback', player: true },
  { id: 'seekBack', label: 'Skip back', group: 'Playback', player: true },
  { id: 'seekForward', label: 'Skip forward', group: 'Playback', player: true },
  { id: 'prevFrame', label: 'Previous frame', group: 'Playback', player: true },
  { id: 'nextFrame', label: 'Next frame', group: 'Playback', player: true },
  { id: 'volumeUp', label: 'Volume up', group: 'Playback', player: true },
  { id: 'volumeDown', label: 'Volume down', group: 'Playback', player: true },
  { id: 'speedDown', label: 'Slower', group: 'Playback', player: true },
  { id: 'speedUp', label: 'Faster', group: 'Playback', player: true },
  { id: 'prevPoint', label: 'Previous point', group: 'Jump to', player: true },
  { id: 'nextPoint', label: 'Next point', group: 'Jump to', player: true },
  { id: 'prevSet', label: 'Previous set', group: 'Jump to', player: true },
  { id: 'nextSet', label: 'Next set', group: 'Jump to', player: true },
  { id: 'prevHighlight', label: 'Previous highlight', group: 'Jump to', player: true },
  { id: 'nextHighlight', label: 'Next highlight', group: 'Jump to', player: true },
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
  // Matched on the character, like the letters below: , and ; sit side by side
  // on the bottom row of an AZERTY keyboard, which is where the hand already
  // is, and they read left-then-right the way the two frames run.
  prevFrame: [letter(',', 'Comma')],
  nextFrame: [letter(';', 'Semicolon')],
  volumeUp: [physical('ArrowUp', 'arrowup')],
  volumeDown: [physical('ArrowDown', 'arrowdown')],
  // Letters, matched on the character rather than the position, so AZERTY and
  // QWERTY both get the key they can see. S/D sit together under one hand;
  // U/O, J/L and C/V are three left-right pairs for the three things worth
  // jumping between. Plain S does not collide with Ctrl+S: the modifier is
  // part of the match.
  speedDown: [letter('s', 'KeyS')],
  speedUp: [letter('d', 'KeyD')],
  prevPoint: [letter('j', 'KeyJ')],
  nextPoint: [letter('l', 'KeyL')],
  prevSet: [letter('u', 'KeyU')],
  nextSet: [letter('o', 'KeyO')],
  prevHighlight: [letter('c', 'KeyC')],
  nextHighlight: [letter('v', 'KeyV')],
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
const STORAGE_KEY = 'ust-tagging-keybinds-v3'

/**
 * The subset every player understands, in the order the panel reads.
 *
 * Derived from the `player` flag rather than listed again: the two were kept
 * by hand and had to agree, which is the kind of pair that stays right until
 * an action is added to one of them.
 */
export const PLAYER_ACTIONS: KeybindActionId[] = KEYBIND_ACTIONS
  .filter(a => a.player)
  .map(a => a.id)

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

/**
 * Keeps a row on screen. An action with nothing left holds one empty slot, so
 * a shortcut that needs a key says so rather than vanishing from the panel.
 */
function withSlot(list: BindingSlot[]): BindingSlot[] {
  return list.length ? list : [null]
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
  const bindings = useState<Record<KeybindActionId, BindingSlot[]>>(
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
      const stored = JSON.parse(raw) as Partial<Record<KeybindActionId, BindingSlot[]>>
      const next: Record<KeybindActionId, BindingSlot[]> = structuredClone(DEFAULT_BINDINGS)
      for (const action of KEYBIND_ACTIONS) {
        const override = stored[action.id]
        if (Array.isArray(override)) next[action.id] = withSlot(override)
      }
      bindings.value = next
    }
    catch {
      // Corrupt or unreadable storage is not worth a broken tagger.
    }
  }

  function persist() {
    if (!import.meta.client) return
    const overrides: Partial<Record<KeybindActionId, BindingSlot[]>> = {}
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
      if (bindings.value[action.id]?.some(b => b !== null && matches(b, event))) return action.id
    }
    return null
  }

  /**
   * Assigns a keypress to an action, taking the key off whoever held it.
   *
   * There is no warning to answer and nothing to confirm: a key means one
   * thing, so it simply moves, and the action it left is shown holding an
   * empty slot. That reads better than the notice this used to raise, which
   * named an action and then asked the reader to go and fix it themselves.
   *
   * `at` replaces one of the action's existing slots — including an empty one,
   * which is how the `+` button works; leaving it out appends.
   */
  function rebind(id: KeybindActionId, event: KeyboardEvent, at?: number) {
    const binding = bindingFromEvent(event)
    if (!binding) return

    const next = { ...bindings.value }

    // Place it first, then sweep. Stripping the old holders first would shift
    // the indices out from under `at`, which is how adding a key an action
    // already had used to leave a stray empty slot behind.
    const list = [...(next[id] ?? [])]
    if (at !== undefined && at < list.length) list[at] = binding
    else list.push(binding)
    next[id] = list

    // A key means one thing, so every other holder gives it up — the edited
    // action included, which is what stops it appearing twice in one row. The
    // slot just written is spared by identity rather than by index.
    for (const action of KEYBIND_ACTIONS) {
      next[action.id] = withSlot(
        (next[action.id] ?? []).filter(b => b === null || b === binding || !matches(b, event)),
      )
    }

    bindings.value = next
    persist()
  }

  /**
   * Opens an empty slot on an action and says where it landed, so the panel can
   * point the next keypress at it. Reuses one that is already empty rather than
   * stacking blanks up.
   */
  function addSlot(id: KeybindActionId): number {
    const list = [...(bindings.value[id] ?? [])]
    const empty = list.indexOf(null)
    if (empty !== -1) return empty

    list.push(null)
    bindings.value = { ...bindings.value, [id]: list }
    persist()
    return list.length - 1
  }

  /** Drops one key from an action, leaving an empty slot if it was the last. */
  function unbind(id: KeybindActionId, at: number) {
    bindings.value = {
      ...bindings.value,
      [id]: withSlot((bindings.value[id] ?? []).filter((_, i) => i !== at)),
    }
    persist()
  }

  /**
   * Restores one action, a named set of them, or the whole sheet.
   *
   * The set matters now that the same panel is shown to a viewer with only the
   * playback keys in front of them: "restore defaults" there must not silently
   * put back scoring keys they were never shown.
   */
  function reset(id?: KeybindActionId | KeybindActionId[]) {
    const ids = id === undefined
      ? KEYBIND_ACTIONS.map(a => a.id)
      : Array.isArray(id) ? id : [id]
    const next = { ...bindings.value }
    for (const one of ids) next[one] = structuredClone(DEFAULT_BINDINGS[one])
    bindings.value = next
    persist()
  }

  /** Whether these actions still hold the keys they shipped with. */
  function isDefaultFor(ids: KeybindActionId[]): boolean {
    return ids.every(id =>
      JSON.stringify(bindings.value[id]) === JSON.stringify(DEFAULT_BINDINGS[id]),
    )
  }

  const isDefault = computed(() => isDefaultFor(KEYBIND_ACTIONS.map(a => a.id)))

  onMounted(load)

  return { bindings, actionFor, rebind, addSlot, unbind, reset, isDefault, isDefaultFor }
}
