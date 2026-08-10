/**
 * Exposes `$t`, `$ta`, `$locale` and `$setLocale` to every template, the same
 * four names the plugin in timlacault.dev provides, so markup reads the same
 * way in both projects.
 *
 * `<script setup>` blocks should call `useI18n()` directly instead — the
 * globals exist for templates, where a composable import per component would
 * be noise.
 */
export default defineNuxtPlugin(() => {
  const { t, ta, lt, ltList, locale, setLocale } = useI18n()

  // Reactive, so switching language also corrects the document language for
  // screen readers and for the browser's own translation prompt.
  useHead({ htmlAttrs: { lang: locale } })

  return {
    // `$lt` / `$ltList` resolve the { fr, en } pairs in site.ts; `$t` / `$ta`
    // read the locale files. Two sources because they have two authors: the
    // locale files are interface strings I maintain, site.ts is editorial copy
    // the club writes.
    provide: { t, ta, lt, ltList, locale, setLocale },
  }
})
