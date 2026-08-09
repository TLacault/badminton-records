import tailwindcss from '@tailwindcss/vite'

// Set by the Pages workflow to `/<repo>/` for a project site, `/` for a user
// site or custom domain. `app.head` is plain data that Vite never rewrites,
// so its URLs have to be joined by hand. Mirrors app/utils/asset.ts, which
// does the same for `:src` bindings at runtime.
const baseURL = process.env.NUXT_APP_BASE_URL || '/'
const withBase = (path: string) => `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  app: {
    // Exit is shorter than enter so a click feels answered rather than
    // acknowledged-then-processed.
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Barlow:wght@300;400;500;600;700&display=swap',
        },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: withBase('/favicon-96.png') },
        { rel: 'apple-touch-icon', href: withBase('/favicon-96.png') },
      ],
      meta: [
        { name: 'theme-color', content: '#08070a', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#f4f3f6', media: '(prefers-color-scheme: light)' },
      ],
      noscript: [
        {
          // Scroll reveals render hidden and are unhidden by an observer. With
          // no JS that observer never runs, so the server-rendered content
          // would be present but invisible.
          innerHTML: '<style>.reveal-hidden{opacity:1!important;transform:none!important}</style>',
        },
      ],
      script: [
        {
          // Runs before the body paints, so the stored theme is on <html>
          // by first paint and there is no white flash on a dark-mode reload.
          // Nothing here is reactive — the class is Vue's source of truth on
          // mount, never the other way round, so hydration cannot mismatch.
          innerHTML: `(function(){try{var s=localStorage.getItem('ust-theme');var d=s?s==='dark':!window.matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('dark')}})()`,
          tagPosition: 'head',
          tagPriority: 'critical',
        },
      ],
    },
  },
  runtimeConfig: {
    // Server-only: the key must never reach the client, so this sits outside
    // `public`. Named plainly rather than NUXT_-prefixed because that is how
    // it was issued and stored in .env.
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
    youtubeChannelHandle: process.env.YOUTUBE_CHANNEL_HANDLE ?? 'timlacault',
    // FFBaD web services. Credentials are issued by the federation; without
    // them /api/ffbad/search returns 503 and the roster form stays manual.
    ffbadApiUrl: process.env.FFBAD_API_URL ?? 'https://apitest.ffbad.org/rest/',
    ffbadLogin: process.env.FFBAD_LOGIN ?? '',
    ffbadPassword: process.env.FFBAD_PASSWORD ?? '',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    prerender: {
      // /admin needs a signed-in admin session, which a build does not have:
      // every route under it would render the login redirect and freeze that
      // into HTML. It stays client-rendered, reached through the SPA fallback.
      ignore: ['/admin'],
    },
  },
  supabase: {
    // Route protection is handled by app/middleware/admin.ts, which guards
    // /admin/** only. The module's global redirect would force us to
    // enumerate every public route in `exclude` instead.
    redirect: false,
  },
})
