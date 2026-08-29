import { getJob } from '../../../utils/reel'

/** The ticket a download or a render was started under. Polled, not streamed. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const job = getJob(id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'No such job' })
  return job
})
