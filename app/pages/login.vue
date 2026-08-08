<script setup lang="ts">
const client = useSupabaseClient()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    const { error: authError } = await client.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (authError) {
      error.value = authError.message
      return
    }
    const { refresh } = useCurrentProfile()
    await refresh()
    await navigateTo((route.query.redirect as string) || '/admin')
  }
  catch (e) {
    // Without this the form fails silently on a network or config error,
    // which looks identical to "nothing happened".
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <h1 class="text-2xl font-bold">
      Sign in
    </h1>
    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <input
        v-model="email"
        data-testid="login-email"
        type="email"
        required
        placeholder="Email"
        class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
      >
      <input
        v-model="password"
        data-testid="login-password"
        type="password"
        required
        placeholder="Password"
        class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
      >
      <p v-if="error" data-testid="login-error" class="text-sm text-red-400">
        {{ error }}
      </p>
      <button
        type="submit"
        data-testid="login-submit"
        :disabled="busy"
        class="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
      >
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>
