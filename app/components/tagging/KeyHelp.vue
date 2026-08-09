<script setup lang="ts">
import { Check, Minus, Pause, Star, X } from '@lucide/vue'
</script>

<template>
  <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-slate-400">
    <dt class="font-mono text-slate-200">
      A
    </dt>
    <dd class="flex items-center gap-1.5">
      <Check :size="12" class="text-emerald-400" /> point for us
    </dd>
    <dt class="font-mono text-slate-200">
      Z
    </dt>
    <dd class="flex items-center gap-1.5">
      <X :size="12" class="text-red-400" /> point for them
    </dd>
    <dt class="font-mono text-slate-200">
      R
    </dt>
    <dd class="flex items-center gap-1.5">
      <Minus :size="12" class="text-slate-600" /> let (rally replayed)
    </dd>
    <dt class="font-mono text-slate-200">
      P
    </dt>
    <dd class="flex items-center gap-1.5">
      <Star :size="12" class="text-amber-400" /> highlight last point
    </dd>
    <dt class="font-mono text-slate-200">
      M
    </dt>
    <dd class="flex items-center gap-1.5">
      <Pause :size="12" class="text-slate-400" /> start / end a break
    </dd>
    <dt class="font-mono text-slate-200">
      &amp; é " ' <span class="text-slate-500">or</span> num 1–4
    </dt>
    <dd>scorer = slot 1–4</dd>
    <dt class="font-mono text-slate-200">
      Ctrl+Z / Y
    </dt>
    <dd>undo / redo</dd>
    <dt class="font-mono text-slate-200">
      Space
    </dt>
    <dd>play / pause</dd>
    <dt class="font-mono text-slate-200">
      ← →
    </dt>
    <dd>seek ∓5s</dd>
  </dl>
</template>
