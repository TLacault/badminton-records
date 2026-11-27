import type { Ref } from 'vue'

/**
 * Undo / redo over a plain-data ref, by snapshots: every change to `source`
 * is one step, whatever made it. `reset` puts `blank()` back, as a step that
 * can itself be undone.
 * ponytail: typing in a field records one step per keystroke; group them if that gets tedious.
 */
export function useSnapshotHistory<T>(source: Ref<T>, blank: () => T, limit = 60) {
  const past = ref<string[]>([])
  const future = ref<string[]>([])
  let last = JSON.stringify(source.value)
  let applying = false

  watch(source, () => {
    const now = JSON.stringify(source.value)
    if (now === last) return
    if (!applying) {
      past.value = [...past.value, last].slice(-limit)
      future.value = []
    }
    applying = false
    last = now
  }, { deep: true })

  function apply(snapshot: string) {
    applying = true
    source.value = JSON.parse(snapshot) as T
  }

  function undo() {
    const previous = past.value.at(-1)
    if (previous === undefined) return
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, JSON.stringify(source.value)]
    apply(previous)
  }

  function redo() {
    const next = future.value.at(-1)
    if (next === undefined) return
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, JSON.stringify(source.value)]
    apply(next)
  }

  function reset() {
    source.value = blank()
  }

  return {
    undo,
    redo,
    reset,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
  }
}
