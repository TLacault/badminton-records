import type { Orientation, ReelBrand } from '~~/shared/reel'
import { requireAdmin } from '../../utils/auth'
import { hasHyperframes, reelBrand, sanitiseBrand } from '../../utils/publish'

/**
 * Draws (or finds in the cache) a match's clip intro, outro and (portrait)
 * frame, so the preview shows what the render will. Local only, like the render.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<Partial<ReelBrand> & { orientation?: Orientation }>(event)
  const brand = sanitiseBrand(body)
  if (!brand) throw createError({ statusCode: 400, statusMessage: 'No branding text' })
  if (!(await hasHyperframes())) throw createError({ statusCode: 501, statusMessage: 'This host has no HyperFrames CLI' })
  const { frame, intro, outro } = await reelBrand(brand, body?.orientation === 'landscape' ? 'landscape' : 'portrait')
  return { frame, intro, outro }
})
