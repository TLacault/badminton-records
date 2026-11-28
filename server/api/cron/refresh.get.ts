import type { Database } from '~/types/database.types'
import { serverSupabaseServiceRole } from '#supabase/server'
import { importChannel } from '../../utils/channelImport'

/**
 * Daily (vercel.json crons): re-reads the channel and refreshes the YouTube
 * data stored on each video (title, thumbnail, duration). YouTube's API
 * policy allows keeping that data 30 days unless it is refreshed. Refresh
 * only: new uploads still come in through the admin import.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; nothing else gets in.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET
  if (!secret || getHeader(event, 'authorization') !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const client = serverSupabaseServiceRole<Database>(event)
  return importChannel({ event, client, userId: null, refreshOnly: true })
})
