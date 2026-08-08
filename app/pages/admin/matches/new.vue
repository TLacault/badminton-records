<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })
</script>

<template>
  <h1 class="text-2xl font-bold">
    New match
  </h1>
  <MatchForm class="mt-6" :match-id="null" />
</template>
