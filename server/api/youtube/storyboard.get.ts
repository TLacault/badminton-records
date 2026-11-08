import { parseStoryboardSpec } from '~~/shared/storyboard'

/**
 * The scrub-preview sprite sheets for one video, read off its watch page.
 *
 * Public, like the match page that asks for it, and cached at the edge for a
 * day: the sheets of a published video do not change, and every viewer of a
 * match would otherwise send YouTube the same request.
 */
export default defineEventHandler(async (event) => {
  const v = String(getQuery(event).v ?? '')
  if (!/^[\w-]{11}$/.test(v)) throw createError({ statusCode: 400, statusMessage: 'Bad video id' })

  const html = await $fetch<string>('https://www.youtube.com/watch', {
    query: { v, hl: 'en' },
    responseType: 'text',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
  }).catch(() => '')
  const spec = /"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/.exec(html)?.[1]
  const storyboard = spec ? parseStoryboardSpec(JSON.parse(`"${spec}"`)) : null

  // Wrapped, never a bare null (that goes out as a 204 and drops the header).
  // YouTube refuses datacenter IPs, Vercel's included, so a miss is expected
  // in production: it is cached for an hour and the timeline uses its stills.
  setHeader(event, 'Cache-Control', `public, s-maxage=${storyboard ? 86400 : 3600}`)
  return { storyboard }
})
