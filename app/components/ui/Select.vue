<script setup lang="ts" generic="T extends string | number | null">
import type { Component } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

export interface SelectOption<V> {
  value: V
  label: string
  icon?: Component
  /** Second line in the list, for anything the label cannot carry alone. */
  hint?: string
}

const props = withDefaults(
  defineProps<{
    options: SelectOption<T>[]
    label?: string
    placeholder?: string
    disabled?: boolean
    /** Matches the `field` height by default; `sm` fits a dense table row. */
    size?: 'md' | 'sm'
  }>(),
  { size: 'md', placeholder: 'Select…', disabled: false },
)

const model = defineModel<T>({ required: true })

const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
/** Keyboard cursor, which is not the selection until Enter. */
const activeIndex = ref(0)
const uid = useId()

const selected = computed(() => props.options.find(o => o.value === model.value) ?? null)

/**
 * The popup is positioned fixed rather than absolute so it can escape the
 * scroll containers it lives in — the point list scrolls, and an absolutely
 * positioned menu inside it would be clipped at the edge.
 */
const menuStyle = ref<Record<string, string>>({})

function place() {
  const el = trigger.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom
  const above = rect.top
  // Flip up only when there is genuinely more room there.
  const flip = below < 240 && above > below

  menuStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
    maxHeight: `${Math.max(140, (flip ? above : below) - 16)}px`,
    ...(flip
      ? { bottom: `${window.innerHeight - rect.top + 6}px` }
      : { top: `${rect.bottom + 6}px` }),
  }
}

async function show() {
  if (props.disabled) return
  open.value = true
  activeIndex.value = Math.max(0, props.options.findIndex(o => o.value === model.value))
  place()
  await nextTick()
  list.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}

function hide() {
  open.value = false
}

function choose(option: SelectOption<T>) {
  model.value = option.value
  hide()
  trigger.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      show()
    }
    return
  }

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      hide()
      trigger.value?.focus()
      break
    case 'ArrowDown':
      event.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % props.options.length
      break
    case 'ArrowUp':
      event.preventDefault()
      activeIndex.value = (activeIndex.value - 1 + props.options.length) % props.options.length
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = 0
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = props.options.length - 1
      break
    case 'Enter':
    case ' ': {
      event.preventDefault()
      const option = props.options[activeIndex.value]
      if (option) choose(option)
      break
    }
    case 'Tab':
      hide()
      break
  }

  if (open.value) {
    nextTick(() => {
      list.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
    })
  }
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (trigger.value?.contains(target) || list.value?.contains(target)) return
  hide()
}

// Capture phase, so a menu inside a scrolling panel follows its trigger rather
// than floating away from it.
function onScrollOrResize() {
  if (open.value) place()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <div class="relative">
    <button
      ref="trigger"
      type="button"
      class="field flex items-center gap-2 text-left"
      :class="[
        size === 'sm' ? '!min-h-9 !py-1 !text-sm' : '',
        open ? 'border-accent' : '',
      ]"
      :style="open ? 'box-shadow: 0 0 0 3px var(--ui-accent-soft)' : undefined"
      :disabled="disabled"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="`${uid}-list`"
      :aria-label="label"
      @click="open ? hide() : show()"
      @keydown="onKeydown"
    >
      <component
        :is="selected.icon"
        v-if="selected?.icon"
        :size="15"
        class="shrink-0 text-accent"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate" :class="selected ? 'text-ink' : 'text-ink-subtle'">
        {{ selected?.label ?? placeholder }}
      </span>
      <ChevronDown
        :size="14"
        class="shrink-0 text-ink-subtle transition-transform duration-200"
        :class="open ? 'rotate-180 text-accent' : ''"
        aria-hidden="true"
      />
    </button>

    <!--
      Teleported so the menu is never clipped by an ancestor's overflow, and
      never trapped under a sticky header's stacking context.
    -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-brand"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition duration-100"
        leave-to-class="opacity-0"
      >
        <ul
          v-if="open"
          :id="`${uid}-list`"
          ref="list"
          role="listbox"
          :aria-label="label"
          class="z-[100] overflow-y-auto overflow-x-hidden rounded-xl p-1 glass-strong"
          style="box-shadow: var(--ui-glow-soft), var(--ui-shadow)"
          :style="menuStyle"
          @keydown="onKeydown"
        >
          <li
            v-for="(option, i) in options"
            :key="String(option.value)"
            role="option"
            :aria-selected="option.value === model"
            :data-active="i === activeIndex"
            class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors duration-100"
            :class="[
              option.value === model ? 'text-accent' : 'text-ink-muted',
              i === activeIndex ? 'bg-accent-soft text-accent' : '',
            ]"
            @pointerenter="activeIndex = i"
            @click="choose(option)"
          >
            <component
              :is="option.icon"
              v-if="option.icon"
              :size="15"
              class="shrink-0"
              :class="option.value === model || i === activeIndex ? 'text-accent' : 'text-ink-subtle'"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ option.label }}</span>
              <span v-if="option.hint" class="block truncate text-xs text-ink-subtle">{{ option.hint }}</span>
            </span>
            <Check
              v-if="option.value === model"
              :size="14"
              class="shrink-0 text-accent"
              aria-hidden="true"
            />
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
