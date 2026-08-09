<template>
  <!--
    Ambient light behind everything. Fixed rather than absolute so it does not
    grow the document, and aria-hidden + pointer-events-none so it is invisible
    to screen readers and to the cursor alike.

    The blobs are pure gradients: no image, no canvas, and `drift` only touches
    transform, so it composites on the GPU and never reflows.
  -->
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
    <div class="absolute inset-0 bg-bg" />

    <!-- Kept faint. These are meant to warm the corners, not to tint the page:
         at full strength every surface picks up a red cast and the accent
         colour stops standing out from its own background. -->
    <div
      class="absolute -left-[15%] -top-[20%] size-[46rem] rounded-full opacity-45 blur-[110px] animate-drift"
      style="background: radial-gradient(circle, color-mix(in oklab, var(--ui-accent) 13%, transparent) 0%, transparent 68%)"
    />
    <div
      class="absolute -right-[18%] top-[28%] size-[38rem] rounded-full opacity-40 blur-[120px] animate-drift"
      style="animation-delay: -8s; background: radial-gradient(circle, color-mix(in oklab, var(--ui-brand) 16%, transparent) 0%, transparent 70%)"
    />
    <div
      class="absolute bottom-[-25%] left-[35%] size-[42rem] rounded-full opacity-30 blur-[130px] animate-drift"
      style="animation-delay: -15s; background: radial-gradient(circle, color-mix(in oklab, var(--ui-accent) 11%, transparent) 0%, transparent 72%)"
    />

    <!-- Court lines, barely there. Gives the flat background a floor without
         reading as a grid: any more contrast and it becomes the wallpaper. -->
    <div
      class="absolute inset-0 opacity-[0.02] dark:opacity-[0.028]"
      style="
        background-image:
          linear-gradient(to right, var(--ui-ink) 1px, transparent 1px),
          linear-gradient(to bottom, var(--ui-ink) 1px, transparent 1px);
        background-size: 7rem 7rem;
        mask-image: radial-gradient(ellipse 70% 50% at 50% 0%, black 0%, transparent 70%);
      "
    />

    <!-- Vignette: pulls the eye back to the measure on very wide screens. -->
    <div
      class="absolute inset-0"
      style="background: radial-gradient(ellipse 120% 80% at 50% 40%, transparent 40%, var(--ui-bg) 100%)"
    />
  </div>
</template>
