<script setup lang="ts">
import { Waypoints } from '@lucide/vue'
import { site } from '~/config/site'

const pillar = site.pillars.find(p => p.id === 'skill-tree')!

useSeoMeta({
  title: 'Skill Tree — U.S. Talence Badminton',
  description: pillar.blurb,
})
</script>

<template>
  <SiteComingSoon
    eyebrow="Section three of three"
    title="Skill Tree"
    :lede="pillar.blurb"
    :icon="Waypoints"
    :planned="[
      'A branching map of shots, movement and tactics — what unlocks what.',
      'Every node wired to the resources that teach it.',
      'And to the tagged rallies where the skill actually turns up in a match.',
      'Progress you can see: what is solid, what is shaky, what is next.',
    ]"
  />
</template>
