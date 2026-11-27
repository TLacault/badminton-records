<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin', wide: true, matchTool: 'view', pageTransition: false })

/** The admin's view of a video: exactly the page the site shows, under the admin bar. */
const route = useRoute()
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <MatchPage :key="String(route.params.id)" :match-id="String(route.params.id)" admin />
  </div>
</template>
