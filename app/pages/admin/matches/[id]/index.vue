<script setup lang="ts">
import { Pencil } from '@lucide/vue'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <AdminMatchNav :match-id="id" current="setup" />

    <p class="eyebrow">
      <Pencil :size="15" aria-hidden="true" />
      Setup
    </p>

    <MatchForm class="mt-4" :match-id="id" />
  </div>
</template>
