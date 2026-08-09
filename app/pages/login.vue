<script setup lang="ts">
import { Eye, EyeOff, Loader, LogIn, TriangleAlert } from '@lucide/vue'

definePageMeta({ layout: 'auth' })

const client = useSupabaseClient()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const revealed = ref(false)

const errorRef = ref<HTMLElement | null>(null)
const emailRef = ref<HTMLInputElement | null>(null)

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
      // Land the cursor where the correction has to happen; an error the user
      // has to go hunting for is barely better than no error.
      await nextTick()
      emailRef.value?.focus()
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

useSeoMeta({ title: 'Sign in — U.S. Talence Badminton', robots: 'noindex' })
</script>

<template>
  <div class="w-full max-w-[26rem]">
    <div class="flex flex-col items-center text-center">
      <UiBrandLogo variant="lockup" size="h-24" :wordmark="false" />
      <h1 class="mt-6 font-display text-4xl font-bold uppercase leading-none tracking-tight">
        Sign in
      </h1>
      <p class="mt-2.5 text-[0.9375rem] text-ink-muted">
        Admin access only. There is no public sign-up.
      </p>
    </div>

    <form class="mt-8 rounded-2xl p-6 glass sm:p-7" novalidate @submit.prevent="submit">
      <div class="space-y-5">
        <div>
          <label for="login-email" class="label">Email</label>
          <input
            id="login-email"
            ref="emailRef"
            v-model="email"
            data-testid="login-email"
            type="email"
            required
            autocomplete="username"
            inputmode="email"
            placeholder="you@example.com"
            class="field mt-2"
            :aria-invalid="Boolean(error)"
            aria-describedby="login-error"
          >
        </div>

        <div>
          <label for="login-password" class="label">Password</label>
          <div class="relative mt-2">
            <input
              id="login-password"
              v-model="password"
              data-testid="login-password"
              :type="revealed ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="field pr-12"
              :aria-invalid="Boolean(error)"
              aria-describedby="login-error"
            >
            <button
              type="button"
              class="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-ink-subtle transition-colors duration-200 hover:text-accent"
              :aria-label="revealed ? 'Hide password' : 'Show password'"
              :aria-pressed="revealed"
              @click="revealed = !revealed"
            >
              <component :is="revealed ? EyeOff : Eye" :size="17" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- role=alert so the failure is announced, not just drawn. -->
      <p
        v-if="error"
        id="login-error"
        ref="errorRef"
        data-testid="login-error"
        role="alert"
        class="mt-5 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm text-accent"
      >
        <TriangleAlert :size="16" class="mt-px shrink-0" aria-hidden="true" />
        <span>{{ error }}</span>
      </p>

      <button
        type="submit"
        data-testid="login-submit"
        :disabled="busy"
        class="btn btn-primary mt-6 w-full"
      >
        <component
          :is="busy ? Loader : LogIn"
          :size="16"
          :class="busy ? 'animate-spin' : ''"
          aria-hidden="true"
        />
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>
