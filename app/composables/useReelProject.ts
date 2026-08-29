import type { ReelClip, ReelProject } from '~~/shared/reel'
import { emptyProject, parseProject, projectFileName } from '~~/shared/reel'

/** The custom extension. Plain JSON inside, so it diffs and it opens. */
export const REEL_EXTENSION = 'reel'

const STORAGE_KEY = 'ust-reel-project-v1'
const HISTORY_LIMIT = 40

/**
 * The project being edited: one object, held for the session, written to
 * localStorage as it changes and to a `.reel` file when asked.
 *
 * `.reel` is JSON with a name on it. The alternative was CSV, which cannot
 * hold a nested music window or per-clip effects without inventing a second
 * format inside the first, and the alternative to that was a binary blob
 * nobody could open in an editor to see what their reel actually says.
 *
 * Every change goes through `edit`, which is what makes undo a snapshot stack
 * rather than a set of inverse operations — a trim, a reorder and a grade all
 * undo the same way, and a new control added later gets undo for free.
 */
export function useReelProject() {
  const project = useState<ReelProject>('reel-project', () => emptyProject())
  const history = useState<string[]>('reel-history', () => [])
  const restored = useState('reel-restored', () => false)

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project.value))
    }
    catch {
      // Private mode, or a project bigger than the quota. The session still
      // holds it, and the file save is the real durability story.
    }
  }

  onMounted(() => {
    if (restored.value) return
    restored.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) project.value = parseProject(raw)
    }
    catch {
      // A corrupt draft is not worth a broken editor; start clean.
    }
  })

  /** Runs a mutation, having first taken a snapshot to come back to. */
  function edit(change: (draft: ReelProject) => void) {
    history.value = [...history.value, JSON.stringify(project.value)].slice(-HISTORY_LIMIT)
    const draft = JSON.parse(JSON.stringify(project.value)) as ReelProject
    change(draft)
    project.value = draft
    persist()
  }

  const canUndo = computed(() => history.value.length > 0)

  function undo() {
    const previous = history.value.at(-1)
    if (!previous) return
    history.value = history.value.slice(0, -1)
    project.value = JSON.parse(previous) as ReelProject
    persist()
  }

  // ── Clips ────────────────────────────────────────────────────────────────

  function addClips(clips: ReelClip[], { replace = false } = {}) {
    edit((draft) => {
      draft.clips = replace ? clips : [...draft.clips, ...clips]
    })
  }

  function updateClip(id: string, patch: Partial<ReelClip>) {
    edit((draft) => {
      const clip = draft.clips.find(c => c.id === id)
      if (clip) Object.assign(clip, patch)
    })
  }

  function removeClip(id: string) {
    edit((draft) => {
      draft.clips = draft.clips.filter(c => c.id !== id)
    })
  }

  /** Moves a clip by `delta` places, clamped rather than wrapped. */
  function moveClip(id: string, delta: number) {
    edit((draft) => {
      const at = draft.clips.findIndex(c => c.id === id)
      if (at === -1) return
      const to = Math.min(draft.clips.length - 1, Math.max(0, at + delta))
      if (to === at) return
      const [clip] = draft.clips.splice(at, 1)
      draft.clips.splice(to, 0, clip!)
    })
  }

  /** Back into match order — the order a reel is usually meant to be in. */
  function sortClips() {
    edit((draft) => {
      draft.clips = [...draft.clips].sort((a, b) => a.from - b.from)
    })
  }

  function patch(change: Partial<ReelProject>) {
    edit((draft) => Object.assign(draft, change))
  }

  // ── The file ─────────────────────────────────────────────────────────────

  function download() {
    const blob = new Blob([JSON.stringify(project.value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = projectFileName(project.value, REEL_EXTENSION)
    link.click()
    // Revoked on the next frame: revoking synchronously races the click on
    // Firefox, which has not finished reading the blob yet.
    requestAnimationFrame(() => URL.revokeObjectURL(url))
  }

  async function openFile(file: File) {
    const opened = parseProject(await file.text())
    history.value = [...history.value, JSON.stringify(project.value)].slice(-HISTORY_LIMIT)
    project.value = opened
    persist()
    return opened
  }

  function reset() {
    edit((draft) => {
      Object.assign(draft, emptyProject())
    })
  }

  return {
    project,
    edit,
    patch,
    undo,
    canUndo,
    addClips,
    updateClip,
    removeClip,
    moveClip,
    sortClips,
    download,
    openFile,
    reset,
  }
}
