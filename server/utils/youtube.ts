/**
 * Thin YouTube Data API v3 client — only the calls the importer needs.
 *
 * Kept separate from the route so the paging and parsing can be reasoned about
 * (and tested) without an HTTP event in scope.
 */

const API = 'https://www.googleapis.com/youtube/v3'

/**
 * OAuth as the channel owner sees unlisted (and private) uploads; the API key
 * only sees public ones. The key stays as the fallback until OAuth is set.
 */
export type YouTubeAuth = { key: string } | { token: string }

function call<T>(path: string, query: Record<string, unknown>, auth: YouTubeAuth) {
  return 'token' in auth
    ? $fetch<T>(`${API}/${path}`, { query, headers: { Authorization: `Bearer ${auth.token}` } })
    : $fetch<T>(`${API}/${path}`, { query: { ...query, key: auth.key } })
}

/** Trade the long-lived refresh token for a one-hour access token. */
export async function accessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await $fetch<{ access_token: string }>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  return res.access_token
}

export interface ChannelVideo {
  videoId: string
  title: string
  publishedAt: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  /** public | unlisted | private; null until videos.list has been read. */
  privacy: string | null
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
  items: Array<{
    id: string
    contentDetails: { duration: string }
    status?: { privacyStatus?: string }
    snippet?: { title?: string, thumbnails?: Record<string, { url: string, width: number }> }
  }>
}

export type VideoKind = 'raw' | 'match' | 'highlights' | 'shorts'

/**
 * What a video is: HIGHLIGHTS, or SHORTS / EDIT (as a word), in the title; otherwise the
 * unlisted upload is the raw recording and a listed one the edited match.
 */
export function videoKindOf(title: string, privacy: string | null = null): VideoKind {
  if (/highlights/i.test(title)) return 'highlights'
  if (/\b(shorts?|edit)\b/i.test(title)) return 'shorts'
  return privacy === 'unlisted' ? 'raw' : 'match'
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

/**
 * Widest thumbnail on offer; YouTube omits the larger sizes on older uploads.
 * Capped at 1280: a 2560 custom thumbnail makes the API list `qhddefault.jpg`,
 * which the CDN answers with a 404 placeholder.
 */
export function bestThumbnail(thumbnails?: Record<string, { url: string, width: number }>) {
  const all = Object.values(thumbnails ?? {}).filter(t => t.width <= 1280)
  if (!all.length) return null
  return all.reduce((a, b) => (b.width > a.width ? b : a)).url
}

/**
 * Resolve a channel handle (`@badrec-tim`, with or without the `@`) to its
 * "uploads" playlist, which is the only way to page a channel's full history —
 * search.list caps out and reorders.
 */
export async function resolveUploadsPlaylist(handle: string, auth: YouTubeAuth) {
  const want = handle.startsWith('@') ? handle : `@${handle}`
  const res = await call<{
    items?: Array<{
      id: string
      contentDetails: { relatedPlaylists: { uploads: string } }
    }>
  }>('channels', {
    part: 'contentDetails',
    ...('token' in auth ? { mine: true } : { forHandle: want }),
  }, auth)

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
export async function listPlaylistVideos(playlistId: string, auth: YouTubeAuth) {
  const videos: ChannelVideo[] = []
  let pageToken: string | undefined

  do {
    const res = await call<PlaylistItemsResponse>('playlistItems', { part: 'snippet', playlistId, maxResults: 50, pageToken }, auth)
    for (const item of res.items) {
      videos.push({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
        durationSeconds: null,
        privacy: null,
      })
    }
    pageToken = res.nextPageToken
  } while (pageToken)

  return videos
}

/**
 * Fill in durations, which playlistItems does not carry, and re-read the
 * thumbnails: playlistItems keeps serving the processing placeholder (or
 * nothing) for a while after upload, videos.list has the real one first.
 * videos.list takes up to 50 ids per call, so this costs one request per 50.
 */
export async function attachDetails(videos: ChannelVideo[], auth: YouTubeAuth) {
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50)
    const res = await call<VideosResponse>('videos', {
      part: 'contentDetails,snippet,status',
      id: batch.map(v => v.videoId).join(','),
    }, auth)
    const byId = new Map(res.items.map(x => [x.id, x]))
    for (const v of batch) {
      const item = byId.get(v.videoId)
      if (!item) continue
      v.durationSeconds = parseIsoDuration(item.contentDetails.duration)
      v.thumbnailUrl = bestThumbnail(item.snippet?.thumbnails) ?? v.thumbnailUrl
      v.title = item.snippet?.title ?? v.title
      v.privacy = item.status?.privacyStatus ?? null
    }
  }
  return videos
}

// ── Upload (videos.insert, thumbnails.set) ──────────────────────────────────

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3'
const CHUNK = 32 * 1024 * 1024

export interface UploadMeta {
  title: string
  description: string
  privacy: 'public' | 'unlisted' | 'private'
  madeForKids: boolean
}

async function googleError(res: Response) {
  const text = await res.text()
  try {
    return JSON.parse(text).error?.message ?? text
  }
  catch {
    return text || `HTTP ${res.status}`
  }
}

/**
 * Resumable upload in 32 MB chunks: a 4K match is several gigabytes, and a
 * chunk is the unit a progress bar and a retry can work with. The values are
 * sent exactly as Tim left them (YouTube policy: no rewriting).
 */
export async function uploadVideo(
  token: string,
  file: string,
  meta: UploadMeta,
  report: (progress: number, message: string) => void,
): Promise<string> {
  const { open, stat } = await import('node:fs/promises')
  const size = (await stat(file)).size
  const start = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description, categoryId: '17' },
      status: { privacyStatus: meta.privacy, selfDeclaredMadeForKids: meta.madeForKids, embeddable: true },
    }),
  })
  if (!start.ok) throw new Error(`YouTube refused the upload: ${await googleError(start)}`)
  const session = start.headers.get('location')
  if (!session) throw new Error('YouTube gave no upload session')

  const handle = await open(file, 'r')
  try {
    let offset = 0
    while (offset < size) {
      const length = Math.min(CHUNK, size - offset)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, offset)
      let res: Response | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch(session, {
          method: 'PUT',
          headers: { 'Content-Length': String(length), 'Content-Range': `bytes ${offset}-${offset + length - 1}/${size}` },
          body: buffer,
        }).catch(() => null)
        if (res && res.status < 500) break
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      }
      if (!res) throw new Error('Upload interrupted: no connection to YouTube')
      if (res.status === 308) {
        const range = res.headers.get('range')
        offset = range ? Number(range.split('-')[1]) + 1 : offset + length
        report(offset / size, `Uploading ${Math.round(offset / 1e6)} / ${Math.round(size / 1e6)} MB`)
        continue
      }
      if (!res.ok) throw new Error(`Upload failed: ${await googleError(res)}`)
      const video = await res.json() as { id: string }
      return video.id
    }
    throw new Error('Upload ended without a video')
  }
  finally {
    await handle.close()
  }
}

/** Custom thumbnail; YouTube needs a verified channel for it. */
export async function setThumbnail(token: string, videoId: string, jpeg: Buffer) {
  const res = await fetch(`${UPLOAD}/thumbnails/set?videoId=${videoId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: jpeg,
  })
  if (!res.ok) throw new Error(await googleError(res))
}
