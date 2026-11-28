import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { requireAdmin } from '../../../../utils/auth'
import { uploadFolder } from '../../../../utils/uploadFolder'

/** Opens the upload folder in the file manager of the machine running the app (local only). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { dir } = uploadFolder(getRouterParam(event, 'matchId'), getRouterParam(event, 'kind'))
  await stat(dir).catch(() => {
    throw createError({ statusCode: 404, statusMessage: 'Nothing rendered for this video yet' })
  })
  const open = (cmd: string) => new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, [dir], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
  try {
    await open('nautilus')
  }
  catch {
    await open('xdg-open').catch(() => {
      throw createError({ statusCode: 501, statusMessage: 'No file manager on this host' })
    })
  }
  return { dir }
})
