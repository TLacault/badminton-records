/**
 * Thin YouTube Data API v3 client — only the two calls the importer needs.
 *
 * Kept separate from the route so the paging and parsing can be reasoned about
 * (and tested) without an HTTP event in scope.
 */

const API = 'https://www.googleapis.com/youtube/v3'

export interface ChannelVideo {
  videoId: string
  title: string
  publishedAt: string
  thumbnailUrl: string | null
  durationSeconds: number | null
}

interface PlaylistItemsResponse {
  nextPageToken?: string
  items: Array<{
    snippet: {
      title: string
      publishedAt: string
      thumbnails?: Record<string, { url: string, width: number }>
      resourceId: { videoId: string }
    }
  }>
}

interface VideosResponse {
  items: Array<{ id: string, contentDetails: { duration: string } }>
}

/** ISO-8601 duration (`PT1H2M3S`) → seconds. Returns null if unparseable. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  const [, d, h, min, s] = m
  return (
    Number(d ?? 0) * 86400
    + Number(h ?? 0) * 3600
    + Number(min ?? 0) * 60
    + Number(s ?? 0)
  )
}

/** Widest thumbnail on offer; YouTube omits the larger sizes on older uploads. */
function bestThumbnail(thumbnails?: Record<string, { url: string, width: number }>) {
  const all = Object.values(thumbnails ?? {})
  if (!all.length) return null
  return all.reduce((a, b) => (b.width > a.width ? b : a)).url
}

/**
 * Resolve a channel handle (`@timlacault`, with or without the `@`) to its
 * "uploads" playlist, which is the only way to page a channel's full history —
 * search.list caps out and reorders.
 */
export async function resolveUploadsPlaylist(handle: string, key: string) {
  const res = await $fetch<{
    items?: Array<{
      id: string
      contentDetails: { relatedPlaylists: { uploads: string } }
    }>
  }>(`${API}/channels`, {
    query: {
      part: 'contentDetails',
      forHandle: handle.startsWith('@') ? handle : `@${handle}`,
      key,
    },
  })

  const channel = res.items?.[0]
  if (!channel) {
    throw new Error(`No YouTube channel found for handle "${handle}"`)
  }
  return {
    channelId: channel.id,
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
  }
}

/** Every video in the playlist, newest first, following nextPageToken. */
export async function listPlaylistVideos(playlistId: string, key: string) {
  const videos: ChannelVideo[] = []
  let pageToken: string | undefined

  do {
    const res = await $fetch<PlaylistItemsResponse>(`${API}/playlistItems`, {
      query: { part: 'snippet', playlistId, maxResults: 50, pageToken, key },
    })
    for (const item of res.items) {
      videos.push({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
        durationSeconds: null,
      })
    }
    pageToken = res.nextPageToken
  } while (pageToken)

  return videos
}

/**
 * Fill in durations, which playlistItems does not carry. videos.list takes up
 * to 50 ids per call, so this costs one request per 50 videos.
 */
export async function attachDurations(videos: ChannelVideo[], key: string) {
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50)
    const res = await $fetch<VideosResponse>(`${API}/videos`, {
      query: {
        part: 'contentDetails',
        id: batch.map(v => v.videoId).join(','),
        key,
      },
    })
    const byId = new Map(res.items.map(x => [x.id, x.contentDetails.duration]))
    for (const v of batch) {
      const iso = byId.get(v.videoId)
      if (iso) v.durationSeconds = parseIsoDuration(iso)
    }
  }
  return videos
}
