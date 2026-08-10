import type { Text } from '~/config/site'
import en from '~/locales/en'
import fr from '~/locales/fr'

export type Locale = 'fr' | 'en'

export const LOCALES: Locale[] = ['fr', 'en']

const messages: Record<Locale, unknown> = { fr, en }

const COOKIE_KEY = 'ust-locale'

/** Matches `{name}` so `t('greeting', { name })` can fill it in. */
const SLOT = /\{(\w+)\}/g

/**
 * Language state and lookup.
 *
 * A cookie rather than localStorage, which is the one place this departs from
 * the same plugin in timlacault.dev: that site is a SPA, so it can read storage
 * before it ever renders. Here the server renders first and has no access to
 * storage, so a stored preference would arrive too late — every translated
 * string would hydrate as a mismatch, and the page would visibly re-language
 * itself. A cookie travels with the request, so the server picks the right
 * words the first time.
 */
export function useI18n() {
  const cookie = useCookie<Locale>(COOKIE_KEY, {
    default: () => 'fr',
    sameSite: 'lax',
    // A year: the visitor's language is not something to ask about twice.
    maxAge: 60 * 60 * 24 * 365,
  })

  const locale = useState<Locale>(COOKIE_KEY, () => (
    LOCALES.includes(cookie.value) ? cookie.value : 'fr'
  ))

  function setLocale(next: Locale) {
    if (!LOCALES.includes(next)) return
    locale.value = next
    cookie.value = next
  }

  function toggleLocale() {
    setLocale(locale.value === 'fr' ? 'en' : 'fr')
  }

  /** Walks `a.b.c` through the message tree. */
  function lookup(key: string, lang: Locale): unknown {
    return key.split('.').reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages[lang],
    )
  }

  /**
   * Falls back to French before falling back to the key itself, so a string
   * that only exists in one language shows real words rather than `hero.lede`.
   */
  function resolve(key: string): unknown {
    const own = lookup(key, locale.value)
    if (own !== undefined) return own
    return locale.value === 'fr' ? undefined : lookup(key, 'fr')
  }

  function fill(text: string, params?: Record<string, unknown>): string {
    if (!params) return text
    return text.replace(SLOT, (whole, name: string) => (
      name in params ? String(params[name]) : whole
    ))
  }

  /**
   * `t('key')`, or `t('key', { n: 3 })` to interpolate. When the entry is a
   * `{ one, other }` pair and `n` is given, Intl picks the form — French and
   * English disagree at zero ("0 match" but "0 matches"), which is exactly the
   * kind of seam that makes a translation feel machine-made.
   */
  function t(key: string, params?: Record<string, unknown>): string {
    const value = resolve(key)

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const forms = value as Record<string, string>
      const n = params?.n
      if (typeof n === 'number') {
        const rule = new Intl.PluralRules(locale.value).select(n)
        const picked = forms[rule] ?? forms.other ?? forms.one
        if (typeof picked === 'string') return fill(picked, params)
      }
      return key
    }

    return typeof value === 'string' ? fill(value, params) : key
  }

  /** Array entries — bio paragraphs, bullet lists. Empty array when missing. */
  function ta(key: string): string[] {
    const value = resolve(key)
    return Array.isArray(value) ? (value as string[]) : []
  }

  /**
   * Picks the current language out of an `{ fr, en }` pair from site.ts.
   *
   * Falls back to French rather than to empty, because that file is filled in
   * French first: a half-written entry should read as untranslated, not as a
   * hole in the page.
   */
  function lt(value?: Text | null): string {
    if (!value) return ''
    const own = value[locale.value]
    if (own?.trim()) return own
    return value.fr?.trim() ? value.fr : (value.en ?? '')
  }

  /** `lt` for the pairs whose halves are lists, like the two-line hero title. */
  function ltList(value?: { fr: string[]; en: string[] } | null): string[] {
    if (!value) return []
    const own = value[locale.value]
    if (own?.length) return own
    return value.fr?.length ? value.fr : (value.en ?? [])
  }

  /** BCP 47 tag for Intl, which needs a region to format dates properly. */
  const bcp47 = computed(() => (locale.value === 'fr' ? 'fr-FR' : 'en-GB'))

  return { locale, bcp47, setLocale, toggleLocale, t, ta, lt, ltList }
}
