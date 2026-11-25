import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

/**
 * Serves the brand kit the editor needs (thumbnail templates, the band font)
 * straight from brand/, so the PNGs are not copied into public/ and deployed.
 * Only these two folders, only these file types.
 */
const ROOT = join(process.cwd(), 'brand')
const ALLOWED = /^(thumbnail\/[\w-]+\.png|fonts\/[\w-]+\.ttf)$/
const TYPES: Record<string, string> = { png: 'image/png', ttf: 'font/ttf' }

export default defineEventHandler(async (event) => {
  const rel = normalize(getRouterParam(event, 'path') ?? '')
  if (!ALLOWED.test(rel)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  try {
    const file = await readFile(join(ROOT, rel))
    setHeader(event, 'Content-Type', TYPES[rel.split('.').pop()!]!)
    setHeader(event, 'Cache-Control', 'no-cache')
    return file
  }
  catch {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
})
