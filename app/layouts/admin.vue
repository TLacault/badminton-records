<script setup lang="ts">
import { Building2, ExternalLink, LogOut, Plus, Tags, UsersRound, Video } from '@lucide/vue'

const client = useSupabaseClient()
const { profile } = useCurrentProfile()

/**
 * `admin@ust.local` → `admin`.
 *
 * A profile with no display name of its own falls back to the sign-in email
 * (see 0001_schema.sql), and a whole address in the header is more than the
 * header needs. Only the local part is dropped, so a real display name that
 * happens to contain no '@' is printed untouched.
 */
const shortName = computed(() => {
  const name = profile.value?.display_name ?? ''
  return name.includes('@') ? name.slice(0, name.indexOf('@')) : name
})

// Opt-in per page via `definePageMeta({ wide: true })`. Only the tagging page
// wants the full viewport; the rest stay readable at a fixed measure.
const route = useRoute()
const wide = computed(() => route.meta.wide === true)

const links = [
  { to: '/admin', label: 'Videos', icon: Video, exact: true },
  { to: '/admin/matches/new', label: 'New match', icon: Plus, exact: true },
  { to: '/admin/players', label: 'Players', icon: UsersRound, exact: false },
  { to: '/admin/clubs', label: 'Clubs', icon: Building2, exact: false },
  { to: '/admin/match-types', label: 'Types', icon: Tags, exact: true },
]

function isActive(link: (typeof links)[number]) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <UiAmbientBackdrop />

    <header class="sticky top-0 z-50 border-b border-line bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
      <nav
        class="mx-auto flex min-h-16 flex-wrap items-center gap-x-1.5 gap-y-2 px-3 py-2 sm:gap-x-3 sm:px-6"
        :class="wide ? 'max-w-none' : 'max-w-6xl'"
        aria-label="Admin"
      >
        <NuxtLink to="/admin" class="-m-1 flex items-center gap-2.5 rounded-lg p-1">
          <UiBrandLogo size="h-7" :wordmark="false" />
          <!-- The word goes on a phone, not the mark: the row has to stay one
               row there, or the tagger's pinned video sits under a header that
               is taller than it says it is. -->
          <span class="hidden font-display text-sm font-bold uppercase tracking-[0.18em] text-accent sm:inline">
            Admin
          </span>
        </NuxtLink>

        <ul class="flex items-center gap-1">
          <li v-for="link in links" :key="link.to">
            <NuxtLink
              :to="link.to"
              class="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-display text-sm font-semibold uppercase tracking-[0.08em] transition-[color,background-color] duration-200 ease-brand sm:px-3"
              :class="isActive(link)
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:text-ink'"
              :aria-current="isActive(link) ? 'page' : undefined"
            >
              <component :is="link.icon" :size="15" aria-hidden="true" />
              <span class="hidden sm:inline">{{ link.label }}</span>
            </NuxtLink>
          </li>
        </ul>

        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
          <NuxtLink
            to="/"
            class="hidden min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-subtle transition-colors duration-200 hover:text-accent md:inline-flex"
          >
            View site
            <ExternalLink :size="13" aria-hidden="true" />
          </NuxtLink>

          <span
            data-testid="admin-name"
            class="hidden max-w-40 truncate rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted sm:inline-block"
          >{{ shortName }}</span>

          <UiThemeToggle />

          <button
            type="button"
            class="grid size-10 place-items-center rounded-xl border border-line text-ink-muted transition-[color,border-color] duration-200 hover:border-accent/50 hover:text-accent sm:size-11"
            aria-label="Sign out"
            title="Sign out"
            @click="signOut"
          >
            <LogOut :size="17" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </header>

    <main class="mx-auto w-full flex-1 px-4 py-8 sm:px-6" :class="wide ? 'max-w-none' : 'max-w-6xl'">
      <slot />
    </main>
  </div>
</template>
