import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Server-only: the key must never reach the client, so this sits outside
    // `public`. Named plainly rather than NUXT_-prefixed because that is how
    // it was issued and stored in .env.
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
    youtubeChannelHandle: process.env.YOUTUBE_CHANNEL_HANDLE ?? 'timlacault',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  supabase: {
    // Route protection is handled by app/middleware/admin.ts, which guards
    // /admin/** only. The module's global redirect would force us to
    // enumerate every public route in `exclude` instead.
    redirect: false,
  },
})
