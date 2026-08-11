import { requireAdmin } from '../../utils/auth'
import {
  attachDurations,
  listPlaylistVideos,
  resolveUploadsPlaylist,
} from '../../utils/youtube'

/**
 * Pulls the channel's uploads into `matches`, one row per video.
 *
 * Idempotent: existing rows are left completely alone. Re-running after an
 * admin has retitled a match or started tagging it must not clobber that, so
 * this only ever inserts video ids it does not already hold — the unique index
 * on `youtube_video_id` is the backstop.
 */
export default defineEventHandler(async (event) => {
  const { client, userId } = await requireAdmin(event)

  const { youtubeApiKey, youtubeChannelHandle } = useRuntimeConfig(event)
  if (!youtubeApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'YOUTUBE_API_KEY is not set',
    })
  }

  let channelId: string
  let videos: Awaited<ReturnType<typeof listPlaylistVideos>>
  try {
    const channel = await resolveUploadsPlaylist(youtubeChannelHandle, youtubeApiKey)
    channelId = channel.channelId
    videos = await listPlaylistVideos(channel.uploadsPlaylistId, youtubeApiKey)
    await attachDurations(videos, youtubeApiKey)
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
    .select('youtube_video_id')
    .not('youtube_video_id', 'is', null)
  const known = new Set((existing ?? []).map(r => r.youtube_video_id))

  const fresh = videos.filter(v => !known.has(v.videoId))

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
  }
})
