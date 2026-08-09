<script setup lang="ts">
// Opt out of the standard measure with `definePageMeta({ bleed: true })` when
// a page draws its own full-width sections (the landing hero, for one).
const route = useRoute()
const bleed = computed(() => route.meta.bleed === true)
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <UiAmbientBackdrop />

    <a
      href="#main"
      class="btn btn-primary sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60]"
    >
      Skip to content
    </a>

    <SiteHeader />

    <!--
      The measured pages pad past the fixed header so their first heading is
      not born underneath it. Bleed pages do not: their hero is supposed to run
      *under* the transparent bar, and reserving the height here would leave a
      flat strip above the artwork.
    -->
    <main
      id="main"
      class="flex-1"
      :class="bleed ? '' : 'mx-auto w-full max-w-6xl px-4 pb-12 pt-28 sm:px-6 sm:pb-16 sm:pt-32'"
    >
      <slot />
    </main>

    <SiteFooter />
  </div>
</template>
