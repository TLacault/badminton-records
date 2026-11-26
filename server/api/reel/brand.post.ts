import type { ReelBrand } from '~~/shared/reel'
import { requireAdmin } from '../../utils/auth'
import { hasHyperframes, reelBrand, sanitiseBrand } from '../../utils/publish'

/**
 * Draws (or finds in the cache) the vertical frame, intro and outro for a
 * match, so the preview shows what the render will. Local only, like the render.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const brand = sanitiseBrand(await readBody<Partial<ReelBrand>>(event))
  if (!brand) throw createError({ statusCode: 400, statusMessage: 'No branding text' })
  if (!(await hasHyperframes())) throw createError({ statusCode: 501, statusMessage: 'This host has no HyperFrames CLI' })
  const { frame, intro, outro } = await reelBrand(brand)
  return { frame, intro, outro }
})
