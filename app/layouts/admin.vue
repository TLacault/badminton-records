<script setup lang="ts">
const client = useSupabaseClient()
const { profile } = useCurrentProfile()

// Opt-in per page via `definePageMeta({ wide: true })`. Only the tagging page
// wants the full viewport; the rest stay readable at a fixed measure.
const route = useRoute()
const wide = computed(() => route.meta.wide === true)

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800">
      <nav class="mx-auto flex items-center gap-6 px-4 py-3 text-sm" :class="wide ? 'max-w-none' : 'max-w-6xl'">
        <NuxtLink to="/admin" class="font-semibold">
          Videos
        </NuxtLink>
        <NuxtLink to="/admin/matches/new" class="text-slate-400 hover:text-slate-100">
          New match
        </NuxtLink>
        <NuxtLink to="/admin/players" class="text-slate-400 hover:text-slate-100">
          Players
        </NuxtLink>
        <span data-testid="admin-name" class="ml-auto text-slate-500">{{ profile?.display_name }}</span>
        <button class="text-slate-400 hover:text-slate-100" @click="signOut">
          Sign out
        </button>
      </nav>
    </header>
    <main class="mx-auto px-4 py-6" :class="wide ? 'max-w-none' : 'max-w-6xl'">
      <slot />
    </main>
  </div>
</template>
