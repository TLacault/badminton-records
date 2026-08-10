<script setup lang="ts">
import type { KeybindActionId } from '~/composables/useKeybinds'
import { ChevronDown, Keyboard, Plus, RotateCcw, X } from '@lucide/vue'
import { bindingLabel, KEYBIND_ACTIONS } from '~/composables/useKeybinds'

const { bindings, rebind, unbind, reset, isDefault } = useKeybinds()

const open = ref(false)

/**
 * The slot waiting for a keypress: an action, and which of its keys is being
 * replaced. `at: null` means the next press is added alongside the existing
 * ones rather than replacing any of them.
 */
const capturing = ref<{ id: KeybindActionId, at: number | null } | null>(null)
const notice = ref<string | null>(null)

const groups = computed(() => {
  const order = ['Scoring', 'Playback', 'Display', 'Session'] as const
  return order.map(name => ({
    name,
    actions: KEYBIND_ACTIONS.filter(a => a.group === name),
  }))
})

function labelOf(id: KeybindActionId): string {
  return KEYBIND_ACTIONS.find(a => a.id === id)?.label ?? id
}

function isCapturing(id: KeybindActionId, at: number | null): boolean {
  return capturing.value?.id === id && capturing.value.at === at
}

function startCapture(id: KeybindActionId, at: number | null) {
  capturing.value = isCapturing(id, at) ? null : { id, at }
  notice.value = null
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

  const takenFrom = rebind(target.id, event, target.at ?? undefined)
  capturing.value = null
  notice.value = takenFrom.length
    ? `Taken from ${takenFrom.map(labelOf).join(', ')} — rebind ${takenFrom.length > 1 ? 'those' : 'that'} too.`
    : null
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
          {{ open ? 'Click a key to rebind' : `${KEYBIND_ACTIONS.length} shortcuts` }}
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
      <p
        v-if="notice"
        role="status"
        data-testid="keyhelp-notice"
        class="mb-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent"
      >
        {{ notice }}
      </p>

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
                <button
                  type="button"
                  :data-testid="i === 0 ? `keybind-${action.id}` : undefined"
                  class="kbd transition-[border-color,color] duration-200 hover:border-accent/60 hover:text-accent"
                  :class="isCapturing(action.id, i) ? 'animate-pulse border-accent text-accent' : ''"
                  :aria-label="isCapturing(action.id, i)
                    ? `Press a key for ${action.label}, or Escape to cancel`
                    : `Rebind ${action.label}`"
                  @click="startCapture(action.id, i)"
                >
                  {{ isCapturing(action.id, i) ? 'Press…' : bindingLabel(binding) }}
                </button>
                <button
                  v-if="(bindings[action.id]?.length ?? 0) > 1"
                  type="button"
                  class="absolute -right-1 -top-1 hidden size-3.5 place-items-center rounded-full border border-line bg-panel-solid text-ink-subtle hover:text-accent group-hover/key:grid"
                  :aria-label="`Remove ${bindingLabel(binding)} from ${action.label}`"
                  @click="unbind(action.id, i)"
                >
                  <X :size="9" aria-hidden="true" />
                </button>
              </span>

              <button
                type="button"
                :data-testid="`keybind-add-${action.id}`"
                class="grid size-5 place-items-center rounded text-ink-subtle transition-colors duration-200 hover:text-accent"
                :class="isCapturing(action.id, null) ? 'animate-pulse text-accent' : ''"
                :aria-label="`Add another key for ${action.label}`"
                :title="`Add another key for ${action.label}`"
                @click="startCapture(action.id, null)"
              >
                <Plus :size="12" aria-hidden="true" />
              </button>
            </span>
          </li>
        </ul>
      </div>

      <button
        type="button"
        data-testid="keybind-reset"
        class="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-subtle transition-colors duration-200 hover:text-accent disabled:opacity-40"
        :disabled="isDefault"
        @click="reset(); notice = null"
      >
        <RotateCcw :size="12" aria-hidden="true" />
        Restore defaults
      </button>
    </div>
  </section>
</template>
