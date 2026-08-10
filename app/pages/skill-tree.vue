<script setup lang="ts">
import { Waypoints } from '@lucide/vue'
import { site } from '~/config/site'

const { t, lt } = useI18n()
const pillar = site.pillars.find(p => p.id === 'skill-tree')!

useSeoMeta({
  title: () => t('skillTree.seoTitle'),
  description: () => lt(pillar.blurb),
})
</script>

<template>
  <SiteComingSoon
    :eyebrow="$t('skillTree.eyebrow')"
    :title="$lt(pillar.title)"
    :lede="$lt(pillar.blurb)"
    :icon="Waypoints"
    :planned="$ta('skillTree.planned')"
  />
</template>
