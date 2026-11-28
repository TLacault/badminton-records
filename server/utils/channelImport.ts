import type { H3Event } from 'h3'
import type { requireAdmin } from './auth'
import type { YouTubeAuth } from './youtube'
import { accessToken, attachDetails, listPlaylistVideos, resolveUploadsPlaylist, videoKindOf } from './youtube'

/**
 * OAuth as the channel owner when it is set (sees unlisted uploads, can upload),
 * else the API key (public uploads only).
 */
export async function youtubeAuth(event?: H3Event): Promise<YouTubeAuth> {
  const cfg = useRuntimeConfig(event)
  if (cfg.youtubeClientId && cfg.youtubeClientSecret && cfg.youtubeRefreshToken) {
    return { token: await accessToken(cfg.youtubeClientId, cfg.youtubeClientSecret, cfg.youtubeRefreshToken) }
  }
  if (cfg.youtubeApiKey) return { key: cfg.youtubeApiKey }
  throw createError({ statusCode: 500, statusMessage: 'Neither YouTube OAuth (YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN) nor YOUTUBE_API_KEY is set' })
}

/**
 * Pulls the channel's uploads into `matches`, one row per video.
 *
 * Idempotent: existing rows keep everything an admin can edit. The only
 * columns touched on a known video are the ones YouTube owns: thumbnail,
 * duration and `youtube_title`. Refreshing them is also what keeps stored
 * YouTube data within the API policy's 30 days (the daily cron runs this
 * with `refreshOnly`). Private uploads are skipped unless listed in
 * `include` (an upload of ours still locked private).
 */
export async function importChannel(opts: {
  event?: H3Event
  /** The admin's client, or the service role for the cron. */
  client: Awaited<ReturnType<typeof requireAdmin>>['client']
  userId: string | null
  include?: string[]
  refreshOnly?: boolean
}) {
  const { client, userId, include = [], refreshOnly = false } = opts
  const { youtubeChannelHandle } = useRuntimeConfig(opts.event)

  let channelId: string
  let videos: Awaited<ReturnType<typeof listPlaylistVideos>>
  try {
    const auth = await youtubeAuth(opts.event)
    const channel = await resolveUploadsPlaylist(youtubeChannelHandle, auth)
    channelId = channel.channelId
    videos = await listPlaylistVideos(channel.uploadsPlaylistId, auth)
    await attachDetails(videos, auth)
    // Private uploads (drafts, still processing) are not ready to show.
    videos = videos.filter(v => v.privacy !== 'private' || include.includes(v.videoId))
  }
  catch (cause) {
    // Quota exhaustion and a bad key both surface here; pass the reason through.
    throw createError({
      statusCode: 502,
      statusMessage: `YouTube API request failed: ${(cause as { data?: { error?: { message?: string } } })?.data?.error?.message ?? (cause as Error).message}`,
    })
  }

  const { data: existing } = await client
    .from('matches')
    .select('id, youtube_video_id, youtube_channel_id, youtube_title, youtube_thumbnail_url, youtube_duration_seconds')
    .not('youtube_video_id', 'is', null)

  // OAuth imports whatever channel gave consent (personal vs brand account):
  // refuse one the library has never seen rather than mix in its uploads.
  const ours = existing?.find(r => r.youtube_channel_id)?.youtube_channel_id
  if (ours && ours !== channelId) {
    throw createError({
      statusCode: 409,
      statusMessage: `The YouTube token is for channel ${channelId}, not ${ours}: redo the OAuth consent on the right channel`,
    })
  }
  const known = new Map((existing ?? []).map(r => [r.youtube_video_id!, r]))

  // Only rows whose YouTube data moved; a null from YouTube never wipes a value.
  const stale = videos.flatMap((v) => {
    const row = known.get(v.videoId)
    if (!row) return []
    const thumb = v.thumbnailUrl ?? row.youtube_thumbnail_url
    const duration = v.durationSeconds ?? row.youtube_duration_seconds
    const title = v.title || row.youtube_title
    return thumb !== row.youtube_thumbnail_url || duration !== row.youtube_duration_seconds
      || title !== row.youtube_title
      ? [{ id: row.id, youtube_title: title, youtube_thumbnail_url: thumb, youtube_duration_seconds: duration }]
      : []
  })
  for (const { id, ...patch } of stale) {
    const { error } = await client.from('matches').update(patch).eq('id', id)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }
  const fresh = refreshOnly ? [] : videos.filter(v => !known.has(v.videoId))

  if (fresh.length) {
    // Almost every recording is a free-play session, and a video that arrives
    // without a type prints nothing above the player and has to be fixed by hand.
    const { data: freePlay } = await client.from('match_types').select('id').eq('slug', 'free-play').maybeSingle()
    const { error } = await client.from('matches').insert(
      fresh.map(v => ({
        title: v.title,
        played_on: v.publishedAt.slice(0, 10),
        youtube_video_id: v.videoId,
        youtube_channel_id: channelId,
        youtube_title: v.title,
        video_kind: videoKindOf(v.title, v.privacy),
        // The raw match goes up unlisted and is the one whose timestamps the
        // tags use: the scoreboard is on for it, off for everything else.
        show_scoreboard: v.privacy === 'unlisted',
        youtube_published_at: v.publishedAt,
        youtube_thumbnail_url: v.thumbnailUrl,
        youtube_duration_seconds: v.durationSeconds,
        imported_at: new Date().toISOString(),
        // Lands visible and untagged; the admin hides the odd one by hand.
        visibility: 'public',
        tagging_status: 'untagged',
        match_type_id: freePlay?.id ?? null,
        created_by: userId,
      })),
    )
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    channelId,
    found: videos.length,
    imported: fresh.length,
    skipped: videos.length - fresh.length,
    refreshed: stale.length,
  }
}
