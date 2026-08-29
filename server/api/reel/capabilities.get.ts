import { capabilities } from '../../utils/reel'

/**
 * What this host can actually do for a reel.
 *
 * The editor asks once on load and shapes itself around the answer: a Vercel
 * deployment has neither yt-dlp nor ffmpeg, so it offers the YouTube preview
 * and the project file, and says plainly that rendering happens where the
 * binaries are. Guessing at that in the UI — or discovering it at the end of a
 * twelve-minute export — would be much worse than asking.
 */
export default defineEventHandler(async () => {
  return await capabilities()
})
