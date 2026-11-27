<script setup lang="ts">
/**
 * A long job's bar (download, render): thick enough to read across the room,
 * a light running through the fill while it works, the percentage and what
 * the job says it is doing on one line under it.
 */
const props = defineProps<{ value: number | null, label?: string }>()
const pct = computed(() => Math.round(Math.min(1, Math.max(0, props.value ?? 0)) * 100))
</script>

<template>
  <div role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" :aria-label="label || 'Progress'">
    <div class="relative h-2.5 overflow-hidden rounded-full border border-line bg-bg-deep">
      <div
        class="progress-fill relative h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width] duration-500 ease-brand"
        :style="{ width: `${Math.max(pct, 2)}%`, boxShadow: 'var(--ui-glow-soft)' }"
      />
    </div>
    <p class="mt-1.5 flex items-center justify-between gap-3 text-[0.6875rem] text-ink-subtle">
      <span class="truncate">{{ label }}</span>
      <span class="shrink-0 font-mono tabular-nums text-ink">{{ pct }}%</span>
    </p>
  </div>
</template>

<style scoped>
.progress-fill::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgb(255 255 255 / 0.45) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: progress-shine 1.4s linear infinite;
}
@keyframes progress-shine {
  from { background-position: 150% 0; }
  to { background-position: -50% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .progress-fill::after { animation: none; }
}
</style>
