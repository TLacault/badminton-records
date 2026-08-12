<script setup lang="ts">
import { site } from '~/config/site'

/**
 * Every tab reads `Bad Records · <page>`. Pages set only their own half —
 * `useSeoMeta({ title: 'Videos' })` — so the brand is written here once
 * instead of being spelled out at the end of every page title, where it had
 * already drifted to a name the site no longer uses.
 *
 * A page that sets no title at all (the admin section) gets the brand alone
 * rather than `Bad Records · undefined`.
 */
useHead({
  titleTemplate: title => (title ? `${site.seo.brand} · ${title}` : site.seo.brand),
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
