<script setup lang="ts">
import type { KeybindActionId } from '~/composables/useKeybinds'
import { ChevronDown, Keyboard, Plus, RotateCcw, X } from '@lucide/vue'
import { bindingLabel, KEYBIND_ACTIONS, PLAYER_ACTIONS } from '~/composables/useKeybinds'

/**
 * The one keyboard panel, for both audiences.
 *
 * There used to be two: this one under the tagger, and a read-only sheet drawn
 * inside the player behind a `?`. They listed the same keys and only one of
 * them could change anything — and the sheet's `?` was a binding of its own,
 * living outside the keybind system it was describing, so rebinding an action
 * onto `?` fired both. One editable panel, scoped to its reader, replaces them.
 */
const props = withDefaults(
  defineProps<{
    /**
     * `player` shows only what a viewer can act on. Scoring and session keys
     * belong to the tagger, and a match page is not the place to learn them.
     */
    scope?: 'all' | 'player'
  }>(),
  { scope: 'all' },
)

const { bindings, rebind, addSlot, unbind, reset, isDefaultFor } = useKeybinds()

const open = ref(false)

/** The slot waiting for a keypress: an action, and which of its keys. */
const capturing = ref<{ id: KeybindActionId, at: number } | null>(null)

/** In player scope, PLAYER_ACTIONS also fixes the order the rows read in. */
const shown = computed<KeybindActionId[]>(() =>
  props.scope === 'player' ? PLAYER_ACTIONS : KEYBIND_ACTIONS.map(a => a.id),
)

const groups = computed(() => {
  const order = ['Scoring', 'Playback', 'Jump to', 'Display', 'Session'] as const
  return order
    .map(name => ({
      name,
      actions: shown.value
        .map(id => KEYBIND_ACTIONS.find(a => a.id === id)!)
        .filter(a => a.group === name),
    }))
    .filter(group => group.actions.length)
})

function isCapturing(id: KeybindActionId, at: number): boolean {
  return capturing.value?.id === id && capturing.value.at === at
}

function startCapture(id: KeybindActionId, at: number) {
  capturing.value = isCapturing(id, at) ? null : { id, at }
}

/**
 * `+` opens an empty slot and aims the next keypress at it. The slot appears
 * straight away rather than only once a key lands, so the button visibly does
 * something even if the press that follows is a key already in use — which,
 * before, took the key from elsewhere and left this row looking untouched.
 */
function addAndCapture(id: KeybindActionId) {
  capturing.value = { id, at: addSlot(id) }
}

/**
 * Capture runs on the window in the capture phase, ahead of the tagging
 * handler: while a slot is armed, the next keypress is a binding and must not
 * also score a point.
 */
function onCapture(event: KeyboardEvent) {
  const target = capturing.value
  if (!target) return

  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    capturing.value = null
    return
  }
  // Modifier-only presses are the way to Ctrl+S, not a binding of their own.
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) return

  rebind(target.id, event, target.at)
  capturing.value = null
}

onMounted(() => window.addEventListener('keydown', onCapture, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onCapture, true))
</script>

<template>
  <section class="overflow-hidden rounded-2xl glass">
    <h2>
      <button
        type="button"
        data-testid="keyhelp-toggle"
        class="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        :aria-expanded="open"
        aria-controls="keyhelp-body"
        @click="open = !open"
      >
        <Keyboard :size="15" class="shrink-0 text-accent" aria-hidden="true" />
        <span class="label !text-ink">Keyboard</span>
        <span class="ml-auto text-xs text-ink-subtle">
          {{ open ? 'Click a key to rebind' : `${shown.length} shortcuts` }}
        </span>
        <ChevronDown
          :size="15"
          class="shrink-0 text-ink-subtle transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </h2>

    <div v-show="open" id="keyhelp-body" class="border-t border-line px-4 pb-4 pt-3">
      <div v-for="group in groups" :key="group.name" class="mt-3 first:mt-0">
        <p class="label text-[0.6875rem]">
          {{ group.name }}
        </p>
        <!-- Two columns: a shortcut row is a short label and a small key, and
             one per line left most of the panel empty. -->
        <ul class="mt-1.5 grid gap-x-6 sm:grid-cols-2">
          <li
            v-for="action in group.actions"
            :key="action.id"
            class="flex items-center gap-2 border-b border-line py-1.5"
          >
            <span class="min-w-0 flex-1 truncate text-xs text-ink-muted">{{ action.label }}</span>

            <span class="flex shrink-0 items-center gap-1">
              <span
                v-for="(binding, i) in bindings[action.id] ?? []"
                :key="i"
                class="group/key relative inline-flex"
              >
                <!--
                  An empty slot is drawn as a gap waiting to be filled — dashed
                  and dimmed — so a shortcut that lost its key to another one
                  is visibly missing it rather than merely absent.
                -->
                <button
                  type="button"
                  :data-testid="i === 0 ? `keybind-${action.id}` : undefined"
                  class="kbd transition-[border-color,color] duration-200 hover:border-accent/60 hover:text-accent"
                  :class="[
                    isCapturing(action.id, i) ? 'animate-pulse border-accent text-accent' : '',
                    binding ? '' : 'border-dashed text-ink-subtle',
                  ]"
                  :aria-label="isCapturing(action.id, i)
                    ? `Press a key for ${action.label}, or Escape to cancel`
                    : binding ? `Rebind ${action.label}` : `Set a key for ${action.label}`"
                  @click="startCapture(action.id, i)"
                >
                  {{ isCapturing(action.id, i) ? 'Press…' : binding ? bindingLabel(binding) : 'Set key' }}
                </button>
                <button
                  v-if="(bindings[action.id]?.length ?? 0) > 1"
                  type="button"
                  class="absolute -right-1 -top-1 hidden size-3.5 place-items-center rounded-full border border-line bg-panel-solid text-ink-subtle hover:text-accent group-hover/key:grid"
                  :aria-label="binding
                    ? `Remove ${bindingLabel(binding)} from ${action.label}`
                    : `Remove the empty key from ${action.label}`"
                  @click="unbind(action.id, i)"
                >
                  <X :size="9" aria-hidden="true" />
                </button>
              </span>

              <button
                type="button"
                :data-testid="`keybind-add-${action.id}`"
                class="grid size-5 place-items-center rounded text-ink-subtle transition-colors duration-200 hover:text-accent"
                :aria-label="`Add another key for ${action.label}`"
                :title="`Add another key for ${action.label}`"
                @click="addAndCapture(action.id)"
              >
                <Plus :size="12" aria-hidden="true" />
              </button>
            </span>
          </li>
        </ul>
      </div>

      <!-- Scoped to what is on screen: a viewer restoring "defaults" should not
           reach behind the panel and change keys they were never shown. -->
      <button
        type="button"
        data-testid="keybind-reset"
        class="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-subtle transition-colors duration-200 hover:text-accent disabled:opacity-40"
        :disabled="isDefaultFor(shown)"
        @click="reset(shown)"
      >
        <RotateCcw :size="12" aria-hidden="true" />
        Restore defaults
      </button>
    </div>
  </section>
</template>
