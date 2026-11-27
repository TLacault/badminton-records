<script setup lang="ts">
import { Pencil } from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin', wide: true, matchTool: 'setup', pageTransition: false })

const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <div class="mx-auto max-w-6xl">

    <p class="eyebrow">
      <Pencil :size="15" aria-hidden="true" />
      Setup
    </p>

    <MatchForm class="mt-4" :match-id="id" />
  </div>
</template>
