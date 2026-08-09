<script setup lang="ts">
import { BookOpen } from '@lucide/vue'
import { site } from '~/config/site'

const pillar = site.pillars.find(p => p.id === 'resources')!

useSeoMeta({
  title: 'Resources — U.S. Talence Badminton',
  description: pillar.blurb,
})
</script>

<template>
  <SiteComingSoon
    eyebrow="Section two of three"
    title="Resources"
    :lede="pillar.blurb"
    :icon="BookOpen"
    :planned="[
      'Drills we actually run at training, with the point of each one written down.',
      'Footwork and movement patterns, filmed slowly enough to copy.',
      'Tactical notes for doubles: rotations, service returns, defending the flat exchange.',
      'The videos, articles and coaches worth your time — and a line on why.',
    ]"
  />
</template>
