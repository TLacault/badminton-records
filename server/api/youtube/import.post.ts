import { requireAdmin } from '../../utils/auth'
import {
  accessToken,
  attachDetails,
  listPlaylistVideos,
  resolveUploadsPlaylist,
  videoKindOf,
} from '../../utils/youtube'

/**
 * Pulls the channel's uploads into `matches`, one row per video.
 *
 * Idempotent: existing rows keep everything an admin can edit. Re-running
 * after a match was retitled or tagged must not clobber that, so the only
 * columns touched on a known video are the ones YouTube owns: the thumbnail
 * and duration (filled in late while a video processes) and `youtube_title`
 * (renamed by the publish flow). The admin's own `title` is never touched.
 * The unique index on `youtube_video_id` is the insert backstop.
 */
export default defineEventHandler(async (event) => {
  const { client, userId } = await requireAdmin(event)

  const cfg = useRuntimeConfig(event)
  const { youtubeApiKey, youtubeChannelHandle } = cfg
  const oauth = cfg.youtubeClientId && cfg.youtubeClientSecret && cfg.youtubeRefreshToken
  if (!oauth && !youtubeApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Neither YouTube OAuth (YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN) nor YOUTUBE_API_KEY is set',
    })
  }

  let channelId: string
  let videos: Awaited<ReturnType<typeof listPlaylistVideos>>
  try {
    const auth = oauth
      ? { token: await accessToken(cfg.youtubeClientId, cfg.youtubeClientSecret, cfg.youtubeRefreshToken) }
      : { key: youtubeApiKey }
    const channel = await resolveUploadsPlaylist(youtubeChannelHandle, auth)
    channelId = channel.channelId
    videos = await listPlaylistVideos(channel.uploadsPlaylistId, auth)
    await attachDetails(videos, auth)
    // OAuth also lists private uploads (drafts, still processing): those are not
    // ready to show. A private one already imported keeps its row untouched.
    videos = videos.filter(v => v.privacy !== 'private')
  }
  catch (cause) {
    // Quota exhaustion and a bad key both surface here; pass the reason through
    // rather than a bare 500, because the fix differs.
    throw createError({
      statusCode: 502,
      statusMessage: `YouTube API request failed: ${(cause as Error).message}`,
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

  const fresh = videos.filter(v => !known.has(v.videoId))

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

  // Almost every recording is a free-play session, and a video that arrives
  // without a type prints nothing above the player and has to be fixed by hand.
  const { data: freePlay } = await client
    .from('match_types')
    .select('id')
    .eq('slug', 'free-play')
    .maybeSingle()

  if (fresh.length) {
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
        // The video is already public on YouTube, so hiding it here protected
        // nothing and made every import a two-step chore. It lands visible and
        // untagged; the admin hides the odd one by hand.
        visibility: 'public',
        tagging_status: 'untagged',
        match_type_id: freePlay?.id ?? null,
        created_by: userId,
      })),
    )
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  return {
    channelId,
    found: videos.length,
    imported: fresh.length,
    skipped: videos.length - fresh.length,
    refreshed: stale.length,
  }
})
