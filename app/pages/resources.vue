<script setup lang="ts">
import { BookOpen } from '@lucide/vue'
import { site } from '~/config/site'

const { t, lt } = useI18n()
const pillar = site.pillars.find(p => p.id === 'resources')!

useSeoMeta({
  title: () => t('resources.seoTitle'),
  description: () => lt(pillar.blurb),
})
</script>

<template>
  <SiteComingSoon
    :eyebrow="$t('resources.eyebrow')"
    :title="$lt(pillar.title)"
    :lede="$lt(pillar.blurb)"
    :icon="BookOpen"
    :planned="$ta('resources.planned')"
  />
</template>
