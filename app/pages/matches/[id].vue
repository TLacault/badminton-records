<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <MatchPage :key="String(route.params.id)" :match-id="String(route.params.id)" />
</template>
