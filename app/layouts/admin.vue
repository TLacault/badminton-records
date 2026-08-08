<script setup lang="ts">
const client = useSupabaseClient()
const { profile } = useCurrentProfile()

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800">
      <nav class="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
        <NuxtLink to="/admin" class="font-semibold">
          Admin
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
    <main class="mx-auto max-w-6xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
