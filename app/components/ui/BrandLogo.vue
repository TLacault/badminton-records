<script setup lang="ts">
withDefaults(
  defineProps<{
    /** `mark` is the emblem alone; `lockup` is the full club logo with its
     *  own set text, only legible above ~120px wide. */
    variant?: "mark" | "lockup";
    /** Tailwind height class for the image. */
    size?: string;
    /** Adds the typographic wordmark next to the mark. */
    wordmark?: boolean;
  }>(),
  { variant: "mark", size: "h-9", wordmark: true },
);
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <!--
      The Badminton Records mark (brand/png/logo.png, trimmed). Full colour with
      its own dark outline, so it reads on both themes without inverting.
    -->
    <img
      :src="assetUrl('/brand/logo-mark.png')"
      alt="Badminton Records"
      :class="[size, 'w-auto shrink-0']"
      width="495"
      height="512"
      decoding="async"
    />
    <span
      v-if="wordmark && variant === 'mark'"
      class="font-display text-[0.95rem] font-bold uppercase leading-none tracking-[0.14em]"
    >
      <span class="text-ink">Badminton</span>
      <span class="ml-1 text-accent">Records</span>
    </span>
  </span>
</template>
