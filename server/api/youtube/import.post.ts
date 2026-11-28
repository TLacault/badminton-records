import { requireAdmin } from '../../utils/auth'
import { importChannel } from '../../utils/channelImport'

/**
 * Pulls the channel's uploads into `matches` (see importChannel). `include`
 * lets an upload of ours that YouTube still holds private come in anyway.
 */
export default defineEventHandler(async (event) => {
  const { client, userId } = await requireAdmin(event)
  const body = await readBody<{ include?: unknown } | null>(event).catch(() => null)
  const include = Array.isArray(body?.include) ? body.include.map(String).filter(id => /^[\w-]{11}$/.test(id)).slice(0, 10) : []
  return importChannel({ event, client, userId, include })
})
