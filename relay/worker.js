/**
 * Relay for MyFFBaD player search. myffbad.fr drops connections from AWS, where
 * Vercel runs, so the app's server asks this worker instead.
 *
 * Fixed upstream path and a shared key: it relays the one search page, for
 * our app only, and is never an open proxy.
 */
const UPSTREAM = 'https://myffbad.fr/recherche/joueur'

export default {
  async fetch(request, env) {
    if (!env.RELAY_KEY || request.headers.get('X-Relay-Key') !== env.RELAY_KEY) {
      return new Response('Forbidden', { status: 403 })
    }
    const upstream = new URL(UPSTREAM)
    upstream.search = new URL(request.url).search
    const res = await fetch(upstream, {
      headers: { 'User-Agent': request.headers.get('User-Agent') ?? 'badminton-records/1.0' },
    })
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'text/html' },
    })
  },
}
