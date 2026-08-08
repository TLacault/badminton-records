import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
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
