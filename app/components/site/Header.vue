<script setup lang="ts">
import { BookOpen, Menu, ShieldCheck, Video, Waypoints, X } from '@lucide/vue'
import { site } from '~/config/site'

const route = useRoute()
const user = useSupabaseUser()

const ICONS = { videos: Video, 'resources': BookOpen, 'skill-tree': Waypoints } as const

const links = computed(() =>
  site.pillars.map(pillar => ({
    ...pillar,
    icon: ICONS[pillar.id as keyof typeof ICONS],
    // A match page is still "Videos" as far as the reader is concerned, so the
    // tab stays lit rather than dropping the visitor's sense of place.
    active: pillar.id === 'videos'
      ? route.path.startsWith('/videos') || route.path.startsWith('/matches')
      : route.path.startsWith(pillar.to),
  })),
)

const open = ref(false)
// Any navigation closes the sheet — including a back gesture, which would
// otherwise leave it stranded over the new page.
watch(() => route.fullPath, () => { open.value = false })

const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 8
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header class="fixed inset-x-0 top-0 z-50">
    <div
      class="transition-[background-color,border-color,backdrop-filter] duration-300 ease-brand"
      :class="scrolled || open
        ? 'border-b border-line bg-bg/70 backdrop-blur-xl backdrop-saturate-150'
        : 'border-b border-transparent'"
    >
      <nav
        class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-18 sm:px-6"
        :aria-label="$t('nav.main')"
      >
        <NuxtLink
          to="/"
          class="group -m-1 rounded-lg p-1"
          :aria-label="$t('nav.homeAria', { club: site.club.name })"
        >
          <UiBrandLogo
            size="h-8 sm:h-9"
            class="transition-transform duration-300 ease-brand group-hover:scale-[1.03]"
          />
        </NuxtLink>

        <ul class="ml-4 hidden items-center gap-1 md:flex">
          <li v-for="link in links" :key="link.id">
            <NuxtLink
              :to="link.to"
              class="group relative inline-flex h-10 items-center gap-2 rounded-lg px-3 font-display text-sm font-semibold uppercase tracking-[0.1em] transition-colors duration-200 ease-brand"
              :class="link.active ? 'text-accent' : 'text-ink-muted hover:text-ink'"
              :aria-current="link.active ? 'page' : undefined"
            >
              <component :is="link.icon" :size="15" aria-hidden="true" />
              {{ $lt(link.label) }}
              <span
                v-if="!link.ready"
                class="rounded-full bg-accent-soft px-1.5 py-px text-[0.625rem] tracking-widest text-accent"
              >{{ $t('common.soon') }}</span>
              <!-- Lit underline, not a filled pill: the nav stays quiet until
                   you are somewhere, then the crimson does the work. -->
              <span
                class="absolute inset-x-3 -bottom-px h-px origin-center bg-accent transition-transform duration-300 ease-brand"
                :class="link.active ? 'scale-x-100 shadow-[0_0_10px_var(--ui-accent)]' : 'scale-x-0 group-hover:scale-x-100'"
                aria-hidden="true"
              />
            </NuxtLink>
          </li>
        </ul>

        <div class="ml-auto flex items-center gap-2">
          <NuxtLink
            v-if="user"
            to="/admin"
            class="btn btn-sm btn-ghost hidden sm:inline-flex"
          >
            <ShieldCheck :size="15" aria-hidden="true" />
            {{ $t('nav.admin') }}
          </NuxtLink>

          <UiLangToggle />

          <UiThemeToggle />

          <button
            type="button"
            class="grid size-11 place-items-center rounded-xl border border-line text-ink-muted transition-colors duration-200 ease-brand hover:border-accent/50 hover:text-accent md:hidden"
            :aria-expanded="open"
            aria-controls="mobile-nav"
            :aria-label="open ? $t('nav.closeMenu') : $t('nav.openMenu')"
            @click="open = !open"
          >
            <component :is="open ? X : Menu" :size="19" aria-hidden="true" />
          </button>
        </div>
      </nav>

      <!-- Mobile sheet. Height-based so it slides rather than pops, and it is
           removed from the tree when closed so its links leave the tab order. -->
      <Transition
        enter-active-class="transition-[max-height,opacity] duration-300 ease-brand"
        leave-active-class="transition-[max-height,opacity] duration-200 ease-in"
        enter-from-class="max-h-0 opacity-0"
        enter-to-class="max-h-96 opacity-100"
        leave-from-class="max-h-96 opacity-100"
        leave-to-class="max-h-0 opacity-0"
      >
        <div v-if="open" id="mobile-nav" class="overflow-hidden md:hidden">
          <ul class="flex flex-col gap-1 border-t border-line px-4 py-3">
            <li v-for="link in links" :key="link.id">
              <NuxtLink
                :to="link.to"
                class="flex min-h-12 items-center gap-3 rounded-xl px-3 font-display text-base font-semibold uppercase tracking-[0.1em] transition-colors duration-200"
                :class="link.active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink'"
                :aria-current="link.active ? 'page' : undefined"
              >
                <component :is="link.icon" :size="18" aria-hidden="true" />
                {{ $lt(link.label) }}
                <span v-if="!link.ready" class="ml-auto text-[0.6875rem] tracking-widest text-ink-subtle">{{ $t('common.soon') }}</span>
              </NuxtLink>
            </li>
            <li v-if="user">
              <NuxtLink
                to="/admin"
                class="flex min-h-12 items-center gap-3 rounded-xl px-3 font-display text-base font-semibold uppercase tracking-[0.1em] text-ink-muted"
              >
                <ShieldCheck :size="18" aria-hidden="true" />
                {{ $t('nav.admin') }}
              </NuxtLink>
            </li>
          </ul>
        </div>
      </Transition>
    </div>
  </header>
</template>
