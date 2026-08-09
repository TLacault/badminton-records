/**
 * URL for a file in `public/`, valid when the site is not served from the
 * domain root — GitHub Pages puts a project site under `/<repo>/`.
 *
 * Static `src="/brand/x.png"` attributes in templates are rewritten by Vite
 * against the base path already; bound `:src` values and plain strings in
 * config are not, and need this.
 */
export function assetUrl(path: string): string {
  const base = useRuntimeConfig().app.baseURL
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
