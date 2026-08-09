<script setup lang="ts">
import { site } from "~/config/site";

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
      The club emblem is white line art. Inverting it in light mode is the only
      way to keep the official shape untouched while staying legible on paper;
      recolouring the file would fork the asset per theme.
    -->
    <img
      :src="assetUrl('/brand/logo-mark.png')"
      :alt="`${site.club.name} logo`"
      :class="[size, 'w-auto shrink-0 invert dark:invert-0']"
      :width="variant === 'lockup' ? 477 : 443"
      :height="variant === 'lockup' ? 563 : 268"
      decoding="async"
    />
    <span
      v-if="wordmark && variant === 'mark'"
      class="font-display text-[0.95rem] font-bold uppercase leading-none tracking-[0.14em]"
    >
      <span class="text-ink">Tim Lacault</span>
      <span class="ml-1 text-accent">UST</span>
    </span>
  </span>
</template>
