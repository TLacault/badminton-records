import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Thumbnail templates Tim has made: every PNG in brand/thumbnail/ but the bare photo. */
export default defineEventHandler(async () => {
  try {
    const files = await readdir(join(process.cwd(), 'brand', 'thumbnail'))
    return files.filter(f => /^[\w-]+\.png$/.test(f) && f !== 'background.png').sort()
  }
  catch {
    return []
  }
})
